package expo.modules.webdavclient

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import okhttp3.Credentials
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import org.xmlpull.v1.XmlPullParser
import org.xmlpull.v1.XmlPullParserFactory
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.TimeUnit

class WebdavClientModule : Module() {

    private var client: OkHttpClient? = null
    private var baseUrl: String = ""
    private var credentials: String = ""

    override fun definition() = ModuleDefinition {
        Name("WebDavClient")

        AsyncFunction("connect") { url: String, username: String, password: String ->
            val c = OkHttpClient.Builder()
                .connectTimeout(15, TimeUnit.SECONDS)
                .readTimeout(30, TimeUnit.SECONDS)
                .writeTimeout(30, TimeUnit.SECONDS)
                .build()
            val creds = Credentials.basic(username, password)
            // Validate connection with PROPFIND
            val request = Request.Builder()
                .url(url)
                .header("Authorization", creds)
                .header("Depth", "0")
                .method("PROPFIND", ByteArray(0).toRequestBody(null))
                .build()
            val response = c.newCall(request).execute()
            response.close()
            if (!response.isSuccessful && response.code != 207) {
                throw Exception("Connection failed: ${response.code}")
            }
            client = c
            credentials = creds
            baseUrl = if (url.endsWith("/")) url else "$url/"
            "connected"
        }

        AsyncFunction("listDirectory") { path: String ->
            val c = client ?: throw Exception("Not connected")
            val url = buildUrl(path)
            val body = """<?xml version="1.0" encoding="utf-8"?>
                <propfind xmlns="DAV:">
                  <prop>
                    <resourcetype/>
                    <getcontentlength/>
                    <getlastmodified/>
                    <displayname/>
                  </prop>
                </propfind>""".trimIndent()
            val request = Request.Builder()
                .url(url)
                .header("Authorization", credentials)
                .header("Depth", "1")
                .method("PROPFIND", body.toRequestBody("application/xml; charset=utf-8".toMediaTypeOrNull()))
                .build()
            val response = c.newCall(request).execute()
            val responseBody = response.body?.string() ?: throw Exception("Empty response")
            response.close()
            android.util.Log.d("WebDavClient", "PROPFIND response: $responseBody")
            if (response.code != 207) throw Exception("List failed: ${response.code}")
            parsePropfind(responseBody, url)
        }

        AsyncFunction("downloadFile") { remotePath: String, localPath: String ->
            val c = client ?: throw Exception("Not connected")
            val url = buildUrl(remotePath)
            val request = Request.Builder()
                .url(url)
                .header("Authorization", credentials)
                .get()
                .build()
            val response = c.newCall(request).execute()
            if (!response.isSuccessful) throw Exception("Download failed: ${response.code}")
            val file = File(localPath)
            file.parentFile?.mkdirs()
            response.body?.byteStream()?.use { input ->
                FileOutputStream(file).use { output ->
                    input.copyTo(output)
                }
            }
            response.close()
            localPath
        }

        AsyncFunction("uploadFile") { localPath: String, remotePath: String ->
            val c = client ?: throw Exception("Not connected")
            val url = buildUrl(remotePath)
            val file = File(localPath)
            val mimeType = android.webkit.MimeTypeMap.getSingleton()
                .getMimeTypeFromExtension(file.extension) ?: "application/octet-stream"
            val request = Request.Builder()
                .url(url)
                .header("Authorization", credentials)
                .put(file.asRequestBody(mimeType.toMediaTypeOrNull()))
                .build()
            val response = c.newCall(request).execute()
            response.close()
            if (!response.isSuccessful) throw Exception("Upload failed: ${response.code}")
            remotePath
        }

        AsyncFunction("createDirectory") { path: String ->
            val c = client ?: throw Exception("Not connected")
            val url = buildUrl(path)
            val request = Request.Builder()
                .url(url)
                .header("Authorization", credentials)
                .method("MKCOL", ByteArray(0).toRequestBody(null))
                .build()
            val response = c.newCall(request).execute()
            response.close()
            if (!response.isSuccessful) throw Exception("Create directory failed: ${response.code}")
            path
        }

        AsyncFunction("deleteFile") { path: String ->
            val c = client ?: throw Exception("Not connected")
            val url = buildUrl(path)
            val request = Request.Builder()
                .url(url)
                .header("Authorization", credentials)
                .delete()
                .build()
            val response = c.newCall(request).execute()
            response.close()
            if (!response.isSuccessful) throw Exception("Delete failed: ${response.code}")
            path
        }

        AsyncFunction("moveFile") { src: String, dst: String ->
            val c = client ?: throw Exception("Not connected")
            val srcUrl = buildUrl(src)
            val dstUrl = buildUrl(dst)
            val request = Request.Builder()
                .url(srcUrl)
                .header("Authorization", credentials)
                .header("Destination", dstUrl)
                .header("Overwrite", "T")
                .method("MOVE", ByteArray(0).toRequestBody(null))
                .build()
            val response = c.newCall(request).execute()
            response.close()
            if (!response.isSuccessful) throw Exception("Move failed: ${response.code}")
            dst
        }

        AsyncFunction("disconnect") {
            client = null
            baseUrl = ""
            credentials = ""
            "disconnected"
        }
    }

    private fun buildUrl(path: String): String {
        if (path.startsWith("http://") || path.startsWith("https://")) return path
        return baseUrl + path.trimStart('/')
    }

    private fun parsePropfind(xml: String, requestUrl: String): List<Map<String, Any>> {
      val result = mutableListOf<Map<String, Any>>()
      val factory = XmlPullParserFactory.newInstance()
      factory.isNamespaceAware = true
      val parser = factory.newPullParser()
      parser.setInput(xml.reader())

      var inResponse = false
      var inProp = false
      var href = ""
      var isDirectory = false
      var size = 0L
      var modifiedTime = 0L
      var name = ""

      var event = parser.eventType
      while (event != XmlPullParser.END_DOCUMENT) {
          val tag = parser.name?.substringAfterLast(':') ?: ""
          when (event) {
              XmlPullParser.START_TAG -> {
                  when (tag) {
                      "response" -> { inResponse = true; href = ""; isDirectory = false; size = 0L; modifiedTime = 0L; name = "" }
                      "href" -> if (inResponse) href = parser.nextText().trim()
                      "prop" -> inProp = true
                      "collection" -> if (inProp) isDirectory = true
                      "getcontentlength" -> if (inProp) size = parser.nextText().trim().toLongOrNull() ?: 0L
                      "getlastmodified" -> if (inProp) {
                          try {
                              val sdf = java.text.SimpleDateFormat("EEE, dd MMM yyyy HH:mm:ss z", java.util.Locale.US)
                              modifiedTime = sdf.parse(parser.nextText().trim())?.time ?: 0L
                          } catch (_: Exception) {}
                      }
                      "displayname" -> if (inProp) name = parser.nextText().trim()
                  }
              }
              XmlPullParser.END_TAG -> {
                  if (tag == "prop") inProp = false
                  if (tag == "response" && inResponse) {
                      inResponse = false
                      // Skip the directory itself
                      val requestPath = requestUrl.substringAfter("://").substringAfter("/").trimEnd('/')
                      val hrefPath = href.trimEnd('/')
                      if (hrefPath == "/$requestPath" || hrefPath == requestPath) {
                          event = parser.next(); continue
                      }
                      val entryName = if (name.isNotEmpty()) name else href.trimEnd('/').substringAfterLast('/')
                      if (entryName.isNotEmpty()) {
                          result.add(mapOf(
                              "name" to entryName,
                              "isDirectory" to isDirectory,
                              "size" to size,
                              "modifiedTime" to modifiedTime,
                              "path" to href
                          ))
                      }
                  }
              }
          }
          event = parser.next()
      }
      return result
  }
}
