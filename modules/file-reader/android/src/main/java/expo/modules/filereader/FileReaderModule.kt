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

    AsyncFunction("zipFiles") { srcPaths: List<String>, destPath: String ->
      val dest = File(destPath)
      dest.parentFile?.mkdirs()
      val buffer = ByteArray(65536)
      java.util.zip.ZipOutputStream(FileOutputStream(dest).buffered()).use { zos ->
        for (srcPath in srcPaths) {
          val srcFile = File(srcPath)
          if (!srcFile.exists()) continue
          val entryName = srcFile.name
          zos.putNextEntry(java.util.zip.ZipEntry(entryName))
          FileInputStream(srcFile).use { fis ->
            var bytes = fis.read(buffer)
            while (bytes >= 0) {
              zos.write(buffer, 0, bytes)
              bytes = fis.read(buffer)
            }
          }
          zos.closeEntry()
        }
      }
      destPath
    }

    AsyncFunction("unzipFile") { srcPath: String, destDir: String ->
      val dest = File(destDir)
      // Check if zip is encrypted before creating any folder
      val zipCheck = net.lingala.zip4j.ZipFile(File(srcPath))
      if (zipCheck.isEncrypted) {
        throw Exception("WRONG_PASSWORD")
      }
      dest.mkdirs()
      val buffer = ByteArray(65536)
      java.util.zip.ZipInputStream(FileInputStream(File(srcPath)).buffered()).use { zis ->
        var entry = zis.nextEntry
        while (entry != null) {
          if (!entry.isDirectory) {
            val outFile = File(dest, entry.name)
            outFile.parentFile?.mkdirs()
            FileOutputStream(outFile).use { fos ->
              var bytes = zis.read(buffer)
              while (bytes >= 0) {
                fos.write(buffer, 0, bytes)
                bytes = zis.read(buffer)
              }
            }
          }
          zis.closeEntry()
          entry = zis.nextEntry
        }
      }
      destDir
    }

    AsyncFunction("zipFilesWithPassword") { srcPaths: List<String>, destPath: String, password: String ->
      val dest = File(destPath)
      dest.parentFile?.mkdirs()
      try {
        val zipParameters = net.lingala.zip4j.model.ZipParameters().apply {
          compressionMethod = net.lingala.zip4j.model.enums.CompressionMethod.DEFLATE
          encryptionMethod = net.lingala.zip4j.model.enums.EncryptionMethod.AES
          aesKeyStrength = net.lingala.zip4j.model.enums.AesKeyStrength.KEY_STRENGTH_256
          isEncryptFiles = true
        }
        val zipFile = net.lingala.zip4j.ZipFile(dest, password.toCharArray())
        for (srcPath in srcPaths) {
          val srcFile = File(srcPath)
          if (srcFile.exists()) zipFile.addFile(srcFile, zipParameters)
        }
      } catch (e: Exception) {
        dest.delete()
        throw e
      }
      destPath
    }

    AsyncFunction("unzipFileWithPassword") { srcPath: String, destDir: String, password: String ->
      val dest = File(destDir)
      try {
        dest.mkdirs()
        val zipFile = net.lingala.zip4j.ZipFile(File(srcPath), password.toCharArray())
        zipFile.extractAll(destDir)
      } catch (e: Exception) {
        dest.deleteRecursively()
        val msg = e.message?.lowercase() ?: ""
        if (msg.contains("wrong password") || msg.contains("wrong crc") || msg.contains("checksum") || msg.contains("password") || msg.contains("encrypted")) {
          throw Exception("WRONG_PASSWORD")
        }
        throw e
      }
      destDir
    }
  }
}
