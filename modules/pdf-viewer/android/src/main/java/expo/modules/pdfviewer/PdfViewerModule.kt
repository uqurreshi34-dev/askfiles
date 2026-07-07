package expo.modules.pdfviewer

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class PdfViewerModule : Module() {
    override fun definition() = ModuleDefinition {
        Name("PdfViewer")

        View(PdfViewerView::class) {
            Prop("uri") { view: PdfViewerView, uri: String ->
                view.loadPdf(uri)
            }
            Prop("page") { view: PdfViewerView, page: Int ->
                view.goToPage(page)
            }
            Events("onPageCount")
        }

        AsyncFunction("resolveContentUri") { uriString: String ->
            val ctx = appContext.reactContext ?: return@AsyncFunction null
            val uri = android.net.Uri.parse(uriString)

            var displayName = "document.pdf"
            ctx.contentResolver.query(uri, arrayOf(android.provider.OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
                if (cursor.moveToFirst()) {
                    val col = cursor.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
                    if (col >= 0) displayName = cursor.getString(col)
                }
            }

            val cacheFile = java.io.File(ctx.cacheDir, "pending_import.pdf")
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
    }
}
