package com.askfiles.mobile.sharemodule

import android.content.ContentUris
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.MediaStore
import androidx.core.content.FileProvider
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

class ShareModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ShareModule")

    AsyncFunction("shareFiles") { paths: List<String>, mimeType: String ->
      val activity = appContext.activityProvider?.currentActivity
        ?: throw Exception("No activity available")

      val contentUris = ArrayList<Uri>()
      for (path in paths) {
        val file = File(path)
        val uri = FileProvider.getUriForFile(
          appContext.reactContext!!,
          "${appContext.reactContext!!.packageName}.provider",
          file
        )
        contentUris.add(uri)
      }

      val intent = if (contentUris.size == 1) {
        Intent(Intent.ACTION_SEND).apply {
          type = mimeType
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

    AsyncFunction("scanFile") { filePath: String ->
      val context = appContext.reactContext!!
      android.media.MediaScannerConnection.scanFile(
        context,
        arrayOf(filePath),
        null,
        null
      )
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
