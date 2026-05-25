package expo.modules.filereader

import android.net.Uri
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream

class FileReaderModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("FileReader")

    Events("onCopyProgress")

    AsyncFunction("readDirectory") { path: String ->
      val dir = File(path)
      if (!dir.exists() || !dir.isDirectory) return@AsyncFunction emptyList<Map<String, Any>>()
      dir.listFiles()
        ?.filter { !it.name.startsWith('.') }
        ?.map { file ->
          mapOf(
            "name" to file.name,
            "uri" to "file://" + file.absolutePath + (if (file.isDirectory) "/" else ""),
            "isDirectory" to file.isDirectory
          )
        }
        ?.sortedWith(compareBy({ if (it["isDirectory"] as Boolean) 0 else 1 }, { it["name"] as String }))
        ?: emptyList()
    }

    AsyncFunction("countFolder") { path: String ->
      val dir = File(path)
      if (!dir.exists() || !dir.isDirectory) return@AsyncFunction 0
      dir.listFiles()?.count { !it.name.startsWith('.') } ?: 0
    }

    AsyncFunction("copyFileStream") { srcUri: String, destPath: String ->
      val context = appContext.reactContext ?: throw Exception("No context")
      val srcFile = if (srcUri.startsWith("content://")) {
        null // content URI — use ContentResolver
      } else {
        File(srcUri.removePrefix("file://").let {
          try { java.net.URLDecoder.decode(it, "UTF-8") } catch (e: Exception) { it }
        })
      }
      val totalBytes: Long = if (srcFile != null) {
        srcFile.length()
      } else {
        context.contentResolver.query(
          Uri.parse(srcUri),
          arrayOf(android.provider.OpenableColumns.SIZE),
          null, null, null
        )?.use { cursor ->
          if (cursor.moveToFirst()) cursor.getLong(0) else -1L
        } ?: -1L
      }

      val input = if (srcFile != null) {
        FileInputStream(srcFile)
      } else {
        context.contentResolver.openInputStream(Uri.parse(srcUri))
          ?: throw Exception("Cannot open input stream for $srcUri")
      }

      val dest = File(destPath)
      dest.parentFile?.mkdirs()
      val output = FileOutputStream(dest)

      var bytesCopied = 0L
      var lastReportedPercent = -1
      val buffer = ByteArray(65536) // 64KB chunks
      try {
        var bytes = input.read(buffer)
        while (bytes >= 0) {
          output.write(buffer, 0, bytes)
          bytesCopied += bytes
          if (totalBytes > 0) {
            val percent = ((bytesCopied * 100) / totalBytes).toInt()
            if (percent != lastReportedPercent && percent % 5 == 0) {
              lastReportedPercent = percent
              sendEvent("onCopyProgress", mapOf(
                "percent" to percent,
                "bytesCopied" to bytesCopied,
                "totalBytes" to totalBytes
              ))
            }
          }
          bytes = input.read(buffer)
        }
      } finally {
        input.close()
        output.flush()
        output.close()
      }
      destPath
    }

    AsyncFunction("moveFileStream") { srcUri: String, destPath: String ->
      val srcPath = srcUri.removePrefix("file://").let {
        try { java.net.URLDecoder.decode(it, "UTF-8") } catch (e: Exception) { it }
      }
      val srcFile = File(srcPath)
      val destFile = File(destPath)
      destFile.parentFile?.mkdirs()

      // Try atomic rename first (instant, same filesystem)
      if (srcFile.renameTo(destFile)) {
        return@AsyncFunction destPath
      }

      // Fall back to stream copy + delete
      val context = appContext.reactContext ?: throw Exception("No context")
      val totalBytes = srcFile.length()
      val input = FileInputStream(srcFile)
      val output = FileOutputStream(destFile)
      var bytesCopied = 0L
      var lastReportedPercent = -1
      val buffer = ByteArray(65536)
      try {
        var bytes = input.read(buffer)
        while (bytes >= 0) {
          output.write(buffer, 0, bytes)
          bytesCopied += bytes
          if (totalBytes > 0) {
            val percent = ((bytesCopied * 100) / totalBytes).toInt()
            if (percent != lastReportedPercent && percent % 5 == 0) {
              lastReportedPercent = percent
              sendEvent("onCopyProgress", mapOf(
                "percent" to percent,
                "bytesCopied" to bytesCopied,
                "totalBytes" to totalBytes
              ))
            }
          }
          bytes = input.read(buffer)
        }
      } finally {
        input.close()
        output.flush()
        output.close()
      }
      srcFile.delete()
      destPath
    }
  }
}
