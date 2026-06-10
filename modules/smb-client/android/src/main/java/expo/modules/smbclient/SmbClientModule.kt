package expo.modules.smbclient

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import jcifs.CIFSContext
import jcifs.config.PropertyConfiguration
import jcifs.context.BaseContext
import jcifs.smb.NtlmPasswordAuthenticator
import jcifs.smb.SmbFile
import java.util.Properties

class SmbClientModule : Module() {

  private fun buildContext(domain: String, username: String, password: String): CIFSContext {
    val props = Properties().apply {
      setProperty("jcifs.smb.client.minVersion", "SMB202")
      setProperty("jcifs.smb.client.maxVersion", "SMB302")
      setProperty("jcifs.smb.client.signingEnforced", "true")
      setProperty("jcifs.smb.client.useExtendedSecurity", "true")
      setProperty("jcifs.smb.client.disablePlainTextPasswords", "false")
      setProperty("jcifs.resolveOrder", "DNS,BCAST")
      setProperty("jcifs.smb.client.dfs.disabled", "true")
    }
    val base = BaseContext(PropertyConfiguration(props))
    val auth = NtlmPasswordAuthenticator(domain, username, password)
    return base.withCredentials(auth)
  }

  override fun definition() = ModuleDefinition {
    Name("SmbClient")
    Events("onDownloadProgress")

    AsyncFunction("listShares") { ip: String, domain: String, username: String, password: String ->
      val results = mutableListOf<String>()
      try {
        val ctx = buildContext(domain, username, password)
        val smbFile = SmbFile("smb://$ip/", ctx)
        smbFile.listFiles()?.forEach { f ->
          if (f.isDirectory) results.add(f.name.trimEnd('/'))
        }
      } catch (e: Exception) {
        android.util.Log.e("SmbClient", "listShares error: ${e.javaClass.name}: ${e.message}")
        throw e
      }
      results
    }

    AsyncFunction("listDirectory") { ip: String, share: String, path: String, domain: String, username: String, password: String ->
      val results = mutableListOf<Map<String, Any>>()
      try {
        val ctx = buildContext(domain, username, password)
        val url = "smb://$ip/$share/$path".trimEnd('/') + "/"
        val smbFile = SmbFile(url, ctx)
        smbFile.listFiles()?.forEach { f ->
          results.add(mapOf(
            "name" to f.name.trimEnd('/'),
            "isDirectory" to f.isDirectory,
            "size" to (if (f.isDirectory) 0L else f.length())
          ))
        }
      } catch (e: Exception) {
        android.util.Log.e("SmbClient", "listDirectory error: ${e.javaClass.name}: ${e.message}")
        throw e
      }
      results
    }

    AsyncFunction("downloadFile") { ip: String, share: String, remotePath: String, localPath: String, domain: String, username: String, password: String ->
      try {
        val ctx = buildContext(domain, username, password)
        val url = "smb://$ip/$share/$remotePath"
        val smbFile = SmbFile(url, ctx)
        val totalBytes = smbFile.length()
        val localFile = java.io.File(localPath)
        localFile.parentFile?.mkdirs()
        var bytesRead = 0L
        val buffer = ByteArray(65536)
        smbFile.inputStream.use { input ->
          java.io.FileOutputStream(localFile).use { output ->
            var n: Int
            while (input.read(buffer).also { n = it } != -1) {
              output.write(buffer, 0, n)
              bytesRead += n
              val percent = if (totalBytes > 0) ((bytesRead * 100) / totalBytes).toInt() else 0
              sendEvent("onDownloadProgress", mapOf("percent" to percent, "bytesRead" to bytesRead, "total" to totalBytes))
            }
          }
        }
      } catch (e: Exception) {
        android.util.Log.e("SmbClient", "downloadFile error: ${e.javaClass.name}: ${e.message}")
        throw e
      }
      localPath
    }

    AsyncFunction("uploadFile") { localPath: String, ip: String, share: String, remotePath: String, domain: String, username: String, password: String ->
      try {
        val ctx = buildContext(domain, username, password)
        val url = "smb://$ip/$share/$remotePath"
        val smbFile = SmbFile(url, ctx)
        val localFile = java.io.File(localPath)
        val totalBytes = localFile.length()
        var bytesWritten = 0L
        val buffer = ByteArray(65536)
        java.io.FileInputStream(localFile).use { input ->
          smbFile.outputStream.use { output ->
            var n: Int
            while (input.read(buffer).also { n = it } != -1) {
              output.write(buffer, 0, n)
              bytesWritten += n
              val percent = if (totalBytes > 0) ((bytesWritten * 100) / totalBytes).toInt() else 0
              sendEvent("onDownloadProgress", mapOf("percent" to percent, "bytesRead" to bytesWritten, "total" to totalBytes))
            }
          }
        }
      } catch (e: Exception) {
        android.util.Log.e("SmbClient", "uploadFile error: ${e.javaClass.name}: ${e.message}")
        throw e
      }
      remotePath
    }
  }
}
