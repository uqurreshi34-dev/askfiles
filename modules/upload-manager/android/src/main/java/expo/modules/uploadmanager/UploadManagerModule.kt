package expo.modules.uploadmanager

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileInputStream
import java.net.HttpURLConnection
import java.net.URL
import org.json.JSONObject

class UploadManagerModule : Module() {

    companion object {
        const val CHUNK_SIZE = 50 * 1024 * 1024 // 50MB chunks
    }

    override fun definition() = ModuleDefinition {
        Name("UploadManager")

        AsyncFunction("uploadToDropbox") { filePath: String, token: String, fileName: String ->
            val file = File(filePath)
            val fileSize = file.length()

            if (fileSize <= CHUNK_SIZE) {
                // Single upload
                val url = URL("https://content.dropboxapi.com/2/files/upload")
                val conn = url.openConnection() as HttpURLConnection
                conn.requestMethod = "POST"
                conn.setRequestProperty("Authorization", "Bearer $token")
                conn.setRequestProperty("Content-Type", "application/octet-stream")
                conn.setRequestProperty("Dropbox-API-Arg", JSONObject().apply {
                    put("path", "/$fileName")
                    put("mode", "overwrite")
                    put("autorename", false)
                    put("mute", true)
                }.toString())
                conn.doOutput = true
                conn.setFixedLengthStreamingMode(fileSize)

                FileInputStream(file).use { input ->
                    conn.outputStream.use { output ->
                        input.copyTo(output)
                    }
                }

                val status = conn.responseCode
                conn.disconnect()
                if (status == 507 || status == 413) return@AsyncFunction "storage_full"
                if (status !in 200..299) return@AsyncFunction "upload_failed"
                return@AsyncFunction "success"
            }

            // Chunked upload
            val buffer = ByteArray(CHUNK_SIZE)
            var offset = 0L
            var sessionId = ""
            var chunkIndex = 0

            FileInputStream(file).use { input ->
                while (offset < fileSize) {
                    val remaining = fileSize - offset
                    val chunkSize = minOf(CHUNK_SIZE.toLong(), remaining).toInt()
                    val bytesRead = input.read(buffer, 0, chunkSize)
                    if (bytesRead == -1) break
                    val isLast = offset + bytesRead >= fileSize

                    val uploadUrl = when {
                        chunkIndex == 0 -> "https://content.dropboxapi.com/2/files/upload_session/start"
                        isLast -> "https://content.dropboxapi.com/2/files/upload_session/finish"
                        else -> "https://content.dropboxapi.com/2/files/upload_session/append_v2"
                    }

                    val apiArg = when {
                        chunkIndex == 0 -> JSONObject().apply { put("close", false) }.toString()
                        isLast -> JSONObject().apply {
                            put("cursor", JSONObject().apply {
                                put("session_id", sessionId)
                                put("offset", offset)
                            })
                            put("commit", JSONObject().apply {
                                put("path", "/$fileName")
                                put("mode", "overwrite")
                                put("autorename", false)
                                put("mute", true)
                            })
                        }.toString()
                        else -> JSONObject().apply {
                            put("cursor", JSONObject().apply {
                                put("session_id", sessionId)
                                put("offset", offset)
                            })
                            put("close", false)
                        }.toString()
                    }

                    val url = URL(uploadUrl)
                    val conn = url.openConnection() as HttpURLConnection
                    conn.requestMethod = "POST"
                    conn.setRequestProperty("Authorization", "Bearer $token")
                    conn.setRequestProperty("Content-Type", "application/octet-stream")
                    conn.setRequestProperty("Dropbox-API-Arg", apiArg)
                    conn.doOutput = true
                    conn.setFixedLengthStreamingMode(bytesRead)

                    conn.outputStream.use { output ->
                        output.write(buffer, 0, bytesRead)
                    }

                    val status = conn.responseCode
                    if (chunkIndex == 0) {
                        val response = conn.inputStream.bufferedReader().readText()
                        sessionId = JSONObject(response).getString("session_id")
                    }
                    conn.disconnect()

                    if (status == 507 || status == 413) return@AsyncFunction "storage_full"
                    if (status !in 200..299) return@AsyncFunction "upload_failed"

                    offset += bytesRead
                    chunkIndex++
                }
            }

            "success"
        }

        AsyncFunction("uploadToOneDrive") { filePath: String, token: String, fileName: String ->
            val file = File(filePath)
            val fileSize = file.length()
            val encodedName = java.net.URLEncoder.encode(fileName, "UTF-8").replace("+", "%20")

            if (fileSize <= CHUNK_SIZE) {
                // Single upload
                val url = URL("https://graph.microsoft.com/v1.0/me/drive/special/approot:/$encodedName:/content")
                val conn = url.openConnection() as HttpURLConnection
                conn.requestMethod = "PUT"
                conn.setRequestProperty("Authorization", "Bearer $token")
                conn.setRequestProperty("Content-Type", "application/octet-stream")
                conn.doOutput = true
                conn.setFixedLengthStreamingMode(fileSize)

                FileInputStream(file).use { input ->
                    conn.outputStream.use { output ->
                        input.copyTo(output)
                    }
                }

                val status = conn.responseCode
                conn.disconnect()
                if (status == 507 || status == 413) return@AsyncFunction "storage_full"
                if (status !in 200..299) return@AsyncFunction "upload_failed"
                return@AsyncFunction "success"
            }

            // Large file — create upload session
            val sessionUrl = URL("https://graph.microsoft.com/v1.0/me/drive/special/approot:/$encodedName:/createUploadSession")
            val sessionConn = sessionUrl.openConnection() as HttpURLConnection
            sessionConn.requestMethod = "POST"
            sessionConn.setRequestProperty("Authorization", "Bearer $token")
            sessionConn.setRequestProperty("Content-Type", "application/json")
            sessionConn.doOutput = true
            sessionConn.outputStream.use { it.write("{}".toByteArray()) }

            val sessionResponse = sessionConn.inputStream.bufferedReader().readText()
            sessionConn.disconnect()
            val uploadUrl = JSONObject(sessionResponse).getString("uploadUrl")

            // Upload in chunks
            val buffer = ByteArray(CHUNK_SIZE)
            var offset = 0L

            FileInputStream(file).use { input ->
                while (offset < fileSize) {
                    val remaining = fileSize - offset
                    val chunkSize = minOf(CHUNK_SIZE.toLong(), remaining).toInt()
                    val bytesRead = input.read(buffer, 0, chunkSize)
                    if (bytesRead == -1) break

                    val end = offset + bytesRead - 1
                    val url = URL(uploadUrl)
                    val conn = url.openConnection() as HttpURLConnection
                    conn.requestMethod = "PUT"
                    conn.setRequestProperty("Content-Range", "bytes $offset-$end/$fileSize")
                    conn.setRequestProperty("Content-Type", "application/octet-stream")
                    conn.doOutput = true
                    conn.setFixedLengthStreamingMode(bytesRead)

                    conn.outputStream.use { output ->
                        output.write(buffer, 0, bytesRead)
                    }

                    val status = conn.responseCode
                    conn.disconnect()
                    if (status == 507 || status == 413) return@AsyncFunction "storage_full"
                    if (status !in 200..299 && status != 202) return@AsyncFunction "upload_failed"

                    offset += bytesRead
                }
            }

            "success"
        }

        AsyncFunction("uploadToGoogleDrive") { filePath: String, token: String, folderId: String, fileName: String, existingFileId: String ->
            val file = File(filePath)
            val fileSize = file.length()
            val mimeType = getMimeType(fileName)

            // Create resumable upload session
            val initUrl = if (existingFileId.isNotEmpty()) {
                URL("https://www.googleapis.com/upload/drive/v3/files/$existingFileId?uploadType=resumable")
            } else {
                URL("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable")
            }

            val metadata = JSONObject().apply {
                put("name", fileName)
                if (existingFileId.isEmpty()) {
                    put("parents", org.json.JSONArray().apply { put(folderId) })
                }
            }.toString()

            val initConn = initUrl.openConnection() as HttpURLConnection
            initConn.requestMethod = if (existingFileId.isNotEmpty()) "PATCH" else "POST"
            initConn.setRequestProperty("Authorization", "Bearer $token")
            initConn.setRequestProperty("Content-Type", "application/json")
            initConn.setRequestProperty("X-Upload-Content-Type", mimeType)
            initConn.setRequestProperty("X-Upload-Content-Length", fileSize.toString())
            initConn.doOutput = true
            initConn.outputStream.use { it.write(metadata.toByteArray()) }

            initConn.connect()
            val uploadUrl = initConn.getHeaderField("Location")
            initConn.disconnect()

            if (uploadUrl == null) return@AsyncFunction "upload_failed"

            // Upload in chunks
            val buffer = ByteArray(CHUNK_SIZE)
            var offset = 0L

            FileInputStream(file).use { input ->
                while (offset < fileSize) {
                    val remaining = fileSize - offset
                    val chunkSize = minOf(CHUNK_SIZE.toLong(), remaining).toInt()
                    val bytesRead = input.read(buffer, 0, chunkSize)
                    if (bytesRead == -1) break

                    val end = offset + bytesRead - 1
                    val url = URL(uploadUrl)
                    val conn = url.openConnection() as HttpURLConnection
                    conn.requestMethod = "PUT"
                    conn.setRequestProperty("Content-Range", "bytes $offset-$end/$fileSize")
                    conn.setRequestProperty("Content-Type", mimeType)
                    conn.doOutput = true
                    conn.setFixedLengthStreamingMode(bytesRead)

                    conn.outputStream.use { output ->
                        output.write(buffer, 0, bytesRead)
                    }

                    val status = conn.responseCode
                    conn.disconnect()
                    if (status == 507 || status == 413) return@AsyncFunction "storage_full"
                    if (status !in 200..299 && status != 308) return@AsyncFunction "upload_failed"

                    offset += bytesRead
                }
            }

            "success"
        }

    AsyncFunction("downloadFile") { url: String, headers: Map<String, String>, destPath: String, method: String ->
            val dest = File(destPath)
            dest.parentFile?.mkdirs()

            val connection = URL(url).openConnection() as HttpURLConnection
            connection.requestMethod = method
            headers.forEach { (key, value) -> connection.setRequestProperty(key, value) }
            if (method == "POST") {
                connection.doOutput = false
            }
            connection.connect()

            val status = connection.responseCode
            if (status !in 200..299) return@AsyncFunction "failed"

            connection.inputStream.use { input ->
                dest.outputStream().use { output ->
                    input.copyTo(output)
                }
            }
            "success"
        }
    }

    private fun getMimeType(fileName: String): String {
        val ext = fileName.substringAfterLast('.', "").lowercase()
        return when (ext) {
            "jpg", "jpeg" -> "image/jpeg"
            "png" -> "image/png"
            "gif" -> "image/gif"
            "webp" -> "image/webp"
            "heic" -> "image/heic"
            "mp4" -> "video/mp4"
            "mkv" -> "video/x-matroska"
            "mov" -> "video/quicktime"
            "pdf" -> "application/pdf"
            "doc" -> "application/msword"
            "docx" -> "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            "txt" -> "text/plain"
            else -> "application/octet-stream"
        }
    }
}
