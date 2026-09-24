package expo.modules.sftpclient

import com.jcraft.jsch.HostKey
import com.jcraft.jsch.HostKeyRepository
import com.jcraft.jsch.JSch
import java.io.File

/**
 * Makes sure an SFTP server is the same machine it was last time.
 *
 * Every SSH server has a key that identifies it. The first time AskFiles meets a server, the
 * connection stops before any password is sent, and the user is shown that key's fingerprint to
 * accept or refuse. Once accepted, the key is kept in the app's private storage in the same
 * known_hosts format OpenSSH uses, and a later connection that presents any other key is refused,
 * again before the password leaves the phone. Without this, anything on the same wifi could
 * answer as the server and collect the password.
 *
 * Kept free of Android and Expo types so the whole check can be exercised against a real SSH
 * server on a desktop JVM.
 */
internal class HostKeyVerifier(private val file: File) {

  /** A key a server presented that is not trusted yet, waiting for the user to decide. */
  class Pending(
    val host: String,
    val port: Int,
    val entry: String,
    val key: ByteArray,
    val type: String,
    val fingerprint: String,
    val changed: Boolean,
  )

  /**
   * Sits in front of JSch's own known_hosts store and notes what the server presented, so a
   * refusal can be explained to the user without parsing JSch's exception messages.
   */
  inner class Recorder(private val inner: HostKeyRepository) : HostKeyRepository by inner {
    @Volatile var entry: String? = null
      private set
    @Volatile var key: ByteArray? = null
      private set
    @Volatile var verdict: Int = HostKeyRepository.OK
      private set

    override fun check(host: String, key: ByteArray): Int {
      var result = inner.check(host, key)

      // JSch only compares keys of the same type. A server we know by one key type that
      // suddenly offers a different type is treated as changed, not new, so it gets the
      // warning rather than the friendly first-time question.
      if (result == HostKeyRepository.NOT_INCLUDED &&
          inner.getHostKey(host, null)?.isNotEmpty() == true) {
        result = HostKeyRepository.CHANGED
      }

      this.entry = host
      this.key = key.copyOf()
      this.verdict = result

      return result
    }
  }

  private val lock = Any()

  @Volatile private var pending: Pending? = null

  fun pending(): Pending? = pending

  /** Point a JSch instance at the stored keys. Its sessions must use StrictHostKeyChecking yes. */
  fun attach(jsch: JSch): Recorder {
    synchronized(lock) {
      ensureFile()
      jsch.setKnownHosts(file.absolutePath)
    }

    val recorder = Recorder(jsch.hostKeyRepository)
    jsch.hostKeyRepository = recorder

    return recorder
  }

  /**
   * After a failed connect: if the failure was the host key, remember what was presented so
   * the user can be asked about it, and return it. Any other failure returns null.
   */
  fun rejected(jsch: JSch, host: String, port: Int, recorder: Recorder): Pending? {
    val entry = recorder.entry ?: return null
    val key = recorder.key ?: return null

    if (recorder.verdict == HostKeyRepository.OK) {
      return null
    }

    val hostKey = HostKey(entry, key)

    val found = Pending(
      host = host,
      port = port,
      entry = entry,
      key = key,
      type = hostKey.type,
      fingerprint = hostKey.getFingerPrint(jsch),
      changed = recorder.verdict == HostKeyRepository.CHANGED,
    )

    pending = found

    return found
  }

  /**
   * Trust the key the user was just shown. It must be the same host, port and fingerprint, so
   * a key that changed between the question and the answer is never the one saved. Any older
   * key for that host is replaced. Returns true only once the key is confirmed on disk.
   */
  fun trust(host: String, port: Int, fingerprint: String): Boolean {
    synchronized(lock) {
      val waiting = pending ?: return false

      if (waiting.host != host || waiting.port != port || waiting.fingerprint != fingerprint) {
        return false
      }

      ensureFile()

      val jsch = JSch()
      jsch.setKnownHosts(file.absolutePath)
      val store = jsch.hostKeyRepository

      store.remove(waiting.entry, null)
      store.add(HostKey(waiting.entry, waiting.key), null)

      // JSch swallows write failures, so read the file back with a fresh instance.
      val check = JSch()
      check.setKnownHosts(file.absolutePath)
      val saved = check.hostKeyRepository.check(waiting.entry, waiting.key) == HostKeyRepository.OK

      if (saved) {
        pending = null
      }

      return saved
    }
  }

  private fun ensureFile() {
    // JSch will not create a missing known_hosts file without a UI to ask permission.
    file.parentFile?.mkdirs()

    if (!file.exists()) {
      file.createNewFile()
    }
  }
}
