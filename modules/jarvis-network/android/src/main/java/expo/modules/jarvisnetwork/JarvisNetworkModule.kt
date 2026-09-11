package expo.modules.jarvisnetwork

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.Uri
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import okhttp3.Dns
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.File
import java.net.InetAddress
import java.util.UUID
import java.util.concurrent.TimeUnit

class JarvisNetworkModule : Module() {

  private fun tailscaleNetwork(): Network {
    val context = appContext.reactContext
      ?: throw Exception("AskFiles context is unavailable.")

    val connectivity = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
      ?: throw Exception("Android connectivity service is unavailable.")

    val network = connectivity.activeNetwork
      ?: throw Exception("No active Android network is available.")

    val capabilities = connectivity.getNetworkCapabilities(network)
    if (capabilities?.hasTransport(NetworkCapabilities.TRANSPORT_VPN) != true) {
      throw Exception("Tailscale VPN network is not active.")
    }

    return network
  }

  private fun client(dnsHost: String, dnsIp: String): OkHttpClient {
    val host = dnsHost.trim().lowercase()
    val ip = dnsIp.trim()

    if (host.isEmpty() || ip.isEmpty()) {
      throw Exception("JARVIS DNS configuration is missing.")
    }

    val address = try {
      InetAddress.getByName(ip)
    } catch (e: Exception) {
      throw Exception("JARVIS DNS IP is invalid.", e)
    }

    if (address.hostAddress != ip) {
      throw Exception("JARVIS DNS IP is invalid.")
    }

    val dns = object : Dns {
      override fun lookup(hostname: String): List<InetAddress> {
        return if (hostname.trim().lowercase() == host) {
          listOf(address)
        } else {
          Dns.SYSTEM.lookup(hostname)
        }
      }
    }

    return OkHttpClient.Builder()
      .dns(dns)
      .socketFactory(tailscaleNetwork().socketFactory)
      .connectTimeout(15, TimeUnit.SECONDS)
      .readTimeout(180, TimeUnit.SECONDS)
      .writeTimeout(30, TimeUnit.SECONDS)
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
