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

    AsyncFunction("extractPdfPages") { pdfPath: String, outputDir: String ->
        val context = appContext.reactContext!!
        val pdfRenderer = android.graphics.pdf.PdfRenderer(
            android.os.ParcelFileDescriptor.open(
                java.io.File(pdfPath),
                android.os.ParcelFileDescriptor.MODE_READ_ONLY
            )
        )
        val outputPaths = mutableListOf<String>()
        val outDir = java.io.File(outputDir)
        outDir.mkdirs()

        try {
            val pageCount = pdfRenderer.pageCount
            for (i in 0 until pageCount) {
                val page = pdfRenderer.openPage(i)
                val scale = 2.0f
                val bitmap = Bitmap.createBitmap(
                    (page.width * scale).toInt(),
                    (page.height * scale).toInt(),
                    Bitmap.Config.ARGB_8888
                )
                // White background
                val canvas = android.graphics.Canvas(bitmap)
                canvas.drawColor(android.graphics.Color.WHITE)
                page.render(bitmap, null, null, android.graphics.pdf.PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                page.close()

                val outFile = java.io.File(outDir, "page_${i + 1}.png")
                java.io.FileOutputStream(outFile).use { out ->
                    bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
                }
                bitmap.recycle()
                outputPaths.add(outFile.absolutePath)
                sendEvent("onPageProcessed", mapOf("current" to i + 1, "total" to pageCount))

                MediaScannerConnection.scanFile(context, arrayOf(outFile.absolutePath), arrayOf("image/png"), null)
            }
        } finally {
            pdfRenderer.close()
        }
        outputPaths
    }

    AsyncFunction("mergePdfs") { pdfPaths: List<String>, outputPath: String ->
        val context = appContext.reactContext!!
        val merger = android.graphics.pdf.PdfDocument()
        var pageIndex = 1
        val total = pdfPaths.size

        try {
            for ((fileIndex, path) in pdfPaths.withIndex()) {
                val pdfRenderer = android.graphics.pdf.PdfRenderer(
                    android.os.ParcelFileDescriptor.open(
                        java.io.File(path),
                        android.os.ParcelFileDescriptor.MODE_READ_ONLY
                    )
                )
                try {
                    for (i in 0 until pdfRenderer.pageCount) {
                        val page = pdfRenderer.openPage(i)
                        val scale = 1.5f
                        val bitmap = Bitmap.createBitmap(
                            (page.width * scale).toInt(),
                            (page.height * scale).toInt(),
                            Bitmap.Config.ARGB_8888
                        )
                        val canvas = android.graphics.Canvas(bitmap)
                        canvas.drawColor(android.graphics.Color.WHITE)
                        page.render(bitmap, null, null, android.graphics.pdf.PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                        page.close()

                        val pageWidth = 595
                        val pageHeight = 842
                        val bitmapWidth = bitmap.width.toFloat()
                        val bitmapHeight = bitmap.height.toFloat()
                        val mergeScale = minOf(pageWidth / bitmapWidth, pageHeight / bitmapHeight)
                        val scaledWidth = (bitmapWidth * mergeScale).toInt()
                        val scaledHeight = (bitmapHeight * mergeScale).toInt()
                        val scaled = Bitmap.createScaledBitmap(bitmap, scaledWidth, scaledHeight, true)
                        bitmap.recycle()

                        val pageInfo = android.graphics.pdf.PdfDocument.PageInfo.Builder(pageWidth, pageHeight, pageIndex++).create()
                        val pdfPage = merger.startPage(pageInfo)
                        val mergeCanvas = pdfPage.canvas
                        mergeCanvas.drawColor(android.graphics.Color.WHITE)
                        val left = (pageWidth - scaledWidth) / 2f
                        val top = (pageHeight - scaledHeight) / 2f
                        mergeCanvas.drawBitmap(scaled, left, top, null)
                        scaled.recycle()
                        merger.finishPage(pdfPage)
                    }
                } finally {
                    pdfRenderer.close()
                }
                sendEvent("onPageProcessed", mapOf("current" to fileIndex + 1, "total" to total))
            }

            val outFile = java.io.File(outputPath)
            outFile.parentFile?.mkdirs()
            java.io.FileOutputStream(outFile).use { merger.writeTo(it) }
            MediaScannerConnection.scanFile(context, arrayOf(outputPath), arrayOf("application/pdf"), null)
            outputPath
        } finally {
            merger.close()
        }
    }
  }
}
