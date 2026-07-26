package com.askfiles.mobile.sharemodule

import android.content.ContentUris
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.MediaStore
import androidx.core.content.FileProvider
import android.graphics.BitmapFactory
import android.os.Bundle
import android.os.CancellationSignal
import android.os.ParcelFileDescriptor
import android.print.PrintAttributes
import android.print.PrintDocumentAdapter
import android.print.PrintDocumentInfo
import android.print.PrintManager
import androidx.print.PrintHelper
import androidx.exifinterface.media.ExifInterface
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream

class ShareModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ShareModule")

    AsyncFunction("shareFiles") { paths: List<String>, mimeType: String ->
      val activity = appContext.activityProvider?.currentActivity
        ?: throw Exception("No activity available")
      val context = appContext.reactContext!!

      val contentUris = ArrayList<Uri>()
      for (path in paths) {
        // Prefer a MediaStore URI when indexed — the share sheet can resolve a
        // thumbnail from it, where a FileProvider URI usually can't.
        val uri = getMediaStoreUri(context, path) ?: FileProvider.getUriForFile(
          context,
          "${context.packageName}.provider",
          File(path)
        )
        contentUris.add(uri)
      }

      val intent = if (contentUris.size == 1) {
        // Resolve a concrete type if the caller passed a wildcard — a preview
        // can't be rendered from "image/*".
        val resolved = if (mimeType.contains('*')) {
          val ext = paths[0].substringAfterLast('.', "").lowercase()
          android.webkit.MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext) ?: mimeType
        } else mimeType

        Intent(Intent.ACTION_SEND).apply {
          type = resolved
          putExtra(Intent.EXTRA_STREAM, contentUris[0])
          addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
      } else {
        Intent(Intent.ACTION_SEND_MULTIPLE).apply {
          type = "*/*"
          putParcelableArrayListExtra(Intent.EXTRA_STREAM, contentUris)
          addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
      }

      val chooser = Intent.createChooser(intent, "Share files")
      chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      activity.startActivity(chooser)
    }

    AsyncFunction("openFile") { filePath: String, mimeType: String ->
      val activity = appContext.activityProvider?.currentActivity
        ?: throw Exception("No activity available")

      val context = appContext.reactContext!!

      // 1. Try MediaStore first (instant — no copy needed)
      val mediaStoreUri = getMediaStoreUri(context, filePath)

      val uri: Uri
      val grantFlags: Int

      if (mediaStoreUri != null) {
        // MediaStore content:// URI — no FileProvider needed, system owns it
        uri = mediaStoreUri
        grantFlags = Intent.FLAG_GRANT_READ_URI_PERMISSION
      } else {
        // Fallback: FileProvider content:// URI (requires cache copy from JS side)
        val file = File(filePath)
        uri = FileProvider.getUriForFile(
          context,
          "${context.packageName}.provider",
          file
        )
        grantFlags = Intent.FLAG_GRANT_READ_URI_PERMISSION
      }

      val intent = Intent(Intent.ACTION_VIEW).apply {
        setDataAndType(uri, mimeType)
        addFlags(grantFlags)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }

      activity.startActivity(intent)
    }

    AsyncFunction("copyImageToClipboard") { filePath: String, mimeType: String ->
      val context = appContext.reactContext!!

      // Same URI strategy as openFile: MediaStore content:// if the image is
      // indexed (instant, no copy), else a FileProvider content:// URI. Either
      // way the receiving app reads the image from the URI — we never load the
      // bitmap into memory, so this is allocation-free regardless of image size.
      val mediaStoreUri = getMediaStoreUri(context, filePath)
      val uri: Uri = mediaStoreUri ?: FileProvider.getUriForFile(
        context,
        "${context.packageName}.provider",
        File(filePath)
      )

      val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE)
        as android.content.ClipboardManager

      // newUri sets the correct MIME type on the clip so receiving apps recognise
      // it as an image. The clip carries the read-permission grant for the
      // content:// URI to whichever app pastes it.
      val clip = android.content.ClipData.newUri(context.contentResolver, "Image", uri)
      clipboard.setPrimaryClip(clip)
    }

    AsyncFunction("scanFile") { filePath: String ->
      val context = appContext.reactContext!!
      android.media.MediaScannerConnection.scanFile(
        context,
        arrayOf(filePath),
        null,
        null
      )
    }

    AsyncFunction("printImage") { filePath: String ->
      val activity = appContext.activityProvider?.currentActivity
        ?: throw Exception("No activity available")
      val raw = decodeSampledBitmap(filePath)
        ?: throw Exception("Could not read image")
      val bitmap = applyExifOrientation(filePath, raw)
      val jobName = File(filePath).name
      activity.runOnUiThread {
        val printHelper = PrintHelper(activity)
        printHelper.scaleMode = PrintHelper.SCALE_MODE_FIT
        printHelper.printBitmap(jobName, bitmap)
      }
    }

    AsyncFunction("printPdf") { filePath: String ->
      val activity = appContext.activityProvider?.currentActivity
        ?: throw Exception("No activity available")
      val file = File(filePath)
      if (!file.exists()) throw Exception("File not found")
      val jobName = file.name
      activity.runOnUiThread {
        val printManager = activity.getSystemService(Context.PRINT_SERVICE) as PrintManager
        val adapter = object : PrintDocumentAdapter() {
          override fun onLayout(
            oldAttributes: PrintAttributes?,
            newAttributes: PrintAttributes?,
            cancellationSignal: CancellationSignal?,
            callback: LayoutResultCallback?,
            extras: Bundle?
          ) {
            if (cancellationSignal?.isCanceled == true) {
              callback?.onLayoutCancelled()
              return
            }
            val info = PrintDocumentInfo.Builder(jobName)
              .setContentType(PrintDocumentInfo.CONTENT_TYPE_DOCUMENT)
              .build()
            callback?.onLayoutFinished(info, true)
          }

          override fun onWrite(
            pages: Array<out android.print.PageRange>?,
            destination: ParcelFileDescriptor?,
            cancellationSignal: CancellationSignal?,
            callback: WriteResultCallback?
          ) {
            try {
              FileInputStream(file).use { input ->
                FileOutputStream(destination!!.fileDescriptor).use { output ->
                  val buffer = ByteArray(65536)
                  var n: Int
                  while (input.read(buffer).also { n = it } != -1) {
                    if (cancellationSignal?.isCanceled == true) {
                      callback?.onWriteCancelled()
                      return
                    }
                    output.write(buffer, 0, n)
                  }
                }
              }
              callback?.onWriteFinished(arrayOf(android.print.PageRange.ALL_PAGES))
            } catch (e: Exception) {
              callback?.onWriteFailed(e.message)
            }
          }
        }
        printManager.print(jobName, adapter, PrintAttributes.Builder().build())
      }
    }
  }

    private fun decodeSampledBitmap(filePath: String): android.graphics.Bitmap? {
      val maxDimension = 4096
      val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
      BitmapFactory.decodeFile(filePath, bounds)
      val (w, h) = bounds.outWidth to bounds.outHeight
      if (w <= 0 || h <= 0) return BitmapFactory.decodeFile(filePath)
      var sample = 1
      while (w / sample > maxDimension || h / sample > maxDimension) {
        sample *= 2
      }
      val opts = BitmapFactory.Options().apply { inSampleSize = sample }
      return BitmapFactory.decodeFile(filePath, opts)
    }

    private fun applyExifOrientation(filePath: String, bitmap: android.graphics.Bitmap): android.graphics.Bitmap {
      return try {
        val exif = ExifInterface(filePath)
        val orientation = exif.getAttributeInt(
          ExifInterface.TAG_ORIENTATION,
          ExifInterface.ORIENTATION_NORMAL
        )
        val matrix = android.graphics.Matrix()
        when (orientation) {
          ExifInterface.ORIENTATION_ROTATE_90 -> matrix.postRotate(90f)
          ExifInterface.ORIENTATION_ROTATE_180 -> matrix.postRotate(180f)
          ExifInterface.ORIENTATION_ROTATE_270 -> matrix.postRotate(270f)
          ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> matrix.preScale(-1f, 1f)
          ExifInterface.ORIENTATION_FLIP_VERTICAL -> matrix.preScale(1f, -1f)
          else -> return bitmap
        }
        android.graphics.Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
      } catch (e: Exception) {
        bitmap
      }
    }

    private fun getMediaStoreUri(context: Context, filePath: String): Uri? {
      val ext = filePath.substringAfterLast('.', "").lowercase()
      val isMedia = ext in listOf(
        "jpg", "jpeg", "png", "gif", "webp", "heic", "bmp",
        "mp4", "mkv", "avi", "mov", "webm", "3gp",
        "mp3", "aac", "wav", "flac", "ogg", "m4a"
      )
      if (!isMedia) return null

      val collections = listOf(
        MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
        MediaStore.Video.Media.EXTERNAL_CONTENT_URI,
        MediaStore.Audio.Media.EXTERNAL_CONTENT_URI,
      )

      val projection = arrayOf(MediaStore.MediaColumns._ID)
      val selection = "${MediaStore.MediaColumns.DATA} = ?"
      val selectionArgs = arrayOf(filePath)

      for (collection in collections) {
        context.contentResolver.query(collection, projection, selection, selectionArgs, null)?.use { cursor ->
          if (cursor.moveToFirst()) {
            val id = cursor.getLong(cursor.getColumnIndexOrThrow(MediaStore.MediaColumns._ID))
            return ContentUris.withAppendedId(collection, id)
          }
        }
      }
      return null
    }
}
