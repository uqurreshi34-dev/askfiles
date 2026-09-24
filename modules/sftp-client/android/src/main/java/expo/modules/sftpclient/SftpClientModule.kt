package expo.modules.sftpclient

import com.jcraft.jsch.ChannelSftp
import com.jcraft.jsch.JSch
import com.jcraft.jsch.JSchException
import com.jcraft.jsch.Session
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.util.Locale

class SftpClientModule : Module() {

    private var session: Session? = null
    private var channel: ChannelSftp? = null

    override fun definition() = ModuleDefinition {
        Name("SftpClient")
        Events("onTransferProgress")

        AsyncFunction("connect") { host: String, port: Int, username: String, password: String ->
            disconnect()
            val target = host.trim().lowercase(Locale.ROOT)
            val jsch = JSch()
            val recorder = hostKeys().attach(jsch)
            val s = jsch.getSession(username, target, port)
            val passwordBytes = password.toByteArray()
            try {
                s.setPassword(passwordBytes)
                // The server's key is checked during key exchange, before the password is sent.
                s.setConfig("StrictHostKeyChecking", "yes")
                s.setConfig("PreferredAuthentications", "password")
                try {
                    s.connect(10000)
                } catch (e: JSchException) {
                    val found = hostKeys().rejected(jsch, target, port, recorder) ?: throw e
                    val code = if (found.changed) "ERR_SFTP_HOST_KEY_CHANGED" else "ERR_SFTP_HOST_KEY_UNKNOWN"
                    throw CodedException(code, "Server key needs confirming: ${found.fingerprint}", e)
                }
            } finally {
                passwordBytes.fill(0)
            }
            val ch = s.openChannel("sftp") as ChannelSftp
            ch.connect()
            session = s
            channel = ch
            "connected"
        }

        AsyncFunction("listDirectory") { path: String ->
            val ch = channel ?: throw Exception("Not connected")
            val entries = ch.ls(path)
            val result = mutableListOf<Map<String, Any>>()
            for (entry in entries) {
                entry as ChannelSftp.LsEntry
                val name = entry.filename
                if (name == "." || name == "..") continue
                val attrs = entry.attrs
                result.add(mapOf(
                    "name" to name,
                    "isDirectory" to attrs.isDir,
                    "size" to attrs.size,
                    "modifiedTime" to (attrs.mTime.toLong() * 1000L)
                ))
            }
            result
        }

        AsyncFunction("downloadFile") { remotePath: String, localPath: String ->
            val ch = channel ?: throw Exception("Not connected")
            val file = File(localPath)
            file.parentFile?.mkdirs()
            var totalSize = 0L
            FileOutputStream(file).use { out ->
                ch.get(remotePath, out, object : com.jcraft.jsch.SftpProgressMonitor {
                    override fun init(op: Int, src: String, dest: String, max: Long) { totalSize = max }
                    override fun count(bytes: Long): Boolean {
                        val percent = if (totalSize > 0) ((file.length() * 100) / totalSize).toInt() else 0
                        sendEvent("onTransferProgress", mapOf("percent" to percent))
                        return true
                    }
                    override fun end() { sendEvent("onTransferProgress", mapOf("percent" to 100)) }
                })
            }
            localPath
        }

        AsyncFunction("uploadFile") { localPath: String, remotePath: String ->
            val ch = channel ?: throw Exception("Not connected")
            val totalSize = File(localPath).length()
            var transferred = 0L
            FileInputStream(File(localPath)).use { inp ->
                ch.put(inp, remotePath, object : com.jcraft.jsch.SftpProgressMonitor {
                    override fun init(op: Int, src: String, dest: String, max: Long) {}
                    override fun count(bytes: Long): Boolean {
                        transferred += bytes
                        val percent = if (totalSize > 0) ((transferred * 100) / totalSize).toInt() else 0
                        sendEvent("onTransferProgress", mapOf("percent" to percent))
                        return true
                    }
                    override fun end() { sendEvent("onTransferProgress", mapOf("percent" to 100)) }
                })
            }
            remotePath
        }

        AsyncFunction("disconnect") {
            disconnect()
            "disconnected"
        }

        AsyncFunction("pendingHostKey") {
            hostKeys().pending()?.let {
                mapOf(
                    "host" to it.host,
                    "port" to it.port,
                    "type" to it.type,
                    "fingerprint" to it.fingerprint,
                    "changed" to it.changed
                )
            }
        }

        AsyncFunction("trustHostKey") { host: String, port: Int, fingerprint: String ->
            hostKeys().trust(host.trim().lowercase(Locale.ROOT), port, fingerprint)
        }
    }

    private var verifier: HostKeyVerifier? = null

    @Synchronized
    private fun hostKeys(): HostKeyVerifier {
        verifier?.let { return it }
        val context = appContext.reactContext ?: throw Exception("AskFiles context is unavailable.")
        return HostKeyVerifier(File(context.filesDir, "sftp_known_hosts")).also { verifier = it }
    }

    private fun disconnect() {
        try { channel?.disconnect() } catch (_: Exception) {}
        try { session?.disconnect() } catch (_: Exception) {}
        channel = null
        session = null
    }
}
