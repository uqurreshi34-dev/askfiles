package expo.modules.fileconverter

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import androidx.exifinterface.media.ExifInterface
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

        AsyncFunction("annotateImage") { inputPath: String, outputPath: String, annotations: List<Map<String, Any?>> ->
            val src = java.io.File(inputPath)
            if (!src.exists()) throw Exception("Source image not found")

            // Read dimensions before allocating anything
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeFile(inputPath, bounds)
            if (bounds.outWidth <= 0 || bounds.outHeight <= 0) throw Exception("Not a readable image")

            // Full resolution unless it would exceed the memory budget.
            // ARGB_8888 is 4 bytes per pixel; 16MP ≈ 64MB.
            val maxPixels = 16_000_000L
            var sampleSize = 1
            var pixels = bounds.outWidth.toLong() * bounds.outHeight.toLong()
            while (pixels / (sampleSize.toLong() * sampleSize.toLong()) > maxPixels) sampleSize *= 2
            val downsampled = sampleSize > 1

            val decodeOpts = BitmapFactory.Options().apply {
                inSampleSize = sampleSize
                inPreferredConfig = Bitmap.Config.ARGB_8888  // no colour loss
                inMutable = true                              // required to draw on
            }
            val decoded = BitmapFactory.decodeFile(inputPath, decodeOpts)
                ?: throw Exception("Could not decode image")

            // Apply EXIF orientation so annotations land where the user saw them
            val bitmap = try {
                val exif = ExifInterface(inputPath)
                val orientation = exif.getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
                val matrix = android.graphics.Matrix()
                when (orientation) {
                    ExifInterface.ORIENTATION_ROTATE_90 -> matrix.postRotate(90f)
                    ExifInterface.ORIENTATION_ROTATE_180 -> matrix.postRotate(180f)
                    ExifInterface.ORIENTATION_ROTATE_270 -> matrix.postRotate(270f)
                    else -> null
                }
                if (matrix.isIdentity) decoded else {
                    val rotated = Bitmap.createBitmap(decoded, 0, 0, decoded.width, decoded.height, matrix, true)
                    decoded.recycle()
                    rotated
                }
            } catch (e: Exception) { decoded }

            try {
                val canvas = android.graphics.Canvas(bitmap)
                for (a in annotations) {
                    val text = a["text"] as? String ?: continue
                    val xRatio = (a["x"] as? Number)?.toFloat() ?: continue
                    val yRatio = (a["y"] as? Number)?.toFloat() ?: continue
                    val sizeRatio = (a["sizeRatio"] as? Number)?.toFloat() ?: 0.06f
                    val colorStr = a["color"] as? String ?: "#FFFFFF"

                    val px = xRatio * bitmap.width
                    val py = yRatio * bitmap.height
                    val fontPx = sizeRatio * bitmap.width

                    // Outline behind the fill so light text stays legible on pale images
                    val stroke = android.graphics.Paint().apply {
                        isAntiAlias = true
                        textSize = fontPx
                        style = android.graphics.Paint.Style.STROKE
                        strokeWidth = fontPx * 0.11f
                        color = android.graphics.Color.BLACK
                        textAlign = android.graphics.Paint.Align.LEFT
                    }
                    val fill = android.graphics.Paint().apply {
                        isAntiAlias = true
                        textSize = fontPx
                        style = android.graphics.Paint.Style.FILL
                        color = try { android.graphics.Color.parseColor(colorStr) } catch (e: Exception) { android.graphics.Color.WHITE }
                        textAlign = android.graphics.Paint.Align.LEFT
                    }
                    fill.textAlign = android.graphics.Paint.Align.CENTER
                    stroke.textAlign = android.graphics.Paint.Align.CENTER
                    val fm = fill.fontMetrics
                    val baseline = py - (fm.ascent + fm.descent) / 2f
                    canvas.drawText(text, px, baseline, stroke)
                    canvas.drawText(text, px, baseline, fill)
                }

                // Match the source format; quality 100 for JPEG
                val ext = inputPath.substringAfterLast('.', "").lowercase()
                val format = when (ext) {
                    "png" -> Bitmap.CompressFormat.PNG
                    "webp" -> if (android.os.Build.VERSION.SDK_INT >= 30) Bitmap.CompressFormat.WEBP_LOSSLESS else @Suppress("DEPRECATION") Bitmap.CompressFormat.WEBP
                    else -> Bitmap.CompressFormat.JPEG
                }
                java.io.File(outputPath).parentFile?.mkdirs()
                java.io.FileOutputStream(outputPath).use { out ->
                    if (!bitmap.compress(format, 95, out)) throw Exception("Could not write image")
                }

                // Carry over the capture metadata the info sheet displays
                if (format == Bitmap.CompressFormat.JPEG) {
                    try {
                        val srcExif = ExifInterface(inputPath)
                        val dstExif = ExifInterface(outputPath)
                        listOf(
                            ExifInterface.TAG_DATETIME_ORIGINAL, ExifInterface.TAG_MAKE, ExifInterface.TAG_MODEL,
                            ExifInterface.TAG_PHOTOGRAPHIC_SENSITIVITY, ExifInterface.TAG_F_NUMBER,
                            ExifInterface.TAG_EXPOSURE_TIME, ExifInterface.TAG_GPS_LATITUDE,
                            ExifInterface.TAG_GPS_LATITUDE_REF, ExifInterface.TAG_GPS_LONGITUDE,
                            ExifInterface.TAG_GPS_LONGITUDE_REF,
                        ).forEach { tag ->
                            val v = srcExif.getAttribute(tag)
                            if (v != null) dstExif.setAttribute(tag, v)
                        }
                        dstExif.saveAttributes()
                    } catch (e: Exception) {
                    }
                }

                mapOf(
                    "width" to bitmap.width,
                    "height" to bitmap.height,
                    "downsampled" to downsampled
                )
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
