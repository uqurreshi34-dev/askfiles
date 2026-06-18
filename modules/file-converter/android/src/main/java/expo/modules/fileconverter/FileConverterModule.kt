package expo.modules.fileconverter

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream

class FileConverterModule : Module() {

    override fun definition() = ModuleDefinition {
        Name("FileConverter")

        AsyncFunction("convertImage") { inputPath: String, outputPath: String, format: String, quality: Int ->
            val outFile = File(outputPath)
            outFile.parentFile?.mkdirs()

            // First pass — get dimensions without loading pixels
            val opts = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeFile(inputPath, opts)

            if (opts.outWidth <= 0 || opts.outHeight <= 0) {
                throw Exception("Could not read image dimensions — file may be corrupt or unsupported.")
            }

            // Calculate inSampleSize to keep under 8MP (2992×2992)
            val maxPixels = 8_000_000
            var sampleSize = 1
            val pixels = opts.outWidth.toLong() * opts.outHeight.toLong()
            while ((pixels / (sampleSize * sampleSize)) > maxPixels) {
                sampleSize *= 2
            }

            // Second pass — decode with sampling
            val decodeOpts = BitmapFactory.Options().apply {
                inSampleSize = sampleSize
                inPreferredConfig = Bitmap.Config.RGB_565 // lower memory than ARGB_8888
            }

            val rawBitmap = BitmapFactory.decodeFile(inputPath, decodeOpts)
                ?: throw Exception("Could not decode image. The format may not be supported on this device.")

            // Correct rotation from EXIF
            val bitmap = try {
                val exif = android.media.ExifInterface(inputPath)
                val rotation = exif.getAttributeInt(
                    android.media.ExifInterface.TAG_ORIENTATION,
                    android.media.ExifInterface.ORIENTATION_NORMAL
                )
                val degrees = when (rotation) {
                    android.media.ExifInterface.ORIENTATION_ROTATE_90 -> 90f
                    android.media.ExifInterface.ORIENTATION_ROTATE_180 -> 180f
                    android.media.ExifInterface.ORIENTATION_ROTATE_270 -> 270f
                    else -> 0f
                }
                if (degrees != 0f) {
                    val matrix = android.graphics.Matrix()
                    matrix.postRotate(degrees)
                    val rotated = android.graphics.Bitmap.createBitmap(rawBitmap, 0, 0, rawBitmap.width, rawBitmap.height, matrix, true)
                    rawBitmap.recycle()
                    rotated
                } else {
                    rawBitmap
                }
            } catch (e: Exception) {
                rawBitmap // if EXIF read fails, use original
            }

            try {
                val compressFormat = when (format.uppercase()) {
                    "JPG", "JPEG" -> Bitmap.CompressFormat.JPEG
                    "PNG" -> Bitmap.CompressFormat.PNG
                    "WEBP" -> {
                        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
                            Bitmap.CompressFormat.WEBP_LOSSY
                        } else {
                            @Suppress("DEPRECATION")
                            Bitmap.CompressFormat.WEBP
                        }
                    }
                    else -> throw Exception("Unsupported output format: $format. Use JPG, PNG or WEBP.")
                }

                val clampedQuality = quality.coerceIn(1, 100)

                FileOutputStream(outFile).use { out ->
                    val success = bitmap.compress(compressFormat, clampedQuality, out)
                    if (!success) throw Exception("Compression failed — could not write output file.")
                    out.flush()
                }

                outputPath
            } finally {
                bitmap.recycle()
            }
        }

        // Get supported input formats on this device
        Function("getSupportedInputFormats") {
            val formats = mutableListOf("jpg", "jpeg", "png", "webp", "bmp", "gif")
            // HEIC requires Android 10+ (API 29+)
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
                formats.add("heic")
                formats.add("heif")
            }
            formats
        }
    }
}
