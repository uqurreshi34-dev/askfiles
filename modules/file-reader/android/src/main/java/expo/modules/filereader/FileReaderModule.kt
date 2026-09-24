package expo.modules.filereader

import android.net.Uri
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream

class FileReaderModule : Module() {

  private val wifi = WifiTransfer { file ->
    android.media.MediaScannerConnection.scanFile(appContext.reactContext, arrayOf(file.absolutePath), null, null)
  }

  override fun definition() = ModuleDefinition {
    Name("FileReader")

    Events("onCopyProgress")

    AsyncFunction("checkDuplicates") { paths: List<String> ->
      paths.filter { java.io.File(it).exists() }
    }

    AsyncFunction("readDirectory") { path: String, includeHidden: Boolean ->
      val dir = File(path)
      if (!dir.exists() || !dir.isDirectory) return@AsyncFunction emptyList<Map<String, Any>>()
      dir.listFiles()
        ?.filter { includeHidden || !it.name.startsWith('.') }
        ?.map { file ->
          mapOf(
            "name" to file.name,
            "uri" to "file://" + file.absolutePath + (if (file.isDirectory) "/" else ""),
            "isDirectory" to file.isDirectory,
            "size" to if (file.isDirectory) 0L else file.length(),
            "date" to file.lastModified()
          )
        }
        ?.sortedWith(compareBy({ if (it["isDirectory"] as Boolean) 0 else 1 }, { (it["name"] as String).lowercase() }))
        ?: emptyList()
    }

    AsyncFunction("countFolder") { path: String, includeHidden: Boolean ->
      val dir = File(path)
      if (!dir.exists() || !dir.isDirectory) return@AsyncFunction 0
      dir.listFiles()?.count { includeHidden || !it.name.startsWith('.') } ?: 0
    }

    AsyncFunction("readTextPreview") { path: String ->
      try {
        val file = File(path)
        if (!file.exists() || !file.isFile) return@AsyncFunction null
        val buffer = ByteArray(500)
        val bytesRead = FileInputStream(file).use { it.read(buffer) }
        if (bytesRead <= 0) return@AsyncFunction null
        val raw = String(buffer, 0, bytesRead, Charsets.UTF_8)
        // Take first 3 non-empty lines, max 300 chars total
        val lines = raw.lines()
          .map { it.trim() }
          .filter { it.isNotEmpty() }
          .take(3)
          .joinToString("\n")
        lines.take(300)
      } catch (e: Exception) {
        null
      }
    }

    // Extracts the first lines of readable body text from a .docx (a zip). The
    // visible text lives in <w:t> elements inside word/document.xml — pulling ONLY
    // those avoids the table-property XML soup that broke naive tag-stripping before.
    // Streams document.xml and STOPS once enough text is gathered, so a large doc is
    // never fully loaded (no OOM). Every stream is .use{}-closed. Returns up to 3
    // lines / 300 chars, or null if unreadable.
    AsyncFunction("readDocxPreview") { path: String ->
      try {
        val file = File(path)
        if (!file.exists() || !file.isFile) return@AsyncFunction null

        java.util.zip.ZipFile(file).use { zip ->
          val entry = zip.getEntry("word/document.xml") ?: return@AsyncFunction null

          zip.getInputStream(entry).use { stream ->
            val reader = stream.bufferedReader(Charsets.UTF_8)
            val sb = StringBuilder()
            val buffer = CharArray(4096)
            // Read in chunks, stop early once we have plenty to work with (~2KB of
            // raw XML comfortably contains the first few paragraphs of text).
            var totalRead = 0
            while (totalRead < 20000) { // hard cap: never read more than ~20KB of XML
              val n = reader.read(buffer)
              if (n == -1) break
              sb.append(buffer, 0, n)
              totalRead += n
              // Once we have several <w:t> hits, we can stop early.
              if (sb.count { it == '>' } > 40 && Regex("<w:t[ >]").findAll(sb).count() >= 6) break
            }

            val xml = sb.toString()

            // Pull text from every <w:t ...>...</w:t>. Paragraphs are <w:p>; treat
            // each as a line break so lines read naturally.
            // First, mark paragraph boundaries, then extract w:t contents in order.
            val text = StringBuilder()
            val matcher = Regex("<w:p[ >]|<w:t[^>]*>([^<]*)</w:t>")
            for (m in matcher.findAll(xml)) {
              val captured = m.groupValues[1]
              if (m.value.startsWith("<w:p")) {
                if (text.isNotEmpty() && !text.endsWith("\n")) text.append("\n")
              } else if (captured.isNotEmpty()) {
                text.append(captured)
              }
            }

            // Un-escape the handful of XML entities that appear in text.
            val decoded = text.toString()
              .replace("&amp;", "&")
              .replace("&lt;", "<")
              .replace("&gt;", ">")
              .replace("&quot;", "\"")
              .replace("&apos;", "'")

            val lines = decoded.lines()
              .map { it.trim() }
              .filter { it.isNotEmpty() }
              .take(3)
              .joinToString("\n")

            lines.take(300).ifEmpty { null }
          }
        }
      } catch (e: Exception) {
        null
      }
    }

    Function("getShowHidden") {
      val prefs = appContext.reactContext
          ?.getSharedPreferences("askfiles_prefs", android.content.Context.MODE_PRIVATE)
      prefs?.getBoolean("show_hidden", false) ?: false
    }

    Function("setShowHidden") { value: Boolean ->
        val prefs = appContext.reactContext
            ?.getSharedPreferences("askfiles_prefs", android.content.Context.MODE_PRIVATE)
        prefs?.edit()?.putBoolean("show_hidden", value)?.apply()
    }

    AsyncFunction("batchRename") { items: List<Map<String, String>> ->
      val results = mutableListOf<Map<String, Any>>()
      for (item in items) {
          val src = item["src"] ?: continue
          val dst = item["dst"] ?: continue
          val srcFile = File(src)
          val dstFile = File(dst)
          try {
              if (!srcFile.exists()) {
                  results.add(mapOf("src" to src, "dst" to dst, "success" to false, "error" to "Source not found"))
                  continue
              }
              // Resolve collision: if dst exists, append _2, _3 etc
              var finalDst = dstFile
              if (finalDst.exists() && finalDst.absolutePath != srcFile.absolutePath) {
                  val nameNoExt = dstFile.nameWithoutExtension
                  val ext = dstFile.extension
                  var counter = 2
                  while (finalDst.exists()) {
                      finalDst = File(dstFile.parent, if (ext.isNotEmpty()) "${nameNoExt}_$counter.$ext" else "${nameNoExt}_$counter")
                      counter++
                  }
              }
              finalDst.parentFile?.mkdirs()
              var ok = srcFile.renameTo(finalDst)
            if (!ok) {
                // Cross-filesystem — fall back to copy + delete
                try {
                    srcFile.inputStream().use { input ->
                        finalDst.outputStream().use { output ->
                            input.copyTo(output, bufferSize = 65536)
                        }
                    }
                    srcFile.delete()
                    ok = true
                } catch (e2: Exception) {
                    ok = false
                }
            }
            if (ok) {
                results.add(mapOf("src" to src, "dst" to finalDst.absolutePath, "success" to true))
            } else {
                results.add(mapOf("src" to src, "dst" to dst, "success" to false, "error" to "Rename failed"))
            }
          } catch (e: Exception) {
              results.add(mapOf("src" to src, "dst" to dst, "success" to false, "error" to (e.message ?: "Unknown error")))
          }
      }
      results
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

    AsyncFunction("copyFolderRecursive") { srcPath: String, destPath: String ->
      val srcFolder = File(srcPath)
      val destFolder = File(destPath)
      if (!srcFolder.exists() || !srcFolder.isDirectory) throw Exception("Source folder not found")

      var filesCopied = 0
      val totalFiles = srcFolder.walkTopDown().count { it.isFile }

      fun copyRecursive(src: File, dest: File) {
        if (src.isDirectory) {
          dest.mkdirs()
          src.listFiles()?.forEach { child ->
            copyRecursive(child, File(dest, child.name))
          }
        } else {
          try {
            dest.parentFile?.mkdirs()
            val totalBytes = src.length()
            var bytesCopied = 0L
            var lastReportedPercent = -1
            val buffer = ByteArray(65536)
            FileInputStream(src).use { input ->
              FileOutputStream(dest).use { output ->
                var bytes = input.read(buffer)
                while (bytes >= 0) {
                  output.write(buffer, 0, bytes)
                  bytesCopied += bytes
                  if (totalBytes > 0) {
                    val percent = ((bytesCopied * 100) / totalBytes).toInt()
                    if (percent != lastReportedPercent && percent % 10 == 0) {
                      lastReportedPercent = percent
                      sendEvent("onCopyProgress", mapOf(
                        "percent" to percent,
                        "bytesCopied" to bytesCopied,
                        "totalBytes" to totalBytes,
                        "currentFile" to src.name,
                        "filesCopied" to filesCopied,
                        "totalFiles" to totalFiles
                      ))
                    }
                  }
                  bytes = input.read(buffer)
                }
                output.flush()
              }
            }
            filesCopied++
            // Fire one event per completed file
            sendEvent("onCopyProgress", mapOf(
              "percent" to 100,
              "bytesCopied" to src.length(),
              "totalBytes" to src.length(),
              "currentFile" to src.name,
              "filesCopied" to filesCopied,
              "totalFiles" to totalFiles
            ))
          } catch (e: Exception) {
            // Skip unreadable files — don't abort entire folder copy
          }
        }
      }

        destFolder.mkdirs()
        srcFolder.listFiles()?.forEach { child ->
          copyRecursive(child, File(destFolder, child.name))
        }

        android.media.MediaScannerConnection.scanFile(
          appContext.reactContext,
          arrayOf(destFolder.absolutePath),
          null, null
        )
        destPath
    }

AsyncFunction("moveFolderRecursive") { srcPath: String, destPath: String ->
  val srcFolder = File(srcPath)
  val destFolder = File(destPath)
  if (!srcFolder.exists() || !srcFolder.isDirectory) throw Exception("Source folder not found")

  // Try atomic rename first — instant on same filesystem
  destFolder.parentFile?.mkdirs()
  if (srcFolder.renameTo(destFolder)) {
    android.media.MediaScannerConnection.scanFile(
      appContext.reactContext,
      arrayOf(destFolder.absolutePath),
      null, null
    )
    return@AsyncFunction destPath
  }

  // Cross-filesystem — copy then delete
  var filesCopied = 0
  val totalFiles = srcFolder.walkTopDown().count { it.isFile }

  fun copyRecursive(src: File, dest: File) {
    if (src.isDirectory) {
      dest.mkdirs()
      src.listFiles()?.forEach { child ->
        copyRecursive(child, File(dest, child.name))
      }
    } else {
      try {
        dest.parentFile?.mkdirs()
        val totalBytes = src.length()
        var bytesCopied = 0L
        var lastReportedPercent = -1
        val buffer = ByteArray(65536)
        FileInputStream(src).use { input ->
          FileOutputStream(dest).use { output ->
            var bytes = input.read(buffer)
            while (bytes >= 0) {
              output.write(buffer, 0, bytes)
              bytesCopied += bytes
              if (totalBytes > 0) {
                val percent = ((bytesCopied * 100) / totalBytes).toInt()
                if (percent != lastReportedPercent && percent % 10 == 0) {
                  lastReportedPercent = percent
                  sendEvent("onCopyProgress", mapOf(
                    "percent" to percent,
                    "bytesCopied" to bytesCopied,
                    "totalBytes" to totalBytes,
                    "currentFile" to src.name,
                    "filesCopied" to filesCopied,
                    "totalFiles" to totalFiles
                  ))
                }
              }
              bytes = input.read(buffer)
            }
            output.flush()
          }
        }
        filesCopied++
        sendEvent("onCopyProgress", mapOf(
          "percent" to 100,
          "bytesCopied" to src.length(),
          "totalBytes" to src.length(),
          "currentFile" to src.name,
          "filesCopied" to filesCopied,
          "totalFiles" to totalFiles
        ))
      } catch (e: Exception) {
        // Skip unreadable files
      }
    }
  }

  destFolder.mkdirs()
  srcFolder.listFiles()?.forEach { child ->
    copyRecursive(child, File(destFolder, child.name))
  }

  // Only delete source after successful copy
  srcFolder.deleteRecursively()

  android.media.MediaScannerConnection.scanFile(
    appContext.reactContext,
    arrayOf(destFolder.absolutePath),
    null, null
  )
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
      val info = startWifi(rootPath)
      mapOf(
        "url" to info.url,
        "loginUrl" to info.loginUrl,
        "address" to info.address,
        "port" to info.port,
        "password" to info.password
      )
    }

    AsyncFunction("stopWifiServer") {
      wifi.stop()
    }

    // Replace the saved password. Signs out every browser and cancels shared links at once.
    AsyncFunction("newWifiPassword") {
      val fresh = WifiTransfer.newPassword()
      wifiPrefs().edit().putString(WIFI_PASSWORD_KEY, fresh).apply()
      wifi.changePassword(fresh)
      fresh
    }

    // A link to this one file, for another device to download. Nothing else on the phone is
    // reachable through it, and it stops working after an hour.
    AsyncFunction("shareFileViaWifi") { path: String ->
      if (!wifi.isRunning) {
        startWifi("/storage/emulated/0/")
      }
      try {
        wifi.share(path)
      } catch (e: IllegalArgumentException) {
        throw CodedException("ERR_WIFI_SHARE", e.message ?: "That file cannot be shared.", e)
      }
    }

    Function("getMostUsedEnabled") {
      appContext.reactContext!!
        .getSharedPreferences("askfiles_prefs", android.content.Context.MODE_PRIVATE)
        .getBoolean("most_used_enabled", true)
    }

    Function("setMostUsedEnabled") { value: Boolean ->
      appContext.reactContext!!
        .getSharedPreferences("askfiles_prefs", android.content.Context.MODE_PRIVATE)
        .edit().putBoolean("most_used_enabled", value).apply()
    }
  }

  private companion object {
    const val WIFI_PREFS = "askfiles_wifi"
    const val WIFI_PASSWORD_KEY = "password"
    const val WIFI_PORT = 8080
  }

  private fun startWifi(rootPath: String): WifiTransfer.Info {
    val address = localAddress()
      ?: throw CodedException("ERR_WIFI_NO_NETWORK", "Connect to Wi-Fi to share files.", null)
    return wifi.start(rootPath, address, WIFI_PORT, wifiPassword())
  }

  private fun wifiPrefs() =
    (appContext.reactContext ?: throw Exception("AskFiles context is unavailable."))
      .getSharedPreferences(WIFI_PREFS, android.content.Context.MODE_PRIVATE)

  /** One password per phone, kept in private storage, so a browser that saved it keeps working. */
  @Synchronized
  private fun wifiPassword(): String {
    val prefs = wifiPrefs()
    prefs.getString(WIFI_PASSWORD_KEY, null)?.let { return it }
    val fresh = WifiTransfer.newPassword()
    prefs.edit().putString(WIFI_PASSWORD_KEY, fresh).apply()
    return fresh
  }

  /**
   * The phone's address on the local network: wifi, or its own hotspot. Mobile data and VPN
   * interfaces are skipped. Same rule as the FTP share, which lives in its own module.
   */
  @Suppress("DEPRECATION")
  private fun localAddress(): String? {
    val context = appContext.reactContext ?: return null
    val connectivity = context.getSystemService(android.content.Context.CONNECTIVITY_SERVICE)
      as? android.net.ConnectivityManager

    val joined = mutableSetOf<String>()
    val excluded = mutableSetOf<String>()

    connectivity?.allNetworks?.forEach { network ->
      val caps = connectivity.getNetworkCapabilities(network) ?: return@forEach
      val name = connectivity.getLinkProperties(network)?.interfaceName ?: return@forEach
      when {
        caps.hasTransport(android.net.NetworkCapabilities.TRANSPORT_WIFI) ||
          caps.hasTransport(android.net.NetworkCapabilities.TRANSPORT_ETHERNET) -> joined.add(name)
        caps.hasTransport(android.net.NetworkCapabilities.TRANSPORT_CELLULAR) ||
          caps.hasTransport(android.net.NetworkCapabilities.TRANSPORT_VPN) -> excluded.add(name)
      }
    }

    val candidates = try {
      java.net.NetworkInterface.getNetworkInterfaces()?.toList().orEmpty()
        .filter { it.isUp && !it.isLoopback && it.name !in excluded }
        .flatMap { iface ->
          iface.inetAddresses.toList()
            .filterIsInstance<java.net.Inet4Address>()
            .filter { it.isSiteLocalAddress }
            .map { iface.name to (it.hostAddress ?: "") }
        }
        .filter { it.second.isNotEmpty() }
    } catch (e: Exception) {
      emptyList()
    }

    return (candidates.firstOrNull { it.first in joined } ?: candidates.firstOrNull())?.second
  }
}
