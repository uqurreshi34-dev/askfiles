package expo.modules.ftpserver

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.apache.ftpserver.FtpServerFactory
import org.apache.ftpserver.listener.ListenerFactory
import org.apache.ftpserver.usermanager.PropertiesUserManagerFactory
import org.apache.ftpserver.usermanager.impl.BaseUser
import org.apache.ftpserver.usermanager.impl.WritePermission
import org.apache.ftpserver.ftplet.Authority
import org.apache.ftpserver.filesystem.nativefs.NativeFileSystemFactory
import java.net.Inet4Address
import java.net.NetworkInterface

class FtpServerModule : Module() {

  private var server: org.apache.ftpserver.FtpServer? = null

  override fun definition() = ModuleDefinition {
    Name("FtpServer")

    AsyncFunction("startServer") { port: Int, rootPath: String ->
      try {
        server?.stop()

        val serverFactory = FtpServerFactory()

        val listenerFactory = ListenerFactory()
        listenerFactory.port = port
        serverFactory.addListener("default", listenerFactory.createListener())

        // Jail all file operations to rootPath — prevents directory traversal
        val fsFactory = NativeFileSystemFactory()
        fsFactory.isCreateHome = true
        serverFactory.fileSystem = fsFactory

        val userManagerFactory = PropertiesUserManagerFactory()
        val userManager = userManagerFactory.createUserManager()

        val user = BaseUser()
        user.name = "askfiles"
        user.password = ""
        user.homeDirectory = rootPath
        user.authorities = listOf<Authority>(WritePermission())
        user.maxIdleTime = 300
        userManager.save(user)
        serverFactory.userManager = userManager

        server = serverFactory.createServer()
        server!!.start()

        getLocalIpAddress()
      } catch (e: Exception) {
        throw Exception("FTP server failed to start: ${e.message}")
      }
    }

    AsyncFunction("stopServer") {
      try {
        server?.stop()
        server = null
        "stopped"
      } catch (e: Exception) {
        throw Exception("Failed to stop FTP server: ${e.message}")
      }
    }

    AsyncFunction("isRunning") {
      server != null && !server!!.isStopped
    }

    AsyncFunction("getServerAddress") {
      getLocalIpAddress()
    }
  }

  private fun getLocalIpAddress(): String {
    try {
      val interfaces = NetworkInterface.getNetworkInterfaces()
      while (interfaces.hasMoreElements()) {
        val iface = interfaces.nextElement()
        if (iface.isLoopback || !iface.isUp) continue
        val addresses = iface.inetAddresses
        while (addresses.hasMoreElements()) {
          val addr = addresses.nextElement()
          if (addr is Inet4Address) return addr.hostAddress ?: ""
        }
      }
    } catch (e: Exception) {}
    return ""
  }
}
