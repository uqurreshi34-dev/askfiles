package expo.modules.jarvisnetwork

import android.net.Uri
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Dns
import java.io.File
import java.net.InetAddress
import java.util.UUID

class JarvisNetworkModule : Module() {

  private fun client(dnsHost: String, dnsIp: String): OkHttpClient {
    val host = dnsHost.trim().lowercase()
    val ip = dnsIp.trim()

    if (host.isEmpty() || ip.isEmpty()) {
      throw Exception("JARVIS DNS configuration is missing.")
    }

    if (InetAddress.getByName(ip).hostAddress != ip) {
      throw Exception("JARVIS DNS IP is invalid.")
    }

    val dns = Dns { hostname ->
      if (hostname.trim().lowercase() == host) {
        listOf(InetAddress.getByName(ip))
      } else {
        Dns.SYSTEM.lookup(hostname)
      }
    }

    return OkHttpClient.Builder()
      .dns(dns)
      .build()
  }

  private fun request(
    url: String,
    token: String,
    body: String,
    dnsHost: String,
    dnsIp: String,
  ): okhttp3.Response {
    val request = Request.Builder()
      .url(url)
      .header("X-Jarvis-Token", token)
      .header("Content-Type", "application/json")
      .post(body.toRequestBody("application/json".toMediaType()))
      .build()

    return client(dnsHost, dnsIp).newCall(request).execute()
  }

  override fun definition() = ModuleDefinition {
    Name("JarvisNetwork")

    AsyncFunction("postJson") {
      url: String,
      token: String,
      body: String,
      dnsHost: String,
      dnsIp: String,
      ->
      request(url, token, body, dnsHost, dnsIp).use { response ->
        val responseBody = response.body?.string().orEmpty()
        if (!response.isSuccessful) {
          throw Exception(
            responseBody.ifBlank { "JARVIS bridge returned HTTP ${response.code}." }
          )
        }
        responseBody
      }
    }

    AsyncFunction("postFile") {
      url: String,
      token: String,
      body: String,
      dnsHost: String,
      dnsIp: String,
      ->
      val cacheDir = appContext.reactContext?.cacheDir
        ?: throw Exception("AskFiles cache is unavailable.")

      request(url, token, body, dnsHost, dnsIp).use { response ->
        if (!response.isSuccessful) {
          val detail = response.body?.string().orEmpty()
          throw Exception(
            detail.ifBlank { "JARVIS voice returned HTTP ${response.code}." }
          )
        }

        val output = File(cacheDir, "jarvis-${UUID.randomUUID()}.mp3")
        response.body?.byteStream()?.use { input ->
          output.outputStream().use { target ->
            input.copyTo(target)
          }
        } ?: throw Exception("JARVIS returned no audio.")

        Uri.fromFile(output).toString()
      }
    }
  }
}
