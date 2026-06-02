package expo.modules.scanmodule

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.util.Log
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.IntentSenderRequest
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions
import com.google.mlkit.vision.documentscanner.GmsDocumentScanning
import com.google.mlkit.vision.documentscanner.GmsDocumentScanningResult
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream

class ScanModule : Module() {

    companion object {
        // Shared launcher registered by MainActivity via app.plugin.js
        var scanLauncher: ActivityResultLauncher<IntentSenderRequest>? = null
        var pendingPromise: Promise? = null

        fun handleActivityResult(result: androidx.activity.result.ActivityResult) {
            val promise = pendingPromise ?: return
            pendingPromise = null

            if (result.resultCode == Activity.RESULT_OK) {
                val scanResult = GmsDocumentScanningResult.fromActivityResultIntent(result.data)
                val pages = scanResult?.pages
                if (pages.isNullOrEmpty()) {
                    promise.reject("SCAN_EMPTY", "No pages returned from scanner", null)
                    return
                }
                // Resolve with list of content:// URIs — caller saves them
                promise.resolve(pages.map { it.imageUri.toString() })
            } else if (result.resultCode == Activity.RESULT_CANCELED) {
                promise.reject("SCAN_CANCELLED", "User cancelled scan", null)
            } else {
                promise.reject("SCAN_FAILED", "Scanner returned unknown result", null)
            }
        }
    }

    override fun definition() = ModuleDefinition {
        Name("ScanModule")

        AsyncFunction("scanDocument") { promise: Promise ->
            val activity = appContext.currentActivity
            if (activity == null) {
                promise.reject("NO_ACTIVITY", "No activity available", null)
                return@AsyncFunction
            }

            val launcher = scanLauncher
            if (launcher == null) {
                promise.reject("NO_LAUNCHER", "Scanner not initialised — ensure app.plugin.js patch is applied", null)
                return@AsyncFunction
            }

            // Build scanner options
            val options = GmsDocumentScannerOptions.Builder()
                .setGalleryImportAllowed(false)
                .setPageLimit(10) // up to 10 pages per scan session
                .setResultFormats(GmsDocumentScannerOptions.RESULT_FORMAT_JPEG) // we convert to PNG ourselves
                .setScannerMode(GmsDocumentScannerOptions.SCANNER_MODE_FULL) // full mode = edge detection + perspective correction
                .build()

            val scanner = GmsDocumentScanning.getClient(options)

            pendingPromise = promise

            scanner.getStartScanIntent(activity)
                .addOnSuccessListener { intentSender ->
                    launcher.launch(IntentSenderRequest.Builder(intentSender).build())
                }
                .addOnFailureListener { e ->
                    pendingPromise = null
                    promise.reject("SCAN_INIT_FAILED", e.message ?: "Failed to start scanner", e)
                }
        }

        AsyncFunction("saveScanPages") { uris: List<String>, folderPath: String ->
            // Ensure Scans folder exists
            val scansDir = File(folderPath)
            scansDir.mkdirs()

            val timestamp = System.currentTimeMillis()
            val savedPaths = mutableListOf<String>()

            uris.forEachIndexed { index, uriString ->
                val uri = Uri.parse(uriString)
                val suffix = if (uris.size > 1) "_${index + 1}" else ""
                val destFile = File(scansDir, "Scan_${timestamp}${suffix}.jpg")

                try {
                    appContext.reactContext?.contentResolver?.openInputStream(uri)?.use { input ->
                        FileOutputStream(destFile).use { output ->
                            input.copyTo(output)
                        }
                    }
                    // Trigger MediaStore scan so file appears in gallery/documents
                    android.media.MediaScannerConnection.scanFile(
                        appContext.reactContext,
                        arrayOf(destFile.absolutePath),
                        null, null
                    )
                    savedPaths.add(destFile.absolutePath)
                } catch (e: Exception) {
                    Log.e("ScanModule", "Failed to save page $index: ${e.message}")
                }
            }

            savedPaths
        }

        AsyncFunction("saveScanAsPdf") { uris: List<String>, folderPath: String ->
            val scansDir = File(folderPath)
            scansDir.mkdirs()

            val timestamp = System.currentTimeMillis()
            val destFile = File(scansDir, "Scan_${timestamp}.pdf")

            val pdf = android.graphics.pdf.PdfDocument()
            try {
                uris.forEachIndexed { index, uriString ->
                    val uri = Uri.parse(uriString)
                    val bitmap = android.graphics.BitmapFactory.decodeStream(
                        appContext.reactContext?.contentResolver?.openInputStream(uri)
                    ) ?: return@forEachIndexed

                    val pageInfo = android.graphics.pdf.PdfDocument.PageInfo.Builder(
                        bitmap.width, bitmap.height, index + 1
                    ).create()
                    val page = pdf.startPage(pageInfo)
                    page.canvas.drawBitmap(bitmap, 0f, 0f, null)
                    pdf.finishPage(page)
                    bitmap.recycle() // immediately free — never accumulate
                }

                FileOutputStream(destFile).use { out ->
                    pdf.writeTo(out)
                }

                android.media.MediaScannerConnection.scanFile(
                    appContext.reactContext,
                    arrayOf(destFile.absolutePath),
                    null, null
                )
            } finally {
                pdf.close()
            }

            destFile.absolutePath
        }
    }
}
