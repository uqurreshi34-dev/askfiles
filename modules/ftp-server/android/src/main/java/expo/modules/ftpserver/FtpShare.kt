package expo.modules.ftpserver

import org.apache.ftpserver.ConnectionConfigFactory
import org.apache.ftpserver.FtpServer
import org.apache.ftpserver.FtpServerFactory
import org.apache.ftpserver.filesystem.nativefs.NativeFileSystemFactory
import org.apache.ftpserver.ftplet.Authority
import org.apache.ftpserver.ftplet.UserManager
import org.apache.ftpserver.listener.ListenerFactory
import org.apache.ftpserver.usermanager.PropertiesUserManagerFactory
import org.apache.ftpserver.usermanager.SaltedPasswordEncryptor
import org.apache.ftpserver.usermanager.impl.BaseUser
import org.apache.ftpserver.usermanager.impl.WritePermission
import java.security.SecureRandom

/**
 * The phone's FTP share: one account, a password, and nothing reachable outside the chosen folder.
 *
 * Before this, the share accepted the user 'askfiles' with no password, so anyone on the same wifi
 * could read and change every file on the phone while it was running. Now every login needs the
 * password shown in the app, anonymous logins are off, repeated wrong guesses are slowed down and
 * disconnected, and the server listens only on the wifi address rather than on every network.
 *
 * Kept free of Android and Expo types so it can be run against a real FTP client on a desktop JVM.
 */
internal class FtpShare {

  companion object {
    const val USERNAME = "askfiles"

    // No look-alike characters (0/o, 1/l/i), and nothing that needs escaping in an ftp:// URL,
    // so it can be read off the screen, typed into FileZilla, and put in the QR code as is.
    private const val ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"
    private const val PASSWORD_LENGTH = 10

    private val random = SecureRandom()

    fun newPassword(): String =
      (1..PASSWORD_LENGTH).map { ALPHABET[random.nextInt(ALPHABET.length)] }.joinToString("")
  }

  private var server: FtpServer? = null
  private var users: UserManager? = null
  private var home: String? = null

  val isRunning: Boolean
    get() = server?.let { !it.isStopped } ?: false

  @Synchronized
  fun start(port: Int, rootPath: String, bindAddress: String, password: String) {
    stop()

    val factory = FtpServerFactory()

    val listener = ListenerFactory()
    listener.port = port
    listener.serverAddress = bindAddress
    factory.addListener("default", listener.createListener())

    val connections = ConnectionConfigFactory()
    connections.isAnonymousLoginEnabled = false
    connections.maxLoginFailures = 3
    connections.loginFailureDelay = 1000
    connections.maxLogins = 10
    factory.connectionConfig = connections.createConnectionConfig()

    // Each login lands in rootPath and cannot climb above it.
    val fileSystem = NativeFileSystemFactory()
    fileSystem.isCreateHome = true
    factory.fileSystem = fileSystem

    val userFactory = PropertiesUserManagerFactory()
    userFactory.passwordEncryptor = SaltedPasswordEncryptor()
    val userManager = userFactory.createUserManager()
    factory.userManager = userManager

    users = userManager
    home = rootPath
    saveUser(password)

    val created = factory.createServer()
    created.start()
    server = created
  }

  /** Change the password on a running share. People already connected stay connected. */
  @Synchronized
  fun changePassword(password: String) {
    if (users != null) {
      saveUser(password)
    }
  }

  @Synchronized
  fun stop() {
    server?.stop()
    server = null
    users = null
    home = null
  }

  private fun saveUser(password: String) {
    val user = BaseUser()
    user.name = USERNAME
    user.password = password
    user.homeDirectory = home
    user.authorities = listOf<Authority>(WritePermission())
    user.maxIdleTime = 300
    users?.save(user)
  }
}
