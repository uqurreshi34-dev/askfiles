package expo.modules.filereader

import android.net.Uri
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream

class FileReaderModule : Module() {

  private var wifiServerThread: Thread? = null
  private var wifiServerSocket: java.net.ServerSocket? = null
  @Volatile private var wifiServerRunning = false

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
        null
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
      try {
        val buffer = ByteArray(65536)
        java.util.zip.ZipOutputStream(FileOutputStream(dest).buffered()).use { zos ->
          for (srcPath in srcPaths) {
            val srcFile = File(srcPath)
            if (!srcFile.exists()) continue
            zos.putNextEntry(java.util.zip.ZipEntry(srcFile.name))
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
      } catch (e: Exception) {
        dest.delete()
        throw e
      }
      destPath
    }

    AsyncFunction("unzipFile") { srcPath: String, destDir: String ->
      val dest = File(destDir)
      val zipCheck = net.lingala.zip4j.ZipFile(File(srcPath))
      if (zipCheck.isEncrypted) throw Exception("WRONG_PASSWORD")
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
        if (msg.contains("wrong password") || msg.contains("wrong crc") || msg.contains("checksum") ||
          msg.contains("password") || msg.contains("encrypted")) {
          throw Exception("WRONG_PASSWORD")
        }
        throw e
      }
      destDir
    }

    AsyncFunction("deleteDirectory") { path: String ->
          val dir = File(path)
          if (!dir.exists()) return@AsyncFunction true
          dir.deleteRecursively()
        }

        AsyncFunction("statFiles") { paths: List<String> ->
          paths.map { path ->
              val file = File(path)
              if (file.exists() && file.isFile) file.length() else 0L
          }
        }

        AsyncFunction("createDirectory") { path: String ->
        val dir = File(path)
        if (dir.exists()) throw Exception("EXISTS")
        val ok = dir.mkdirs()
        if (!ok) throw Exception("FAILED")
        path
    }

    AsyncFunction("writeTextFile") { path: String, content: String ->
        val file = File(path)
        file.parentFile?.mkdirs()
        file.writeText(content, Charsets.UTF_8)
        android.media.MediaScannerConnection.scanFile(
            appContext.reactContext,
            arrayOf(file.absolutePath),
            null, null
        )
        path
    }

    AsyncFunction("startWifiServer") { rootPath: String ->
      // Stop any existing server
      wifiServerRunning = false
      wifiServerSocket?.close()
      wifiServerThread?.interrupt()

      val serverSocket = java.net.ServerSocket(8080)
      wifiServerSocket = serverSocket
      wifiServerRunning = true

      wifiServerThread = Thread {
        while (wifiServerRunning) {
          try {
            val client = serverSocket.accept()
            Thread {
              try {
                handleWifiClient(client, rootPath)
              } catch (e: Exception) {
              } finally {
                try { client.close() } catch (e: Exception) {}
              }
            }.start()
          } catch (e: Exception) {
            if (!wifiServerRunning) break
          }
        }
      }.also { it.start() }

      // Get device IP — uses ConnectivityManager (API 31+ safe, no deprecation warnings)
      val ip = try {
      java.net.NetworkInterface.getNetworkInterfaces()
        ?.asSequence()
        ?.filter { it.name.startsWith("wlan") && it.isUp && !it.isLoopback }
        ?.flatMap { it.inetAddresses.asSequence() }
        ?.firstOrNull { it is java.net.Inet4Address && !it.isLoopbackAddress }
        ?.hostAddress ?: "unknown"
    } catch (e: Exception) { "unknown" }

      "http://$ip:8080"
    }

    AsyncFunction("stopWifiServer") {
      wifiServerRunning = false
      wifiServerSocket?.close()
      wifiServerSocket = null
      wifiServerThread?.interrupt()
      wifiServerThread = null
    }
  }

  private fun handleWifiClient(client: java.net.Socket, rootPath: String) {
    val rawInput = client.getInputStream()
    val output = client.getOutputStream()

    // Read line byte-by-byte — avoids BufferedReader buffering ahead into the body
    fun readRawLine(): String {
      val sb = StringBuilder()
      var prev = -1
      while (true) {
        val b = rawInput.read()
        if (b == -1) break
        if (prev == '\r'.code && b == '\n'.code) { sb.deleteCharAt(sb.length - 1); break }
        sb.append(b.toChar())
        prev = b
      }
      return sb.toString()
    }

    val requestLine = readRawLine()
    val parts = requestLine.split(" ")
    if (parts.size < 2) return
    val method = parts[0]
    val fullUri = parts[1]
    val uri = fullUri.substringBefore("?")
    val query = if (fullUri.contains("?")) fullUri.substringAfter("?") else ""

    val params = mutableMapOf<String, String>()
    query.split("&").forEach { param ->
      val kv = param.split("=")
      if (kv.size == 2) params[kv[0]] = java.net.URLDecoder.decode(kv[1], "UTF-8")
    }

    val headers = mutableMapOf<String, String>()
    var line = readRawLine()
    while (line.isNotEmpty()) {
      val idx = line.indexOf(':')
      if (idx > 0) headers[line.substring(0, idx).trim().lowercase()] = line.substring(idx + 1).trim()
      line = readRawLine()
    }
    // rawInput is now positioned exactly at start of body — no buffering stole bytes

    when {
      method == "GET" && (uri == "/" || uri == "") -> {
        val path = params["path"] ?: rootPath
        val dir = safeFile(rootPath, path) ?: File(rootPath)
        val files = dir.listFiles()
          ?.filter { !it.name.startsWith('.') }
          ?.sortedWith(compareBy({ !it.isDirectory }, { it.name }))
          ?: emptyList()
        val rows = files.joinToString("") { f ->
          val icon = if (f.isDirectory) "📁" else "📄"
          val size = if (f.isDirectory) "" else " (${f.length() / 1024}KB)"
          val encodedPath = java.net.URLEncoder.encode(f.absolutePath, "UTF-8")
          val link = if (f.isDirectory)
            "<a href='/?path=$encodedPath'>$icon ${f.name}</a>"
          else
            "<a href='/file?path=$encodedPath' download='${f.name}'>$icon ${f.name}$size</a>"
          "<div style='padding:10px;border-bottom:1px solid #eee'>$link</div>"
        }
        val backLink = if (path != rootPath)
          "<div style='margin-bottom:12px'><a href='/?path=${java.net.URLEncoder.encode(File(path).parent ?: rootPath, "UTF-8")}'>← Back</a></div>"
        else ""
        val html = """<!DOCTYPE html><html>
<head><meta name='viewport' content='width=device-width,initial-scale=1'><title>AskFiles WiFi Transfer</title>
<style>body{font-family:sans-serif;max-width:800px;margin:0 auto;padding:16px}a{text-decoration:none;color:#185FA5;font-size:16px}h1{color:#185FA5}.upload{margin:16px 0;padding:16px;background:#f5f5f5;border-radius:8px}button{background:#185FA5;color:white;border:none;padding:10px 20px;border-radius:6px;cursor:pointer}</style>
</head><body>
<h1>📱 AskFiles WiFi Transfer</h1>
$backLink
<div class='upload'><b>Upload to phone:</b><br><br>
<form method='POST' action='/upload?path=${java.net.URLEncoder.encode(path, "UTF-8")}' enctype='multipart/form-data'>
<input type='file' name='file' multiple><br><br><button type='submit'>Upload</button></form></div>
<b>Files:</b>$rows
</body></html>""".trimIndent()
        val body = html.toByteArray(Charsets.UTF_8)
        output.write("HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: ${body.size}\r\nConnection: close\r\n\r\n".toByteArray())
        output.write(body)
        output.flush()
      }

      method == "GET" && uri == "/file" -> {
        val path = params["path"] ?: return
        val file = safeFile(rootPath, path) ?: run {
            output.write("HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".toByteArray())
            return
        }
        if (!file.exists() || file.isDirectory) {
          output.write("HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".toByteArray())
          return
        }
        val ext = file.name.substringAfterLast('.').lowercase()
        val mime = when (ext) {
          "jpg", "jpeg" -> "image/jpeg"
          "png"         -> "image/png"
          "gif"         -> "image/gif"
          "webp"        -> "image/webp"
          "mp4"         -> "video/mp4"
          "mov"         -> "video/quicktime"
          "mp3"         -> "audio/mpeg"
          "m4a"         -> "audio/mp4"
          "pdf"         -> "application/pdf"
          "zip"         -> "application/zip"
          "txt"         -> "text/plain"
          "csv"         -> "text/csv"
          "docx"        -> "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          "xlsx"        -> "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          "pptx"        -> "application/vnd.openxmlformats-officedocument.presentationml.presentation"
          else          -> "application/octet-stream"
        }
        output.write("HTTP/1.1 200 OK\r\nContent-Type: $mime\r\nContent-Length: ${file.length()}\r\nContent-Disposition: attachment; filename=\"${file.name}\"\r\nConnection: close\r\n\r\n".toByteArray())
        FileInputStream(file).use { fis ->
          val buffer = ByteArray(65536)
          var bytes = fis.read(buffer)
          while (bytes >= 0) {
            output.write(buffer, 0, bytes)
            bytes = fis.read(buffer)
          }
        }
        output.flush()
      }

      method == "POST" && uri == "/upload" -> {
        val destPath = params["path"] ?: rootPath
        val safeDestPath = safeFile(rootPath, destPath)?.absolutePath ?: rootPath
        val contentType = headers["content-type"] ?: ""
        val boundary = contentType.substringAfter("boundary=").trim()
        val contentLength = headers["content-length"]?.toLongOrNull() ?: 0L

        if (boundary.isEmpty()) {
            output.write("HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".toByteArray())
            return
        }

        if (contentLength > 512 * 1024 * 1024) {
            output.write("HTTP/1.1 413 Payload Too Large\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".toByteArray())
            return
        }

        var savedCount = 0

        try {
            val boundaryBytes = "--$boundary".toByteArray(Charsets.UTF_8)

            // Sliding window buffer — holds 2x boundary size to detect boundary split across chunks
            val windowSize = 65536 + boundaryBytes.size * 2
            val window = ByteArray(windowSize)
            var windowLen = 0
            var totalRead = 0L

            // Fill window helper
            fun fillWindow() {
                while (windowLen < windowSize && totalRead < contentLength) {
                    val toRead = minOf(windowSize - windowLen, (contentLength - totalRead).toInt())
                    val read = rawInput.read(window, windowLen, toRead)
                    if (read == -1) return
                    windowLen += read
                    totalRead += read
                }
            }

            // Consume N bytes from front of window
            fun consume(n: Int) {
                if (n <= 0) return
                val remaining = windowLen - n
                if (remaining > 0) System.arraycopy(window, n, window, 0, remaining)
                windowLen = maxOf(0, remaining)
            }

            // Find sequence in window up to safeLen (leave boundary-size tail for split detection)
            fun findInWindow(seq: ByteArray, safeLen: Int): Int {
                val limit = minOf(safeLen, windowLen - seq.size + 1)
                outer@ for (i in 0 until limit) {
                    for (j in seq.indices) {
                        if (window[i + j] != seq[j]) continue@outer
                    }
                    return i
                }
                return -1
            }

            fillWindow()

            // Skip preamble up to first boundary
            val firstBoundary = findInWindow(boundaryBytes, windowLen)
            if (firstBoundary == -1) {
                output.write("HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".toByteArray())
                return
            }
            consume(firstBoundary + boundaryBytes.size)

            while (true) {
                fillWindow()

                // Check for final boundary or end
                if (windowLen < 2) break
                if (window[0] == '-'.code.toByte() && window[1] == '-'.code.toByte()) break

                // Skip \r\n after boundary
                if (windowLen >= 2 && window[0] == '\r'.code.toByte() && window[1] == '\n'.code.toByte()) {
                    consume(2)
                }
                fillWindow()

                // Read part headers until \r\n\r\n
                val partHeaderSb = StringBuilder()
                var fileName: String? = null
                var headerDone = false

                while (!headerDone) {
                    fillWindow()
                    val crlfcrlf = "\r\n\r\n".toByteArray()
                    val hdrEnd = findInWindow(crlfcrlf, windowLen - crlfcrlf.size + 1)
                    if (hdrEnd != -1) {
                        partHeaderSb.append(String(window, 0, hdrEnd, Charsets.UTF_8))
                        consume(hdrEnd + 4)
                        headerDone = true
                    } else {
                        // Header spans chunks — save all but tail
                        val safe = maxOf(0, windowLen - crlfcrlf.size)
                        if (safe > 0) {
                            partHeaderSb.append(String(window, 0, safe, Charsets.UTF_8))
                            consume(safe)
                        }
                        fillWindow()
                        if (windowLen == 0) break
                    }
                }

                val partHeader = partHeaderSb.toString()
                val rawName = Regex("filename=\"([^\"]+)\"", RegexOption.IGNORE_CASE)
                    .find(partHeader)?.groupValues?.get(1)
                fileName = rawName
                    ?.let { File(it).name }
                    ?.takeIf { it.isNotBlank() && !it.contains('/') && !it.contains('\\') }

                // The part data ends at \r\n--boundary
                val dataTerminator = "\r\n--$boundary".toByteArray(Charsets.UTF_8)

                if (fileName != null) {
                    val destFile = File(safeDestPath, fileName)
                    destFile.parentFile?.mkdirs()

                    FileOutputStream(destFile).use { fos ->
                        while (true) {
                            fillWindow()
                            if (windowLen == 0) break

                            val safeLen = windowLen - dataTerminator.size
                            val termPos = findInWindow(dataTerminator, windowLen)

                            when {
                                termPos != -1 -> {
                                    // Found terminator — write up to it, consume through it
                                    if (termPos > 0) fos.write(window, 0, termPos)
                                    consume(termPos + dataTerminator.size)
                                    break
                                }
                                safeLen > 0 -> {
                                    // No terminator yet — safe to flush safeLen bytes
                                    fos.write(window, 0, safeLen)
                                    consume(safeLen)
                                }
                                else -> {
                                    // Need more data
                                    fillWindow()
                                    if (windowLen == 0) break
                                }
                            }
                        }
                    }

                    android.media.MediaScannerConnection.scanFile(
                        appContext.reactContext,
                        arrayOf(destFile.absolutePath),
                        null, null
                    )
                    savedCount++
                } else {
                    // No filename — skip this part by consuming until terminator
                    while (true) {
                        fillWindow()
                        if (windowLen == 0) break
                        val termPos = findInWindow(dataTerminator, windowLen)
                        if (termPos != -1) {
                            consume(termPos + dataTerminator.size)
                            break
                        }
                        val safeLen = windowLen - dataTerminator.size
                        if (safeLen > 0) consume(safeLen)
                        else fillWindow()
                    }
                }

                fillWindow()
                // Check what follows — either \r\n (more parts) or -- (final boundary)
                if (windowLen >= 2) {
                    if (window[0] == '-'.code.toByte() && window[1] == '-'.code.toByte()) break
                }
            }

            val msg = if (savedCount == 1) "✅ 1 file uploaded" else "✅ $savedCount files uploaded"
            val encodedDest = java.net.URLEncoder.encode(safeDestPath, "UTF-8")
            val response = "<html><head><meta charset='utf-8'>" +
                "<meta http-equiv='refresh' content='2;url=/?path=$encodedDest'></head>" +
                "<body><h2>$msg</h2><p>Returning to folder...</p>" +
                "<a href='/?path=$encodedDest'>Back now</a></body></html>"
            val body = response.toByteArray(Charsets.UTF_8)
            output.write("HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: ${body.size}\r\nConnection: close\r\n\r\n".toByteArray())
            output.write(body)
            output.flush()

        } catch (e: Exception) {
            try {
                output.write("HTTP/1.1 500 Internal Server Error\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".toByteArray())
            } catch (_: Exception) {}
        }
    }

      else -> {
        output.write("HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".toByteArray())
      }
    }
  }

  private fun safeFile(rootPath: String, requestedPath: String): File? {
    val root = File(rootPath).canonicalFile
    val requested = File(requestedPath).canonicalFile
    return if (requested.path.startsWith(root.path)) requested else null
  }

  private fun findSequence(data: ByteArray, seq: ByteArray) = findSequenceFrom(data, seq, 0)

  private fun findSequenceFrom(data: ByteArray, seq: ByteArray, from: Int): Int {
    outer@ for (i in from..data.size - seq.size) {
      for (j in seq.indices) {
        if (data[i + j] != seq[j]) continue@outer
      }
      return i
    }
    return -1
  }
}
