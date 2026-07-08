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

            // Clean up old pending PDF files
            ctx.cacheDir.listFiles { f -> f.name.startsWith("pending_import_") && f.name.endsWith(".pdf") }
                ?.forEach { it.delete() }

            val cacheFile = java.io.File(ctx.cacheDir, "pending_import_${System.currentTimeMillis()}.pdf")
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

        Function("getPendingIntentType") { ->
            val ctx = appContext.reactContext ?: return@Function null
            val prefs = ctx.getSharedPreferences("askfiles_prefs", android.content.Context.MODE_PRIVATE)
            val pdfUri = prefs.getString("pending_pdf_uri", null)
            val csvUri = prefs.getString("pending_csv_uri", null)
            val textUri = prefs.getString("pending_text_uri", null)
            when {
                pdfUri != null -> mapOf("type" to "pdf", "uri" to pdfUri)
                csvUri != null -> mapOf("type" to "csv", "uri" to csvUri)
                textUri != null -> mapOf("type" to "text", "uri" to textUri)
                else -> null
            }
        }

        Function("clearPendingIntent") { ->
            val ctx = appContext.reactContext ?: return@Function null
            ctx.getSharedPreferences("askfiles_prefs", android.content.Context.MODE_PRIVATE)
                .edit()
                .remove("pending_pdf_uri")
                .remove("pending_csv_uri")
                .remove("pending_text_uri")
                .apply()
            true
        }
    }
}
