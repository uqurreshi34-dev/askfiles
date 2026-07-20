package expo.modules.scanmodule

import android.app.Activity
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.pdf.PdfDocument
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.util.Log
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.IntentSenderRequest
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions
import com.google.mlkit.vision.documentscanner.GmsDocumentScanning
import com.google.mlkit.vision.documentscanner.GmsDocumentScanningResult
import com.google.mlkit.vision.label.ImageLabeling
import com.google.mlkit.vision.label.defaults.ImageLabelerOptions
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlin.coroutines.suspendCoroutine
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class ScanModule : Module() {

    private fun decodeScaledBitmap(path: String, maxDimension: Int = 2048): Bitmap? {
        val bounds = BitmapFactory.Options().apply {
            inJustDecodeBounds = true
        }

        BitmapFactory.decodeFile(path, bounds)

        var sample = 1
        while (
            bounds.outWidth / sample > maxDimension ||
            bounds.outHeight / sample > maxDimension
        ) {
            sample *= 2
        }

        val options = BitmapFactory.Options().apply {
            inSampleSize = sample
            inPreferredConfig = Bitmap.Config.ARGB_8888
        }

        return BitmapFactory.decodeFile(path, options)
    }

    companion object {
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
                promise.reject("NO_LAUNCHER", "Scanner not initialised", null)
                return@AsyncFunction
            }

            val options = GmsDocumentScannerOptions.Builder()
                .setGalleryImportAllowed(false)
                .setPageLimit(10)
                .setResultFormats(GmsDocumentScannerOptions.RESULT_FORMAT_JPEG)
                .setScannerMode(GmsDocumentScannerOptions.SCANNER_MODE_FULL)
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

            val pdf = PdfDocument()

            try {
                uris.forEachIndexed { index, uriString ->

                    val uri = Uri.parse(uriString)

                    val options = BitmapFactory.Options().apply {
                        inJustDecodeBounds = true
                    }

                    appContext.reactContext?.contentResolver
                        ?.openInputStream(uri)
                        ?.use { input ->
                            BitmapFactory.decodeStream(input, null, options)
                        }

                    var sample = 1

                    while (
                        options.outWidth / sample > 1600 ||
                        options.outHeight / sample > 1600
                    ) {
                        sample *= 2
                    }

                    val decodeOptions = BitmapFactory.Options().apply {
                        inSampleSize = sample
                        inPreferredConfig = Bitmap.Config.ARGB_8888
                    }

                    val bitmap = appContext.reactContext?.contentResolver
                        ?.openInputStream(uri)
                        ?.use { input ->
                            BitmapFactory.decodeStream(input, null, decodeOptions)
                        }
                        ?: return@forEachIndexed


                    val pageInfo = PdfDocument.PageInfo.Builder(
                        bitmap.width,
                        bitmap.height,
                        index + 1
                    ).create()

                    val page = pdf.startPage(pageInfo)

                    page.canvas.drawBitmap(bitmap, 0f, 0f, null)

                    pdf.finishPage(page)

                    bitmap.recycle()
                }

                FileOutputStream(destFile).use { out ->
                    pdf.writeTo(out)
                }

                android.media.MediaScannerConnection.scanFile(
                    appContext.reactContext,
                    arrayOf(destFile.absolutePath),
                    null,
                    null
                )

            } finally {
                pdf.close()
            }

            destFile.absolutePath
        }

        // OCR each saved JPG and return map of path -> extracted text
        // Runs on background coroutine — caller indexes into DocIndexer silently
        AsyncFunction("ocrScanPages") { paths: List<String>, promise: Promise ->
            val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
            val results = mutableMapOf<String, String>()

            CoroutineScope(Dispatchers.IO).launch {
                for (path in paths) {
                    try {
                        val file = File(path)
                        if (!file.exists()) continue

                        val bitmap = decodeScaledBitmap(path) ?: continue
                        val image = InputImage.fromBitmap(bitmap, 0)

                        val text = suspendCoroutine<String> { cont ->
                            recognizer.process(image)
                                .addOnSuccessListener { result ->
                                    bitmap.recycle()
                                    cont.resume(result.text.take(5000))
                                }
                                .addOnFailureListener { e ->
                                    bitmap.recycle()
                                    cont.resumeWithException(e)
                                }
                        }

                        if (text.isNotBlank()) {
                            results[path] = text
                        }
                    } catch (e: Exception) {
                        Log.e("ScanModule", "OCR failed for $path: ${e.message}")
                    }
                }

                recognizer.close()
                promise.resolve(results)
            }
        }

        AsyncFunction("extractTextFromImage") { path: String, promise: Promise ->
            val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)

            CoroutineScope(Dispatchers.IO).launch {
                try {
                    val file = File(path)
                    if (!file.exists()) {
                        promise.reject("FILE_NOT_FOUND", "File not found: $path", null)
                        return@launch
                    }

                    val bitmap = decodeScaledBitmap(path)
                    if (bitmap == null) {
                        promise.reject("DECODE_FAILED", "Could not decode image", null)
                        return@launch
                    }

                    val image = InputImage.fromBitmap(bitmap, 0)

                    val text = suspendCoroutine<String> { cont ->
                        recognizer.process(image)
                            .addOnSuccessListener { result ->
                                bitmap.recycle()
                                cont.resume(result.text)
                            }
                            .addOnFailureListener { e ->
                                bitmap.recycle()
                                cont.resumeWithException(e)
                            }
                    }

                    recognizer.close()

                    if (text.isBlank()) {
                        promise.resolve("")
                    } else {
                        promise.resolve(text)
                    }
                } catch (e: Exception) {
                    recognizer.close()
                    promise.reject("OCR_FAILED", e.message ?: "OCR failed", e)
                }
            }
        }

        AsyncFunction("extractVideoFrames") { videoPath: String, frameCount: Int, promise: Promise ->
            CoroutineScope(Dispatchers.IO).launch {
                val retriever = MediaMetadataRetriever()
                try {
                    retriever.setDataSource(videoPath)

                    val durationMs = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0L
                    val cacheDir = appContext.reactContext?.cacheDir ?: throw Exception("No cache dir")
                    val results = mutableListOf<Map<String, Any>>()

                    for (i in 0 until frameCount) {
                        val timeUs = ((durationMs * 1000L) / frameCount) * i + ((durationMs * 1000L) / frameCount / 2)
                        val raw = retriever.getFrameAtTime(timeUs, MediaMetadataRetriever.OPTION_CLOSEST_SYNC)
                            ?: continue

                        val bitmap = if (raw.width > 640) {
                            val scale = 640f / raw.width
                            Bitmap.createScaledBitmap(raw, 640, (raw.height * scale).toInt(), true)
                                .also { raw.recycle() }
                        } else raw

                        val outFile = File(cacheDir, "vframe_${System.currentTimeMillis()}_$i.jpg")
                        java.io.FileOutputStream(outFile).use { out ->
                            bitmap.compress(Bitmap.CompressFormat.JPEG, 80, out)
                        }
                        bitmap.recycle()

                        results.add(mapOf(
                            "path" to outFile.absolutePath,
                            "timestampMs" to (timeUs / 1000L)
                        ))
                    }

                    retriever.release()
                    promise.resolve(results)
                } catch (e: Exception) {
                    retriever.release()
                    promise.reject("FRAME_EXTRACT_FAILED", e.message ?: "Failed to extract frames", e)
                }
            }
        }

        AsyncFunction("labelImage") { imagePath: String, promise: Promise ->
            CoroutineScope(Dispatchers.IO).launch {
                try {
                    val bitmap = decodeScaledBitmap(imagePath)
                        ?: throw Exception("Could not decode image")
                    val image = InputImage.fromBitmap(bitmap, 0)
                    val options = ImageLabelerOptions.Builder()
                        .setConfidenceThreshold(0.65f)
                        .build()
                    val labeler = ImageLabeling.getClient(options)

                    val labels = suspendCoroutine<List<String>> { cont ->
                        labeler.process(image)
                            .addOnSuccessListener { result ->
                                bitmap.recycle()
                                val texts = result.map { label -> label.text }
                                cont.resume(texts)
                            }
                            .addOnFailureListener { e ->
                                bitmap.recycle()
                                cont.resumeWithException(e)
                            }
                    }

                    labeler.close()
                    promise.resolve(labels)
                } catch (e: Exception) {
                    promise.reject("LABEL_FAILED", e.message ?: "Labelling failed", e)
                }
            }
        }
    }
}
