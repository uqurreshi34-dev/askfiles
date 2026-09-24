package expo.modules.ftpserver

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.net.Inet4Address
import java.net.NetworkInterface

class FtpServerModule : Module() {

  private val share = FtpShare()

  override fun definition() = ModuleDefinition {
    Name("FtpServer")

    AsyncFunction("startServer") { port: Int, rootPath: String ->
      val address = localAddress()
        ?: throw CodedException("ERR_FTP_NO_WIFI", "Connect to Wi-Fi to share files.", null)

      try {
        share.start(port, rootPath, address, password())
      } catch (e: Exception) {
        throw Exception("FTP server failed to start: ${e.message}")
      }

      mapOf(
        "address" to address,
        "port" to port,
        "username" to FtpShare.USERNAME,
        "password" to password()
      )
    }

    AsyncFunction("stopServer") {
      try {
        share.stop()
        "stopped"
      } catch (e: Exception) {
        throw Exception("Failed to stop FTP server: ${e.message}")
      }
    }

    AsyncFunction("isRunning") {
      share.isRunning
    }

    AsyncFunction("getServerAddress") {
      localAddress() ?: ""
    }

    // Replace the saved password. Applies at once if the share is running.
    AsyncFunction("newPassword") {
      val fresh = FtpShare.newPassword()
      prefs().edit().putString(PASSWORD_KEY, fresh).apply()
      share.changePassword(fresh)
      fresh
    }
  }

  private companion object {
    const val PREFS = "askfiles_ftp"
    const val PASSWORD_KEY = "password"
  }

  private fun prefs() =
    (appContext.reactContext ?: throw Exception("AskFiles context is unavailable."))
      .getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  /**
   * One password per phone, made the first time the share is used and kept in the app's private
   * storage, so a PC that saved it (FileZilla, a mapped drive in Explorer) keeps working until the
   * user asks for a new one.
   */
  @Synchronized
  private fun password(): String {
    val prefs = prefs()
    prefs.getString(PASSWORD_KEY, null)?.let { return it }

    val fresh = FtpShare.newPassword()
    prefs.edit().putString(PASSWORD_KEY, fresh).apply()
    return fresh
  }

  /**
   * The phone's address on the local network: wifi, or its own hotspot. Mobile data and VPN
   * interfaces are skipped, so the share is never offered on a network the user did not choose.
   */
  @Suppress("DEPRECATION")
  private fun localAddress(): String? {
    val context = appContext.reactContext ?: return null
    val connectivity = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager

    val wifi = mutableSetOf<String>()
    val excluded = mutableSetOf<String>()

    connectivity?.allNetworks?.forEach { network ->
      val caps = connectivity.getNetworkCapabilities(network) ?: return@forEach
      val name = connectivity.getLinkProperties(network)?.interfaceName ?: return@forEach

      when {
        caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ||
          caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> wifi.add(name)
        caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) ||
          caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN) -> excluded.add(name)
      }
    }

    val candidates = try {
      NetworkInterface.getNetworkInterfaces()?.toList().orEmpty()
        .filter { it.isUp && !it.isLoopback && it.name !in excluded }
        .flatMap { iface ->
          iface.inetAddresses.toList()
            .filterIsInstance<Inet4Address>()
            .filter { it.isSiteLocalAddress }
            .map { iface.name to (it.hostAddress ?: "") }
        }
        .filter { it.second.isNotEmpty() }
    } catch (e: Exception) {
      emptyList()
    }

    // The joined wifi first; otherwise a local-only interface such as the phone's own hotspot.
    return (candidates.firstOrNull { it.first in wifi } ?: candidates.firstOrNull())?.second
  }
}
