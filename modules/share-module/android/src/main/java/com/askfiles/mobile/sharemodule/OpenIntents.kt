package com.askfiles.mobile.sharemodule

import android.content.ContentUris
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.MediaStore
import android.webkit.MimeTypeMap
import androidx.core.content.FileProvider
import java.io.File

/**
 * The one way AskFiles hands a file to another app to open.
 *
 * Every screen, and the home-screen widget, builds its open request here, so a file behaves the
 * same wherever it is tapped: the real type is used rather than a wildcard, a file of an unknown
 * type always shows the Open with list, and a file on an SD card opens as reliably as one on the
 * phone's own storage.
 */
object OpenIntents {

  /** The MediaStore address of an indexed photo, video or song, or null. */
  fun mediaStoreUri(context: Context, filePath: String): Uri? {
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

  /**
   * An address another app is allowed to read the file through.
   *
   * MediaStore first, then AskFiles' own file provider. The provider only covers the phone's own
   * storage, so a file on an SD card is handed over as a private copy in the app's cache instead.
   */
  fun contentUri(context: Context, filePath: String): Uri {
    mediaStoreUri(context, filePath)?.let { return it }

    val authority = "${context.packageName}.provider"
    val file = File(filePath)

    return try {
      FileProvider.getUriForFile(context, authority, file)
    } catch (e: IllegalArgumentException) {
      val folder = File(context.cacheDir, "open").apply { mkdirs() }
      val copy = File(folder, file.name)
      file.copyTo(copy, overwrite = true)
      FileProvider.getUriForFile(context, authority, copy)
    }
  }

  /**
   * The request to open a file. [mimeHint] is the type the caller knows, or a wildcard when it
   * does not; for those the real type is worked out and the Open with list is shown.
   */
  fun viewIntent(context: Context, filePath: String, mimeHint: String?): Intent {
    val uri = contentUri(context, filePath)
    val generic = FileTypes.isGeneric(mimeHint)

    val type = if (generic) {
      FileTypes.resolve(File(filePath)) { ext -> MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext) }
    } else {
      mimeHint!!
    }

    val view = Intent(Intent.ACTION_VIEW).apply {
      setDataAndType(uri, type)
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }

    val launch = if (generic) {
      Intent.createChooser(view, "Open with").apply {
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }
    } else {
      view
    }

    return launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
  }
}
