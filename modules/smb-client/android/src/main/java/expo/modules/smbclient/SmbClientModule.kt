package expo.modules.smbclient

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import jcifs.config.PropertyConfiguration
import jcifs.context.BaseContext
import jcifs.smb.NtlmPasswordAuthenticator
import jcifs.smb.SmbFile
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.net.InetAddress
import java.util.Properties

class SmbClientModule : Module() {

  private fun buildContext(username: String, password: String, domain: String = ""): BaseContext {
    val props = Properties().apply {
      setProperty("jcifs.smb.client.minVersion", "SMB202")
      setProperty("jcifs.smb.client.maxVersion", "SMB300")
      setProperty("jcifs.resolveOrder", "DNS")
    }
    return BaseContext(PropertyConfiguration(props))
  }

  private fun smbUrl(ip: String, share: String = "", path: String = ""): String {
    val base = "smb://$ip/"
    return when {
      share.isEmpty() -> base
      path.isEmpty() -> "$base$share/"
      else -> "$base$share/$path"
    }
  }

  override fun definition() = ModuleDefinition {
    Name("SmbClient")

    AsyncFunction("discoverDevices") {
      val results = mutableListOf<Map<String, String>>()
      try {
        // Get local subnet and scan for SMB devices on port 445
        val localIp = InetAddress.getLocalHost().hostAddress ?: return@AsyncFunction results
        val subnet = localIp.substringBeforeLast(".")
        val jobs = (1..254).map { i ->
          val ip = "$subnet.$i"
          try {
            val addr = InetAddress.getByName(ip)
            if (addr.isReachable(200)) {
              // Check if port 445 is open (SMB)
              val socket = java.net.Socket()
              try {
                socket.connect(java.net.InetSocketAddress(ip, 445), 200)
                socket.close()
                val name = try { addr.canonicalHostName } catch (e: Exception) { ip }
                results.add(mapOf("name" to name, "ip" to ip))
              } catch (e: Exception) {
                // Port 445 not open
              }
            }
          } catch (e: Exception) {}
        }
      } catch (e: Exception) {}
      results
    }

    AsyncFunction("listShares") { ip: String, username: String, password: String ->
      val results = mutableListOf<String>()
      try {
        val ctx = buildContext(username, password)
        val auth = NtlmPasswordAuthenticator("", username, password)
        val url = smbUrl(ip)
        android.util.Log.d("SmbClient", "Connecting to: $url with user: $username")
        val smbFile = SmbFile(url, ctx.withCredentials(auth))
        val files = smbFile.listFiles()
        android.util.Log.d("SmbClient", "Files: ${files?.size} found")
        files?.forEach { f ->
          android.util.Log.d("SmbClient", "Entry: ${f.name} isDir=${f.isDirectory}")
          if (f.isDirectory) results.add(f.name.trimEnd('/'))
        }
      } catch (e: Exception) {
        android.util.Log.e("SmbClient", "Error: ${e.javaClass.name}: ${e.message}")
      }
      results
    }

    AsyncFunction("listDirectory") { ip: String, share: String, path: String, username: String, password: String ->
      val results = mutableListOf<Map<String, Any>>()
      try {
        val ctx = buildContext(username, password)
        val auth = NtlmPasswordAuthenticator("", username, password)
        val url = smbUrl(ip, share, path)
        val smbFile = SmbFile(url, ctx.withCredentials(auth))
        smbFile.listFiles()?.forEach { f ->
          val name = f.name.trimEnd('/')
          if (!name.startsWith('.')) {
            results.add(mapOf(
              "name" to name,
              "isDirectory" to f.isDirectory,
              "size" to f.length().toDouble(),
            ))
          }
        }
      } catch (e: Exception) {}
      results
    }

    AsyncFunction("copyFromSmb") { ip: String, share: String, remotePath: String, localPath: String, username: String, password: String ->
      val ctx = buildContext(username, password)
      val auth = NtlmPasswordAuthenticator("", username, password)
      val url = smbUrl(ip, share, remotePath)
      val smbFile = SmbFile(url, ctx.withCredentials(auth))
      val destFile = File(localPath)
      destFile.parentFile?.mkdirs()
      val buffer = ByteArray(65536)
      smbFile.inputStream.use { input ->
        FileOutputStream(destFile).use { output ->
          var bytes = input.read(buffer)
          while (bytes >= 0) {
            output.write(buffer, 0, bytes)
            bytes = input.read(buffer)
          }
        }
      }
      localPath
    }

    AsyncFunction("copyToSmb") { ip: String, share: String, remotePath: String, localPath: String, username: String, password: String ->
      val ctx = buildContext(username, password)
      val auth = NtlmPasswordAuthenticator("", username, password)
      val url = smbUrl(ip, share, remotePath)
      val smbFile = SmbFile(url, ctx.withCredentials(auth))
      val buffer = ByteArray(65536)
      FileInputStream(File(localPath)).use { input ->
        smbFile.outputStream.use { output ->
          var bytes = input.read(buffer)
          while (bytes >= 0) {
            output.write(buffer, 0, bytes)
            bytes = input.read(buffer)
          }
        }
      }
      remotePath
    }
  }
}
