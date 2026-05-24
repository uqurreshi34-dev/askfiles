package expo.modules.mediastore

import android.database.Cursor
import android.provider.MediaStore
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class MediaStoreModule : Module() {

  private val DOCUMENT_MIME_TYPES = listOf(
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "text/plain",
    "text/csv",
    "application/rtf",
    "application/vnd.oasis.opendocument.text",
    "application/vnd.oasis.opendocument.spreadsheet",
    "application/vnd.oasis.opendocument.presentation",
  )

  private val SENSITIVE_MIME_TYPES = listOf(
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.oasis.opendocument.text",
    "application/vnd.oasis.opendocument.spreadsheet",
    "text/plain",
  )

  private val ALL_FILE_MIME_TYPES = listOf(
    "image/jpeg", "image/png", "image/gif", "image/webp",
    "image/heic", "image/heif", "image/bmp",
    "video/mp4", "video/3gpp", "video/x-matroska",
    "video/quicktime", "video/webm", "video/avi",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain",
    "audio/mpeg", "audio/mp4", "audio/aac", "audio/wav", "audio/ogg",
    "application/zip", "application/x-rar-compressed",
    "application/vnd.android.package-archive",
  )
  override fun definition() = ModuleDefinition {
    Name("MediaStore")

    AsyncFunction("queryDocuments") {
      val context = appContext.reactContext ?: return@AsyncFunction emptyList<Map<String, Any>>()
      val results = mutableListOf<Map<String, Any>>()

      val mimeTypes = DOCUMENT_MIME_TYPES

      val selection = mimeTypes.joinToString(" OR ") { "${MediaStore.Files.FileColumns.MIME_TYPE} = ?" }
      val selectionArgs = mimeTypes.toTypedArray()

      val projection = arrayOf(
        MediaStore.Files.FileColumns._ID,
        MediaStore.Files.FileColumns.DISPLAY_NAME,
        MediaStore.Files.FileColumns.SIZE,
        MediaStore.Files.FileColumns.DATE_MODIFIED,
        MediaStore.Files.FileColumns.DATA,
      )

      val uri = MediaStore.Files.getContentUri("external")

      try {
        val cursor: Cursor? = context.contentResolver.query(
          uri, projection, selection, selectionArgs,
          "${MediaStore.Files.FileColumns.DISPLAY_NAME} ASC"
        )
        cursor?.use {
          val idCol = it.getColumnIndexOrThrow(MediaStore.Files.FileColumns._ID)
          val nameCol = it.getColumnIndexOrThrow(MediaStore.Files.FileColumns.DISPLAY_NAME)
          val sizeCol = it.getColumnIndexOrThrow(MediaStore.Files.FileColumns.SIZE)
          val dataCol = it.getColumnIndexOrThrow(MediaStore.Files.FileColumns.DATA)
          while (it.moveToNext()) {
            val id = it.getLong(idCol)
            val name = it.getString(nameCol) ?: continue
            val size = it.getLong(sizeCol)
            val path = it.getString(dataCol) ?: continue
            results.add(mapOf(
              "name" to name,
              "uri" to "file://$path",
              "size" to size.toDouble(),
            ))
          }
        }
      } catch (e: Exception) {}

      results
    }

    AsyncFunction("queryDownloads") {
      val context = appContext.reactContext ?: return@AsyncFunction emptyList<Map<String, Any>>()
      val results = mutableListOf<Map<String, Any>>()

      val projection = arrayOf(
        MediaStore.Files.FileColumns._ID,
        MediaStore.Files.FileColumns.DISPLAY_NAME,
        MediaStore.Files.FileColumns.SIZE,
        MediaStore.Files.FileColumns.DATA,
      )

      val uri = MediaStore.Files.getContentUri("external")
      val selection = "${MediaStore.Files.FileColumns.DATA} LIKE ?"
      val selectionArgs = arrayOf("%/Download/%")

      try {
        val cursor: Cursor? = context.contentResolver.query(
          uri, projection, selection, selectionArgs,
          "${MediaStore.Files.FileColumns.DISPLAY_NAME} ASC"
        )
        cursor?.use {
          val nameCol = it.getColumnIndexOrThrow(MediaStore.Files.FileColumns.DISPLAY_NAME)
          val sizeCol = it.getColumnIndexOrThrow(MediaStore.Files.FileColumns.SIZE)
          val dataCol = it.getColumnIndexOrThrow(MediaStore.Files.FileColumns.DATA)
          while (it.moveToNext()) {
            val name = it.getString(nameCol) ?: continue
            if (name.startsWith('.')) continue
            val size = it.getLong(sizeCol)
            val path = it.getString(dataCol) ?: continue
            results.add(mapOf(
              "name" to name,
              "uri" to "file://$path",
              "size" to size.toDouble(),
            ))
          }
        }
      } catch (e: Exception) {}

      results
    }

      AsyncFunction("queryImageSize") {
        val context = appContext.reactContext ?: return@AsyncFunction 0L
        var totalSize = 0L
        try {
            val uri = android.provider.MediaStore.Images.Media.EXTERNAL_CONTENT_URI
            val projection = arrayOf(android.provider.MediaStore.Images.Media.SIZE)
            val cursor = context.contentResolver.query(uri, projection, null, null, null)
            cursor?.use {
                val sizeCol = it.getColumnIndexOrThrow(android.provider.MediaStore.Images.Media.SIZE)
                while (it.moveToNext()) {
                    totalSize += it.getLong(sizeCol)
                }
            }
        } catch (e: Exception) {}
        totalSize.toDouble()
    }

    AsyncFunction("queryVideoSize") {
        val context = appContext.reactContext ?: return@AsyncFunction 0L
        var totalSize = 0L
        try {
            val uri = android.provider.MediaStore.Video.Media.EXTERNAL_CONTENT_URI
            val projection = arrayOf(android.provider.MediaStore.Video.Media.SIZE)
            val cursor = context.contentResolver.query(uri, projection, null, null, null)
            cursor?.use {
                val sizeCol = it.getColumnIndexOrThrow(android.provider.MediaStore.Video.Media.SIZE)
                while (it.moveToNext()) {
                    totalSize += it.getLong(sizeCol)
                }
            }
        } catch (e: Exception) {}
        totalSize.toDouble()
    }

    AsyncFunction("queryFolderSize") { folderPath: String ->
      val context = appContext.reactContext ?: return@AsyncFunction 0.0
      var totalSize = 0L
      try {
          val uri = android.provider.MediaStore.Files.getContentUri("external")
          val projection = arrayOf(android.provider.MediaStore.Files.FileColumns.SIZE)
          val selection = "${android.provider.MediaStore.Files.FileColumns.DATA} LIKE ?"
          val selectionArgs = arrayOf("$folderPath%")
          val cursor = context.contentResolver.query(uri, projection, selection, selectionArgs, null)
          cursor?.use {
              val sizeCol = it.getColumnIndexOrThrow(android.provider.MediaStore.Files.FileColumns.SIZE)
              while (it.moveToNext()) {
                  totalSize += it.getLong(sizeCol)
              }
          }
      } catch (e: Exception) {}
      totalSize.toDouble()
    }

    AsyncFunction("queryLargestFiles") { folderPath: String, mimePrefix: String, limit: Int ->
      val context = appContext.reactContext ?: return@AsyncFunction emptyList<Map<String, Any>>()
      val results = mutableListOf<Map<String, Any>>()
      try {
        val uri = MediaStore.Files.getContentUri("external")
        val projection = arrayOf(
          MediaStore.Files.FileColumns.DISPLAY_NAME,
          MediaStore.Files.FileColumns.SIZE,
          MediaStore.Files.FileColumns.DATA,
        )
        val selection = buildString {
          append("${MediaStore.Files.FileColumns.DATA} LIKE ?")
          if (mimePrefix.isNotEmpty()) {
            append(" AND ${MediaStore.Files.FileColumns.MIME_TYPE} LIKE ?")
          }
        }
        val selectionArgs = if (mimePrefix.isNotEmpty()) {
          arrayOf("$folderPath%", "$mimePrefix%")
        } else {
          arrayOf("$folderPath%")
        }
        val cursor = context.contentResolver.query(
          uri, projection, selection, selectionArgs,
          "${MediaStore.Files.FileColumns.SIZE} DESC"
        )
        cursor?.use {
          val nameCol = it.getColumnIndexOrThrow(MediaStore.Files.FileColumns.DISPLAY_NAME)
          val sizeCol = it.getColumnIndexOrThrow(MediaStore.Files.FileColumns.SIZE)
          val dataCol = it.getColumnIndexOrThrow(MediaStore.Files.FileColumns.DATA)
          var count = 0
          while (it.moveToNext() && count < limit) {
            val name = it.getString(nameCol) ?: continue
            if (name.startsWith('.')) continue
            val size = it.getLong(sizeCol)
            if (size <= 0) continue
            val path = it.getString(dataCol) ?: continue
            val folder = path.split("/").dropLast(1).lastOrNull() ?: "Storage"
            results.add(mapOf(
              "name" to name,
              "size" to size.toDouble(),
              "folder" to folder,
              "uri" to "file://$path",
            ))
            count++
          }
        }
      } catch (e: Exception) {}
      results
    }

    AsyncFunction("querySensitiveFiles") { keywords: List<String> ->
      val context = appContext.reactContext ?: return@AsyncFunction emptyList<Map<String, Any>>()
      val results = mutableListOf<Map<String, Any>>()
      try {
        val uri = MediaStore.Files.getContentUri("external")
        val projection = arrayOf(
          MediaStore.Files.FileColumns.DISPLAY_NAME,
          MediaStore.Files.FileColumns.SIZE,
          MediaStore.Files.FileColumns.DATA,
        )
        val keywordClause = keywords.joinToString(" OR ") {
          "${MediaStore.Files.FileColumns.DISPLAY_NAME} LIKE ?"
        }
        val mimeTypes = SENSITIVE_MIME_TYPES
        val mimeClause = mimeTypes.joinToString(" OR ") {
          "${MediaStore.Files.FileColumns.MIME_TYPE} = ?"
        }
        val selection = "($keywordClause) AND ($mimeClause)"
        val selectionArgs = (keywords.map { "%$it%" } + mimeTypes).toTypedArray()
        val cursor = context.contentResolver.query(
          uri, projection, selection, selectionArgs,
          "${MediaStore.Files.FileColumns.DISPLAY_NAME} ASC"
        )
        cursor?.use {
          val nameCol = it.getColumnIndexOrThrow(MediaStore.Files.FileColumns.DISPLAY_NAME)
          val sizeCol = it.getColumnIndexOrThrow(MediaStore.Files.FileColumns.SIZE)
          val dataCol = it.getColumnIndexOrThrow(MediaStore.Files.FileColumns.DATA)
          while (it.moveToNext()) {
            val name = it.getString(nameCol) ?: continue
            if (name.startsWith('.')) continue
            val size = it.getLong(sizeCol)
            val path = it.getString(dataCol) ?: continue
            results.add(mapOf(
              "name" to name,
              "size" to size.toDouble(),
              "uri" to "file://$path",
            ))
          }
        }
      } catch (e: Exception) {}
      results
    }

    AsyncFunction("queryAllFiles") {
      val context = appContext.reactContext ?: return@AsyncFunction emptyList<Map<String, Any>>()
      val results = mutableListOf<Map<String, Any>>()
      try {
        val uri = MediaStore.Files.getContentUri("external")
        val projection = arrayOf(
          MediaStore.Files.FileColumns.DISPLAY_NAME,
          MediaStore.Files.FileColumns.SIZE,
          MediaStore.Files.FileColumns.DATA,
        )
        val mimeTypes = ALL_FILE_MIME_TYPES
        val selection = mimeTypes.joinToString(" OR ") {
          "${MediaStore.Files.FileColumns.MIME_TYPE} = ?"
        } + " AND ${MediaStore.Files.FileColumns.SIZE} > 0"
        val selectionArgs = mimeTypes.toTypedArray()
        val cursor = context.contentResolver.query(
          uri, projection, selection, selectionArgs,
          "${MediaStore.Files.FileColumns.DISPLAY_NAME} ASC"
        )
        cursor?.use {
          val nameCol = it.getColumnIndexOrThrow(MediaStore.Files.FileColumns.DISPLAY_NAME)
          val sizeCol = it.getColumnIndexOrThrow(MediaStore.Files.FileColumns.SIZE)
          val dataCol = it.getColumnIndexOrThrow(MediaStore.Files.FileColumns.DATA)
          while (it.moveToNext()) {
            val name = it.getString(nameCol) ?: continue
            if (name.startsWith('.')) continue
            val size = it.getLong(sizeCol)
            val path = it.getString(dataCol) ?: continue
            results.add(mapOf(
              "name" to name,
              "size" to size.toDouble(),
              "uri" to "file://$path",
            ))
          }
        }
      } catch (e: Exception) {}
      results
    }

    AsyncFunction("searchFiles") { query: String ->
      val context = appContext.reactContext ?: return@AsyncFunction emptyList<Map<String, Any>>()
      val results = mutableListOf<Map<String, Any>>()
      try {
        val uri = MediaStore.Files.getContentUri("external")
        val projection = arrayOf(
          MediaStore.Files.FileColumns.DISPLAY_NAME,
          MediaStore.Files.FileColumns.DATA,
          MediaStore.Files.FileColumns.MIME_TYPE,
        )
        val mimeClause = ALL_FILE_MIME_TYPES.joinToString(" OR ") {
          "${MediaStore.Files.FileColumns.MIME_TYPE} = ?"
        }
        val selection = "${MediaStore.Files.FileColumns.DISPLAY_NAME} LIKE ? AND ($mimeClause)"
        val selectionArgs = (listOf("%$query%") + ALL_FILE_MIME_TYPES).toTypedArray()
        val cursor = context.contentResolver.query(
          uri, projection, selection, selectionArgs,
          "${MediaStore.Files.FileColumns.DISPLAY_NAME} ASC"
        )
        cursor?.use {
          val nameCol = it.getColumnIndexOrThrow(MediaStore.Files.FileColumns.DISPLAY_NAME)
          val dataCol = it.getColumnIndexOrThrow(MediaStore.Files.FileColumns.DATA)
          val mimeCol = it.getColumnIndexOrThrow(MediaStore.Files.FileColumns.MIME_TYPE)
          while (it.moveToNext()) {
            val name = it.getString(nameCol) ?: continue
            if (name.startsWith('.')) continue
            val path = it.getString(dataCol) ?: continue
            val mime = it.getString(mimeCol) ?: ""
            results.add(mapOf(
              "name" to name,
              "uri" to "file://$path",
              "isDirectory" to false,
              "mimeType" to mime,
            ))
          }
        }
      } catch (e: Exception) {}
      results
    }

    AsyncFunction("queryDocumentsByMime") { mimeTypes: List<String> ->
      val context = appContext.reactContext ?: return@AsyncFunction emptyList<Map<String, Any>>()
      val results = mutableListOf<Map<String, Any>>()
      val selection = mimeTypes.joinToString(" OR ") { "${MediaStore.Files.FileColumns.MIME_TYPE} = ?" }
      val selectionArgs = mimeTypes.toTypedArray()
      val projection = arrayOf(
        MediaStore.Files.FileColumns.DISPLAY_NAME,
        MediaStore.Files.FileColumns.SIZE,
        MediaStore.Files.FileColumns.DATA,
      )
      try {
        val cursor = context.contentResolver.query(
          MediaStore.Files.getContentUri("external"),
          projection, selection, selectionArgs,
          "${MediaStore.Files.FileColumns.DISPLAY_NAME} ASC"
        )
        cursor?.use {
          val nameCol = it.getColumnIndexOrThrow(MediaStore.Files.FileColumns.DISPLAY_NAME)
          val sizeCol = it.getColumnIndexOrThrow(MediaStore.Files.FileColumns.SIZE)
          val dataCol = it.getColumnIndexOrThrow(MediaStore.Files.FileColumns.DATA)
          while (it.moveToNext()) {
            val name = it.getString(nameCol) ?: continue
            val size = it.getLong(sizeCol)
            val path = it.getString(dataCol) ?: continue
            results.add(mapOf("name" to name, "uri" to "file://$path", "size" to size.toDouble()))
          }
        }
      } catch (e: Exception) {}
      results
    }
  }
}
