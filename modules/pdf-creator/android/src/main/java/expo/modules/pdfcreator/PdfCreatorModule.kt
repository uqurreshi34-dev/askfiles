package expo.modules.pdfcreator

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.graphics.pdf.PdfDocument
import android.media.MediaScannerConnection
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream
import androidx.exifinterface.media.ExifInterface

class PdfCreatorModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("PdfCreator")
    Events("onPageProcessed")

    AsyncFunction("createPdfFromImages") { imagePaths: List<String>, outputPath: String ->
      val context = appContext.reactContext!!
      val document = PdfDocument()

      try {
        imagePaths.forEachIndexed { index, path ->
          val options = BitmapFactory.Options().apply { inJustDecodeBounds = true }
          BitmapFactory.decodeFile(path, options)

          val maxDim = 2048
          var sampleSize = 1
          while (options.outWidth / sampleSize > maxDim || options.outHeight / sampleSize > maxDim) {
            sampleSize *= 2
          }

          val decodeOptions = BitmapFactory.Options().apply { inSampleSize = sampleSize }
          var bitmap = BitmapFactory.decodeFile(path, decodeOptions)
            ?: throw Exception("Could not decode image: $path")

            val exif = ExifInterface(path)
            val rotation = when (exif.getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
              ExifInterface.ORIENTATION_ROTATE_90 -> 90f
              ExifInterface.ORIENTATION_ROTATE_180 -> 180f
              ExifInterface.ORIENTATION_ROTATE_270 -> 270f
              else -> 0f
            }
            if (rotation != 0f) {
              val matrix = Matrix()
              matrix.postRotate(rotation)
              val rotated = Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
              bitmap.recycle()
              bitmap = rotated
            }

          // A4 at 72dpi: 595 x 842
          val pageWidth = 595
          val pageHeight = 842

          val bitmapWidth = bitmap.width.toFloat()
          val bitmapHeight = bitmap.height.toFloat()

          val scale = minOf(pageWidth / bitmapWidth, pageHeight / bitmapHeight)
          val scaledWidth = (bitmapWidth * scale).toInt()
          val scaledHeight = (bitmapHeight * scale).toInt()

          val scaled = Bitmap.createScaledBitmap(bitmap, scaledWidth, scaledHeight, true)
          bitmap.recycle()

          val pageInfo = PdfDocument.PageInfo.Builder(pageWidth, pageHeight, index + 1).create()
          val page = document.startPage(pageInfo)

          val canvas = page.canvas
          val left = (pageWidth - scaledWidth) / 2f
          val top = (pageHeight - scaledHeight) / 2f
          canvas.drawBitmap(scaled, left, top, null)
          scaled.recycle()

          document.finishPage(page)
          sendEvent("onPageProcessed", mapOf("current" to index + 1, "total" to imagePaths.size))
        }

        val outFile = File(outputPath)
        outFile.parentFile?.mkdirs()
        FileOutputStream(outFile).use { document.writeTo(it) }

        MediaScannerConnection.scanFile(context, arrayOf(outputPath), arrayOf("application/pdf"), null)

        outputPath
      } finally {
        document.close()
      }
    }
  }
}
