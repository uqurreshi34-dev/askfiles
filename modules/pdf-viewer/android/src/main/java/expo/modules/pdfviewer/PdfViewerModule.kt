package expo.modules.pdfviewer

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import android.util.Base64
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

class PdfViewerModule : Module() {

    private val thumbExecutor = Executors.newSingleThreadExecutor()
    private var thumbRendererPath: String? = null
    private var thumbRenderer: PdfRenderer? = null
    private val thumbCache = LinkedHashMap<String, String>(35, 0.75f, true)
    private val THUMB_MAX_CACHED = 30
    private val THUMB_WIDTH_PX = 400

    // Extracted as a real Kotlin function so return values work cleanly —
    // return@lambda inside submit{} doesn't propagate to AsyncFunction correctly.
    private fun renderThumbSync(filePath: String, pageIndex: Int, cacheKey: String): String? {
        return try {
            android.util.Log.d("PdfThumb", "rendering page=$pageIndex exists=${File(filePath).exists()}")

            if (thumbRendererPath != filePath) {
                thumbRenderer?.close()
                thumbRenderer = null
                thumbRendererPath = null
                val fd = ParcelFileDescriptor.open(
                    File(filePath), ParcelFileDescriptor.MODE_READ_ONLY
                )
                thumbRenderer = PdfRenderer(fd)
                thumbRendererPath = filePath
            }

            val renderer = thumbRenderer ?: return null
            if (pageIndex < 0 || pageIndex >= renderer.pageCount) return null

            val page = renderer.openPage(pageIndex)
            try {
                val thumbW = THUMB_WIDTH_PX
                val thumbH = if (page.width > 0)
                    (page.height.toFloat() / page.width * thumbW).toInt()
                else
                    (thumbW * 1.414f).toInt()

                val bitmap = try {
                    Bitmap.createBitmap(
                        thumbW.coerceAtLeast(1),
                        thumbH.coerceAtLeast(1),
                        Bitmap.Config.ARGB_8888
                    )
                } catch (oom: OutOfMemoryError) {
                    return null
                }

                val canvas = Canvas(bitmap)
                canvas.drawColor(Color.WHITE)
                page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)

                val stream = ByteArrayOutputStream()
                bitmap.compress(Bitmap.CompressFormat.JPEG, 75, stream)
                bitmap.recycle()

                val base64 = Base64.encodeToString(stream.toByteArray(), Base64.NO_WRAP)

                synchronized(thumbCache) {
                    if (thumbCache.size >= THUMB_MAX_CACHED) {
                        val oldest = thumbCache.entries.iterator().next()
                        thumbCache.remove(oldest.key)
                    }
                    thumbCache[cacheKey] = base64
                }

                base64
            } finally {
                page.close()
            }
        } catch (e: Exception) {
            android.util.Log.e("PdfThumb", "FAILED page=$pageIndex: ${e.message}")
            null
        }
    }

    override fun definition() = ModuleDefinition {
        Name("PdfViewer")

        View(PdfViewerView::class) {
            Prop("uri") { view: PdfViewerView, uri: String ->
                view.loadPdf(uri)
            }
            Prop("page") { view: PdfViewerView, page: Int ->
                view.goToPage(page)
            }
            Events("onPageCount", "onPageChange")
        }

        AsyncFunction("renderThumbnail") { filePath: String, pageIndex: Int ->
            val cacheKey = "$filePath:$pageIndex"

            synchronized(thumbCache) {
                val cached = thumbCache[cacheKey]
                if (cached != null) return@AsyncFunction cached
            }

            // submit to single-thread executor to serialize PdfRenderer access
            // (PdfRenderer is not thread-safe). AsyncFunction runs off the main
            // thread so .get() blocking here is safe.
            thumbExecutor.submit<String?> {
                renderThumbSync(filePath, pageIndex, cacheKey)
            }.get(10, TimeUnit.SECONDS)
        }

        AsyncFunction("resolveContentUri") { uriString: String ->
            val ctx = appContext.reactContext ?: return@AsyncFunction null
            val uri = android.net.Uri.parse(uriString)

            var displayName = "document.pdf"
            ctx.contentResolver.query(
                uri,
                arrayOf(android.provider.OpenableColumns.DISPLAY_NAME),
                null, null, null
            )?.use { cursor ->
                if (cursor.moveToFirst()) {
                    val col = cursor.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
                    if (col >= 0) displayName = cursor.getString(col)
                }
            }

            ctx.cacheDir.listFiles { f ->
                f.name.startsWith("pending_import_") && f.name.endsWith(".pdf")
            }?.forEach { it.delete() }

            val cacheFile = java.io.File(
                ctx.cacheDir, "pending_import_${System.currentTimeMillis()}.pdf"
            )
            ctx.contentResolver.openInputStream(uri)?.use { input ->
                cacheFile.outputStream().buffered(65536).use { output ->
                    val buffer = ByteArray(65536)
                    var bytesRead: Int
                    while (input.read(buffer).also { bytesRead = it } != -1) {
                        output.write(buffer, 0, bytesRead)
                    }
                    output.flush()
                }
            }
            mapOf("path" to cacheFile.absolutePath, "name" to displayName)
        }

        OnDestroy {
            thumbExecutor.shutdown()
            thumbRenderer?.close()
            thumbRenderer = null
            synchronized(thumbCache) { thumbCache.clear() }
        }
    }
}
