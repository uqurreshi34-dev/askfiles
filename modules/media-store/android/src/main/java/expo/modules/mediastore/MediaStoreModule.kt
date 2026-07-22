package expo.modules.mediastore

import android.database.Cursor
import android.provider.MediaStore
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

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

    private fun sortOrder(sortKey: String): String = when (sortKey) {
    "name_desc" -> "${MediaStore.Files.FileColumns.DISPLAY_NAME} COLLATE NOCASE DESC"
    "size_desc" -> "${MediaStore.Files.FileColumns.SIZE} DESC"
    "size_asc"  -> "${MediaStore.Files.FileColumns.SIZE} ASC"
    "date_desc" -> "${MediaStore.Files.FileColumns.DATE_MODIFIED} DESC"
    "date_asc"  -> "${MediaStore.Files.FileColumns.DATE_MODIFIED} ASC"
    else        -> "${MediaStore.Files.FileColumns.DISPLAY_NAME} COLLATE NOCASE ASC" // name_asc default
  }

  private fun imageSortOrder(sortKey: String): String = when (sortKey) {
    "name_asc"  -> "${MediaStore.Images.Media.DISPLAY_NAME} COLLATE NOCASE ASC"
    "name_desc" -> "${MediaStore.Images.Media.DISPLAY_NAME} COLLATE NOCASE DESC"
    "size_desc" -> "${MediaStore.Images.Media.SIZE} DESC"
    "size_asc"  -> "${MediaStore.Images.Media.SIZE} ASC"
    "date_desc" -> "${MediaStore.Images.Media.DATE_ADDED} DESC"
    "date_asc"  -> "${MediaStore.Images.Media.DATE_ADDED} ASC"
    else        -> "${MediaStore.Images.Media.DATE_ADDED} DESC"
  }

  private fun videoSortOrder(sortKey: String): String = when (sortKey) {
    "name_asc"  -> "${MediaStore.Video.Media.DISPLAY_NAME} COLLATE NOCASE ASC"
    "name_desc" -> "${MediaStore.Video.Media.DISPLAY_NAME} COLLATE NOCASE DESC"
    "size_desc" -> "${MediaStore.Video.Media.SIZE} DESC"
    "size_asc"  -> "${MediaStore.Video.Media.SIZE} ASC"
    "date_desc" -> "${MediaStore.Video.Media.DATE_ADDED} DESC"
    "date_asc"  -> "${MediaStore.Video.Media.DATE_ADDED} ASC"
    else        -> "${MediaStore.Video.Media.DATE_ADDED} DESC"
  }

  override fun definition() = ModuleDefinition {
    Name("MediaStore")

    AsyncFunction("queryDocuments") { sortKey: String ->
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
          sortOrder(sortKey)
        )
        cursor?.use {
          val idCol = it.getColumnIndexOrThrow(MediaStore.Files.FileColumns._ID)
          val nameCol = it.getColumnIndexOrThrow(MediaStore.Files.FileColumns.DISPLAY_NAME)
          val sizeCol = it.getColumnIndexOrThrow(MediaStore.Files.FileColumns.SIZE)
          val dateCol = it.getColumnIndexOrThrow(MediaStore.Files.FileColumns.DATE_MODIFIED)
          val dataCol = it.getColumnIndexOrThrow(MediaStore.Files.FileColumns.DATA)
          while (it.moveToNext()) {
            val id = it.getLong(idCol)
            val name = it.getString(nameCol) ?: continue
            val size = it.getLong(sizeCol)
            val date = it.getLong(dateCol)
            val path = it.getString(dataCol) ?: continue
            if (name.startsWith('.')) continue
            if (path.contains("/.")) continue
            if (!File(path).isFile) continue
            results.add(mapOf(
              "name" to name,
              "uri" to "file://$path",
              "size" to size.toDouble(),
              "date" to date * 1000L,
            ))
          }
        }
      } catch (e: Exception) {}

      results
    }

    AsyncFunction("queryDownloads") { sortKey: String ->
      val context = appContext.reactContext ?: return@AsyncFunction emptyList<Map<String, Any>>()
      val results = mutableListOf<Map<String, Any>>()

      val projection = arrayOf(
        MediaStore.Files.FileColumns._ID,
        MediaStore.Files.FileColumns.DISPLAY_NAME,
        MediaStore.Files.FileColumns.SIZE,
        MediaStore.Files.FileColumns.DATE_MODIFIED,
        MediaStore.Files.FileColumns.DATA,
      )

      val uri = MediaStore.Files.getContentUri("external")
      val selection = "${MediaStore.Files.FileColumns.DATA} LIKE ?"
      val selectionArgs = arrayOf("%/Download/%")

      try {
        val cursor: Cursor? = context.contentResolver.query(
          uri, projection, selection, selectionArgs,
          sortOrder(sortKey)
        )
        cursor?.use {
          val nameCol = it.getColumnIndexOrThrow(MediaStore.Files.FileColumns.DISPLAY_NAME)
          val sizeCol = it.getColumnIndexOrThrow(MediaStore.Files.FileColumns.SIZE)
          val dateCol = it.getColumnIndexOrThrow(MediaStore.Files.FileColumns.DATE_MODIFIED)
          val dataCol = it.getColumnIndexOrThrow(MediaStore.Files.FileColumns.DATA)
          while (it.moveToNext()) {
            val name = it.getString(nameCol) ?: continue
            if (name.startsWith('.')) continue
            val size = it.getLong(sizeCol)
            val date = it.getLong(dateCol)
            val path = it.getString(dataCol) ?: continue
            if (path.contains("/.")) continue
            if (!File(path).isFile) continue   // drop directory rows + stale rows for deleted files
            results.add(mapOf(
              "name" to name,
              "uri" to "file://$path",
              "size" to size.toDouble(),
              "date" to date * 1000L,
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
            if (path.contains("/.")) continue
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
            if (path.contains("/.")) continue
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
            if (path.contains("/.")) continue
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
            if (path.contains("/.")) continue
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

    AsyncFunction("queryImages") { sortKey: String ->
      val resolver = appContext.reactContext?.contentResolver ?: return@AsyncFunction emptyList<Map<String, Any>>()
      val uri = MediaStore.Images.Media.EXTERNAL_CONTENT_URI
      val projection = arrayOf(
        MediaStore.Images.Media._ID,
        MediaStore.Images.Media.DISPLAY_NAME,
        MediaStore.Images.Media.DATE_ADDED,
        MediaStore.Images.Media.SIZE,
        MediaStore.Images.Media.DATA,
      )
      val cursor = resolver.query(uri, projection, null, null, imageSortOrder(sortKey)) ?: return@AsyncFunction emptyList<Map<String, Any>>()
      val results = mutableListOf<Map<String, Any>>()
      cursor.use {
        val idCol = it.getColumnIndexOrThrow(MediaStore.Images.Media._ID)
        val nameCol = it.getColumnIndexOrThrow(MediaStore.Images.Media.DISPLAY_NAME)
        val dateCol = it.getColumnIndexOrThrow(MediaStore.Images.Media.DATE_ADDED)
        val sizeCol = it.getColumnIndexOrThrow(MediaStore.Images.Media.SIZE)
        val dataCol = it.getColumnIndexOrThrow(MediaStore.Images.Media.DATA)
        while (it.moveToNext()) {
          val id = it.getLong(idCol)
          val contentUri = android.net.Uri.withAppendedPath(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id.toString())
          val filePath = it.getString(dataCol) ?: ""
          results.add(mapOf(
            "name" to (it.getString(nameCol) ?: ""),
            "uri" to if (filePath.isNotEmpty()) "file://$filePath" else contentUri.toString(),
            "date" to it.getLong(dateCol) * 1000L,
            "size" to it.getLong(sizeCol),
          ))
        }
      }
      results
    }

    AsyncFunction("queryVideos") { sortKey: String ->
      val resolver = appContext.reactContext?.contentResolver ?: return@AsyncFunction emptyList<Map<String, Any>>()
      val uri = MediaStore.Video.Media.EXTERNAL_CONTENT_URI
      val projection = arrayOf(
        MediaStore.Video.Media._ID,
        MediaStore.Video.Media.DISPLAY_NAME,
        MediaStore.Video.Media.DATE_ADDED,
        MediaStore.Video.Media.SIZE,
        MediaStore.Video.Media.DATA,
      )
      val cursor = resolver.query(uri, projection, null, null, videoSortOrder(sortKey)) ?: return@AsyncFunction emptyList<Map<String, Any>>()
      val results = mutableListOf<Map<String, Any>>()
      cursor.use {
        val idCol = it.getColumnIndexOrThrow(MediaStore.Video.Media._ID)
        val nameCol = it.getColumnIndexOrThrow(MediaStore.Video.Media.DISPLAY_NAME)
        val dateCol = it.getColumnIndexOrThrow(MediaStore.Video.Media.DATE_ADDED)
        val sizeCol = it.getColumnIndexOrThrow(MediaStore.Video.Media.SIZE)
        val dataCol = it.getColumnIndexOrThrow(MediaStore.Video.Media.DATA)
        while (it.moveToNext()) {
          val id = it.getLong(idCol)
          val contentUri = android.net.Uri.withAppendedPath(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, id.toString())
          val filePath = it.getString(dataCol) ?: ""
          results.add(mapOf(
            "name" to (it.getString(nameCol) ?: ""),
            "uri" to if (filePath.isNotEmpty()) "file://$filePath" else contentUri.toString(),
            "date" to it.getLong(dateCol) * 1000L,
            "size" to it.getLong(sizeCol),
          ))
        }
      }
      results
    }

    AsyncFunction("getMediaInfo") { filePath: String ->
        val file = java.io.File(filePath)
        val result = mutableMapOf<String, Any>()

        // Try video metadata first
        val retriever = android.media.MediaMetadataRetriever()
        try {
            retriever.setDataSource(filePath)

            val width = retriever.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)?.toIntOrNull()
            val height = retriever.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)?.toIntOrNull()
            val durationMs = retriever.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull()
            val mimeType = retriever.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_MIMETYPE) ?: ""

            if (width != null && width > 0) result["width"] = width
            if (height != null && height > 0) result["height"] = height
            if (mimeType.isNotEmpty()) result["mimeType"] = mimeType

            if (durationMs != null && durationMs > 0) {
                result["durationMs"] = durationMs
                val totalSeconds = durationMs / 1000
                val hours = totalSeconds / 3600
                val minutes = (totalSeconds % 3600) / 60
                val seconds = totalSeconds % 60
                result["duration"] = if (hours > 0)
                    "%d:%02d:%02d".format(hours, minutes, seconds)
                else
                    "%d:%02d".format(minutes, seconds)
            }
        } catch (e: Exception) {
            // Not a video or retriever failed — fall through to image
        } finally {
            retriever.release()
        }

        // If no dimensions from video retriever, try image decoder
        if (!result.containsKey("width")) {
            try {
                val options = android.graphics.BitmapFactory.Options().apply { inJustDecodeBounds = true }
                android.graphics.BitmapFactory.decodeFile(filePath, options)
                if (options.outWidth > 0) result["width"] = options.outWidth
                if (options.outHeight > 0) result["height"] = options.outHeight
                if (options.outMimeType != null) result["mimeType"] = options.outMimeType
            } catch (e: Exception) {}
        }

        result["size"] = file.length()
        result
    }

    AsyncFunction("queryImageFolders") { sortKey: String ->
      val resolver = appContext.reactContext?.contentResolver ?: return@AsyncFunction emptyList<Map<String, Any>>()
      val uri = MediaStore.Images.Media.EXTERNAL_CONTENT_URI
      val projection = arrayOf(
        MediaStore.Images.Media.DISPLAY_NAME,
        MediaStore.Images.Media.DATA,
        MediaStore.Images.Media.DATE_ADDED,
        MediaStore.Images.Media.SIZE,
      )
      val cursor = resolver.query(uri, projection, null, null, imageSortOrder(sortKey))
        ?: return@AsyncFunction emptyList<Map<String, Any>>()

      // folderPath -> { name, previewUri, uris, count }
      val folderMap = linkedMapOf<String, MutableMap<String, Any>>()
      cursor.use {
        val nameCol = it.getColumnIndexOrThrow(MediaStore.Images.Media.DISPLAY_NAME)
        val dataCol = it.getColumnIndexOrThrow(MediaStore.Images.Media.DATA)
        while (it.moveToNext()) {
          val name = it.getString(nameCol) ?: continue
          val path = it.getString(dataCol) ?: continue
          if (name.startsWith('.') || path.contains("/.")) continue
          val folderPath = path.substringBeforeLast('/')
          val folderName = folderPath.substringAfterLast('/')
          val uri = "file://$path"
          val group = folderMap.getOrPut(folderPath) {
            mutableMapOf(
              "folderPath" to folderPath,
              "folderName" to folderName,
              "previewUri" to uri,
              "count" to 0,
              "uris" to mutableListOf<String>()
            )
          }
          @Suppress("UNCHECKED_CAST")
          (group["uris"] as MutableList<String>).add(uri)
          group["count"] = (group["count"] as Int) + 1
        }
      }
      folderMap.values.sortedByDescending { it["count"] as Int }
    }

    AsyncFunction("queryVideoFolders") { sortKey: String ->
      val resolver = appContext.reactContext?.contentResolver ?: return@AsyncFunction emptyList<Map<String, Any>>()
      val uri = MediaStore.Video.Media.EXTERNAL_CONTENT_URI
      val projection = arrayOf(
        MediaStore.Video.Media.DISPLAY_NAME,
        MediaStore.Video.Media.DATA,
        MediaStore.Video.Media.DATE_ADDED,
        MediaStore.Video.Media.SIZE,
      )
      val cursor = resolver.query(uri, projection, null, null, videoSortOrder(sortKey))
        ?: return@AsyncFunction emptyList<Map<String, Any>>()

      val folderMap = linkedMapOf<String, MutableMap<String, Any>>()
      cursor.use {
        val nameCol = it.getColumnIndexOrThrow(MediaStore.Video.Media.DISPLAY_NAME)
        val dataCol = it.getColumnIndexOrThrow(MediaStore.Video.Media.DATA)
        while (it.moveToNext()) {
          val name = it.getString(nameCol) ?: continue
          val path = it.getString(dataCol) ?: continue
          if (name.startsWith('.') || path.contains("/.")) continue
          val folderPath = path.substringBeforeLast('/')
          val folderName = folderPath.substringAfterLast('/')
          val uri = "file://$path"
          val group = folderMap.getOrPut(folderPath) {
            mutableMapOf(
              "folderPath" to folderPath,
              "folderName" to folderName,
              "previewUri" to uri,
              "count" to 0,
              "uris" to mutableListOf<String>()
            )
          }
          @Suppress("UNCHECKED_CAST")
          (group["uris"] as MutableList<String>).add(uri)
          group["count"] = (group["count"] as Int) + 1
        }
      }
      folderMap.values.sortedByDescending { it["count"] as Int }
    }

    AsyncFunction("queryDocumentsByMimeWithFolders") { mimeTypes: List<String>, sortKey: String ->
      val context = appContext.reactContext ?: return@AsyncFunction mapOf<String, Any>()
      val actualMimes = if (mimeTypes.isEmpty()) DOCUMENT_MIME_TYPES else mimeTypes
      val selection = actualMimes.joinToString(" OR ") { "${MediaStore.Files.FileColumns.MIME_TYPE} = ?" }
      val selectionArgs = actualMimes.toTypedArray()
      val projection = arrayOf(
        MediaStore.Files.FileColumns.DISPLAY_NAME,
        MediaStore.Files.FileColumns.SIZE,
        MediaStore.Files.FileColumns.DATE_MODIFIED,
        MediaStore.Files.FileColumns.DATA,
      )
      val cursor = context.contentResolver.query(
        MediaStore.Files.getContentUri("external"),
        projection, selection, selectionArgs, sortOrder(sortKey)
      ) ?: return@AsyncFunction mapOf<String, Any>()

      val files = mutableListOf<Map<String, Any>>()
      val folderMap = linkedMapOf<String, MutableMap<String, Any>>()

      cursor.use {
        val nameCol = it.getColumnIndexOrThrow(MediaStore.Files.FileColumns.DISPLAY_NAME)
        val sizeCol = it.getColumnIndexOrThrow(MediaStore.Files.FileColumns.SIZE)
        val dateCol = it.getColumnIndexOrThrow(MediaStore.Files.FileColumns.DATE_MODIFIED)
        val dataCol = it.getColumnIndexOrThrow(MediaStore.Files.FileColumns.DATA)
        while (it.moveToNext()) {
          val name = it.getString(nameCol) ?: continue
          val path = it.getString(dataCol) ?: continue
          if (name.startsWith('.') || path.contains("/.")) continue
          val size = it.getLong(sizeCol)
          val date = it.getLong(dateCol)
          val uri = "file://$path"
          files.add(mapOf("name" to name, "uri" to uri, "size" to size.toDouble(), "date" to date * 1000L))
          val folderPath = path.substringBeforeLast('/')
          val folderName = folderPath.substringAfterLast('/')
          val group = folderMap.getOrPut(folderPath) {
            mutableMapOf("folderPath" to folderPath, "folderName" to folderName, "previewUri" to uri, "count" to 0, "uris" to mutableListOf<String>())
          }
          @Suppress("UNCHECKED_CAST")
          (group["uris"] as MutableList<String>).add(uri)
          group["count"] = (group["count"] as Int) + 1
        }
      }
      mapOf(
        "files" to files,
        "folders" to folderMap.values.sortedByDescending { it["count"] as Int }
      )
    }

    AsyncFunction("queryDocumentFolders") { filterMimes: List<String>, sortKey: String ->
      val context = appContext.reactContext ?: return@AsyncFunction emptyList<Map<String, Any>>()
      val mimeTypes = if (filterMimes.isEmpty()) DOCUMENT_MIME_TYPES else filterMimes
      val selection = mimeTypes.joinToString(" OR ") { "${MediaStore.Files.FileColumns.MIME_TYPE} = ?" }
      val selectionArgs = mimeTypes.toTypedArray()
      val projection = arrayOf(
        MediaStore.Files.FileColumns.DISPLAY_NAME,
        MediaStore.Files.FileColumns.DATA,
        MediaStore.Files.FileColumns.SIZE,
        MediaStore.Files.FileColumns.DATE_MODIFIED,
      )
      val cursor = context.contentResolver.query(
        MediaStore.Files.getContentUri("external"),
        projection, selection, selectionArgs,
        sortOrder(sortKey)
      ) ?: return@AsyncFunction emptyList<Map<String, Any>>()

      val folderMap = linkedMapOf<String, MutableMap<String, Any>>()
      cursor.use {
        val nameCol = it.getColumnIndexOrThrow(MediaStore.Files.FileColumns.DISPLAY_NAME)
        val dataCol = it.getColumnIndexOrThrow(MediaStore.Files.FileColumns.DATA)
        while (it.moveToNext()) {
          val name = it.getString(nameCol) ?: continue
          val path = it.getString(dataCol) ?: continue
          if (name.startsWith('.') || path.contains("/.")) continue
          val folderPath = path.substringBeforeLast('/')
          val folderName = folderPath.substringAfterLast('/')
          val uri = "file://$path"
          val group = folderMap.getOrPut(folderPath) {
            mutableMapOf(
              "folderPath" to folderPath,
              "folderName" to folderName,
              "previewUri" to uri,
              "count" to 0,
              "uris" to mutableListOf<String>()
            )
          }
          @Suppress("UNCHECKED_CAST")
          (group["uris"] as MutableList<String>).add(uri)
          group["count"] = (group["count"] as Int) + 1
        }
      }
      folderMap.values.sortedByDescending { it["count"] as Int }
    }
  }
}
