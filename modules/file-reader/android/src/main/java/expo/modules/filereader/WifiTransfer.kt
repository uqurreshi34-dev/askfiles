package expo.modules.filereader

import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.InputStream
import java.io.OutputStream
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.net.URLDecoder
import java.net.URLEncoder
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.concurrent.ConcurrentHashMap

/**
 * WiFi Transfer: browse, download and upload phone files from a browser on the same network.
 *
 * Before this, the page was open to anyone on the wifi while it ran: no password, every file on
 * the phone listed, downloadable and overwritable. Now:
 *
 * - The browser must sign in with the password shown in the app. A successful sign-in gets a
 *   random session cookie that scripts cannot read and other websites cannot send with an upload.
 * - Wrong passwords are slowed down, and a device that keeps guessing is locked out for a while.
 * - A new password signs every browser out and cancels every shared-file link.
 * - Sharing a single file by QR gives a link to that one file only, which expires, instead of
 *   opening the whole phone.
 * - File names are escaped before they reach the page, so a file named like HTML cannot run
 *   script in the browser.
 * - The server listens only on the wifi address, not on mobile data or a VPN.
 *
 * Kept free of Android and Expo types so it can be run against a real HTTP client on a desktop JVM.
 */
internal class WifiTransfer(private val onFileSaved: (File) -> Unit = {}) {

  class Info(val address: String, val port: Int, val password: String) {
    val url: String get() = "http://$address:$port"

    // Scanning this signs straight in, so the password never has to be typed.
    val loginUrl: String get() = "$url/login?code=${enc(password)}"
  }

  companion object {
    const val COOKIE = "askfiles_session"

    private const val ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"
    private const val PASSWORD_LENGTH = 10
    private const val MAX_FAILURES = 5
    private const val FAILURE_WINDOW_MS = 5 * 60 * 1000L
    private const val SHARE_LIFETIME_MS = 60 * 60 * 1000L
    private const val MAX_LINE = 8192
    private const val MAX_HEADERS = 100
    private const val MAX_UPLOAD = 512L * 1024 * 1024

    private val random = SecureRandom()

    fun newPassword(): String =
      (1..PASSWORD_LENGTH).map { ALPHABET[random.nextInt(ALPHABET.length)] }.joinToString("")

    private fun token(): String {
      val bytes = ByteArray(32)
      random.nextBytes(bytes)
      return bytes.joinToString("") { "%02x".format(it) }
    }

    private fun enc(value: String): String = URLEncoder.encode(value, "UTF-8")

    fun escape(text: String): String = buildString(text.length) {
      for (c in text) {
        when (c) {
          '&' -> append("&amp;")
          '<' -> append("&lt;")
          '>' -> append("&gt;")
          '"' -> append("&quot;")
          '\'' -> append("&#39;")
          else -> append(c)
        }
      }
    }
  }

  private class Share(val file: File, val expires: Long)

  private class Failures(var count: Int, var since: Long)

  @Volatile private var socket: ServerSocket? = null
  @Volatile private var info: Info? = null
  @Volatile private var root: File? = null
  @Volatile private var password: String = ""

  private val sessions = ConcurrentHashMap.newKeySet<String>()
  private val shares = ConcurrentHashMap<String, Share>()
  private val failures = ConcurrentHashMap<String, Failures>()

  val isRunning: Boolean get() = socket?.isClosed == false

  /** Start, or keep running if already serving the same folder on the same address. */
  @Synchronized
  fun start(rootPath: String, bindAddress: String, port: Int, password: String): Info {
    val folder = File(rootPath).canonicalFile
    val current = info

    if (isRunning && current != null && current.address == bindAddress && root == folder) {
      this.password = password
      return Info(bindAddress, current.port, password)
    }

    stop()

    val server = ServerSocket()
    server.reuseAddress = true
    server.bind(InetSocketAddress(InetAddress.getByName(bindAddress), port))

    socket = server
    root = folder
    this.password = password
    info = Info(bindAddress, server.localPort, password)

    Thread({
      while (!server.isClosed) {
        val client = try { server.accept() } catch (e: Exception) { break }
        Thread({
          try {
            client.soTimeout = 60_000
            handle(client)
          } catch (_: Exception) {
          } finally {
            try { client.close() } catch (_: Exception) {}
          }
        }, "wifi-transfer-client").apply { isDaemon = true }.start()
      }
    }, "wifi-transfer").apply { isDaemon = true }.start()

    return info!!
  }

  @Synchronized
  fun stop() {
    try { socket?.close() } catch (_: Exception) {}
    socket = null
    info = null
    root = null
    sessions.clear()
    shares.clear()
    failures.clear()
  }

  /** New password: every signed-in browser and every shared-file link stops working at once. */
  @Synchronized
  fun changePassword(password: String) {
    this.password = password
    sessions.clear()
    shares.clear()
    info = info?.let { Info(it.address, it.port, password) }
  }

  /** A link to one file that works without signing in, for an hour, and reveals nothing else. */
  fun share(path: String): String {
    val base = info ?: throw IllegalStateException("WiFi Transfer is not running.")
    val file = inside(path) ?: throw IllegalArgumentException("That file cannot be shared.")

    if (!file.isFile) {
      throw IllegalArgumentException("That file cannot be shared.")
    }

    val now = System.currentTimeMillis()
    shares.entries.removeIf { it.value.expires < now }

    val id = token()
    shares[id] = Share(file, now + SHARE_LIFETIME_MS)

    return "${base.url}/s/$id/${enc(file.name).replace("+", "%20")}"
  }

  // ─── Requests ───────────────────────────────────────────────────────────────

  private class Request(
    val method: String,
    val path: String,
    val params: Map<String, String>,
    val headers: Map<String, String>,
    val body: InputStream,
    val client: String,
  ) {
    fun cookie(name: String): String? =
      headers["cookie"]?.split(';')
        ?.map { it.trim() }
        ?.firstOrNull { it.startsWith("$name=") }
        ?.substringAfter('=')
  }

  private fun readLine(input: InputStream): String? {
    val bytes = java.io.ByteArrayOutputStream()
    var previous = -1

    while (true) {
      val b = input.read()
      if (b == -1) return if (bytes.size() == 0) null else bytes.toString("UTF-8")
      if (previous == '\r'.code && b == '\n'.code) {
        val raw = bytes.toByteArray()
        return String(raw, 0, raw.size - 1, Charsets.UTF_8)
      }
      bytes.write(b)
      previous = b
      if (bytes.size() > MAX_LINE) return null
    }
  }

  private fun parseQuery(query: String): Map<String, String> =
    query.split('&').mapNotNull { pair ->
      val parts = pair.split('=', limit = 2)
      if (parts.size != 2 || parts[0].isEmpty()) return@mapNotNull null
      try {
        URLDecoder.decode(parts[0], "UTF-8") to URLDecoder.decode(parts[1], "UTF-8")
      } catch (e: IllegalArgumentException) {
        null
      }
    }.toMap()

  private fun handle(client: Socket) {
    val input = client.getInputStream()
    val output = client.getOutputStream()

    val requestLine = readLine(input) ?: return
    val parts = requestLine.split(' ')
    if (parts.size < 2) return

    val target = parts[1]
    val headers = mutableMapOf<String, String>()

    while (true) {
      val line = readLine(input) ?: return
      if (line.isEmpty()) break
      if (headers.size >= MAX_HEADERS) return
      val colon = line.indexOf(':')
      if (colon > 0) headers[line.substring(0, colon).trim().lowercase()] = line.substring(colon + 1).trim()
    }

    val request = Request(
      method = parts[0],
      path = target.substringBefore('?'),
      params = parseQuery(target.substringAfter('?', "")),
      headers = headers,
      body = input,
      client = client.inetAddress?.hostAddress ?: "unknown",
    )

    route(request, output)
    output.flush()
    finish(client, input)
  }

  /**
   * Close gently. If a request is refused before its body is read (a large upload, say) and the
   * socket is simply closed, the unread bytes make the phone reset the connection, and the browser
   * shows a connection error instead of the answer. Signalling the end of the reply first and
   * reading off a little of what is left lets the browser see the answer.
   */
  private fun finish(client: Socket, input: InputStream) {
    try {
      client.shutdownOutput()
      client.soTimeout = 2000
      val buffer = ByteArray(8192)
      var left = 1024 * 1024
      while (left > 0) {
        val read = input.read(buffer, 0, minOf(buffer.size, left))
        if (read < 0) break
        left -= read
      }
    } catch (_: Exception) {
      // The browser has already gone; nothing to wait for.
    }
  }

  private fun route(request: Request, output: OutputStream) {
    val path = request.path

    when {
      request.method == "GET" && path.startsWith("/s/") -> sendShared(path, output)

      path == "/login" && (request.method == "GET" || request.method == "POST") -> login(request, output)

      !signedIn(request) -> {
        if (request.method == "GET" && (path == "/" || path.isEmpty())) {
          sendHtml(output, 200, loginPage(null))
        } else {
          redirect(output, "/")
        }
      }

      request.method == "GET" && (path == "/" || path.isEmpty()) -> sendListing(request, output)

      request.method == "GET" && path == "/file" -> sendFile(request, output)

      request.method == "POST" && path == "/upload" -> receiveUpload(request, output)

      else -> sendStatus(output, 404, "Not Found")
    }
  }

  // ─── Signing in ─────────────────────────────────────────────────────────────

  private fun signedIn(request: Request): Boolean {
    val value = request.cookie(COOKIE) ?: return false
    return value in sessions
  }

  private fun matches(given: String): Boolean {
    val expected = password
    if (expected.isEmpty()) return false
    // Constant time, so the password cannot be found one character at a time.
    return MessageDigest.isEqual(given.toByteArray(Charsets.UTF_8), expected.toByteArray(Charsets.UTF_8))
  }

  private fun lockedOut(client: String): Boolean {
    val record = failures[client] ?: return false
    if (System.currentTimeMillis() - record.since > FAILURE_WINDOW_MS) {
      failures.remove(client)
      return false
    }
    return record.count >= MAX_FAILURES
  }

  private fun recordFailure(client: String) {
    val now = System.currentTimeMillis()
    val record = failures.getOrPut(client) { Failures(0, now) }
    synchronized(record) {
      if (now - record.since > FAILURE_WINDOW_MS) {
        record.count = 0
        record.since = now
      }
      record.count++
    }
  }

  private fun login(request: Request, output: OutputStream) {
    if (lockedOut(request.client)) {
      sendHtml(output, 429, loginPage("Too many wrong attempts. Wait a few minutes, then try again."))
      return
    }

    val submitted = if (request.method == "POST") {
      val length = request.headers["content-length"]?.toIntOrNull() ?: 0
      if (length !in 0..4096) {
        sendStatus(output, 413, "Payload Too Large")
        return
      }
      val bytes = ByteArray(length)
      var read = 0
      while (read < length) {
        val n = request.body.read(bytes, read, length - read)
        if (n == -1) break
        read += n
      }
      parseQuery(String(bytes, 0, read, Charsets.UTF_8))["code"]
    } else {
      request.params["code"]
    }
    val given = submitted?.trim().orEmpty()

    if (given.isEmpty()) {
      sendHtml(output, 200, loginPage(null))
      return
    }

    if (!matches(given)) {
      recordFailure(request.client)
      Thread.sleep(1000)
      sendHtml(output, 401, loginPage("That password is not right. Check it in AskFiles and try again."))
      return
    }

    failures.remove(request.client)

    val session = token()
    sessions.add(session)

    // HttpOnly: page scripts cannot read it. SameSite=Lax: other websites cannot send it with
    // an upload. No Secure flag, because this page is plain http on the local network.
    output.write(
      ("HTTP/1.1 303 See Other\r\n" +
        "Location: /\r\n" +
        "Set-Cookie: $COOKIE=$session; Path=/; HttpOnly; SameSite=Lax\r\n" +
        securityHeaders() +
        "Content-Length: 0\r\nConnection: close\r\n\r\n").toByteArray()
    )
  }

  private fun loginPage(message: String?): String {
    val note = message?.let { "<p class='error'>${escape(it)}</p>" } ?: ""
    return page(
      "<h1>📱 AskFiles WiFi Transfer</h1>" +
        "<p>Enter the password shown in AskFiles, under WiFi Transfer.</p>$note" +
        "<form method='POST' action='/login'>" +
        "<input name='code' type='password' autocomplete='current-password' autofocus required " +
        "style='font-size:18px;padding:10px;width:100%;box-sizing:border-box'><br><br>" +
        "<button type='submit'>Open</button></form>"
    )
  }

  // ─── Files ──────────────────────────────────────────────────────────────────

  /** The file for a path, only if it is inside the shared folder. */
  private fun inside(path: String): File? {
    val base = root ?: return null
    val file = try { File(path).canonicalFile } catch (e: Exception) { return null }
    return if (file == base || file.path.startsWith(base.path + File.separator)) file else null
  }

  private fun sendListing(request: Request, output: OutputStream) {
    val base = root ?: return sendStatus(output, 503, "Service Unavailable")
    val dir = request.params["path"]?.let { inside(it) }?.takeIf { it.isDirectory } ?: base

    val files = dir.listFiles()
      ?.filter { !it.name.startsWith('.') }
      ?.sortedWith(compareBy({ !it.isDirectory }, { it.name.lowercase() }))
      ?: emptyList()

    val rows = files.joinToString("") { f ->
      val name = escape(f.name)
      val link = enc(f.absolutePath)
      val entry = if (f.isDirectory) {
        "<a href='/?path=$link'>📁 $name</a>"
      } else {
        "<a href='/file?path=$link' download='$name'>📄 $name (${f.length() / 1024}KB)</a>"
      }
      "<div class='row'>$entry</div>"
    }

    val back = if (dir != base) {
      "<div style='margin-bottom:12px'><a href='/?path=${enc(dir.parentFile?.path ?: base.path)}'>← Back</a></div>"
    } else ""

    sendHtml(
      output, 200,
      page(
        "<h1>📱 AskFiles WiFi Transfer</h1>$back" +
          "<div class='upload'><b>Upload to phone:</b><br><br>" +
          "<form method='POST' action='/upload?path=${enc(dir.path)}' enctype='multipart/form-data'>" +
          "<input type='file' name='file' multiple><br><br><button type='submit'>Upload</button></form></div>" +
          "<b>Files:</b>$rows"
      )
    )
  }

  private fun sendFile(request: Request, output: OutputStream) {
    val file = request.params["path"]?.let { inside(it) }
    if (file == null) return sendStatus(output, 403, "Forbidden")
    if (!file.isFile) return sendStatus(output, 404, "Not Found")
    streamFile(file, output)
  }

  private fun sendShared(path: String, output: OutputStream) {
    val id = path.removePrefix("/s/").substringBefore('/')
    val share = shares[id]

    if (share == null || share.expires < System.currentTimeMillis()) {
      if (share != null) shares.remove(id)
      return sendHtml(output, 410, page("<h1>This link has expired</h1><p>Ask for the file to be shared again.</p>"))
    }

    if (!share.file.isFile) return sendStatus(output, 404, "Not Found")
    streamFile(share.file, output)
  }

  private fun streamFile(file: File, output: OutputStream) {
    val mime = when (file.extension.lowercase()) {
      "jpg", "jpeg" -> "image/jpeg"
      "png" -> "image/png"
      "gif" -> "image/gif"
      "webp" -> "image/webp"
      "mp4" -> "video/mp4"
      "mov" -> "video/quicktime"
      "mp3" -> "audio/mpeg"
      "m4a" -> "audio/mp4"
      "pdf" -> "application/pdf"
      "zip" -> "application/zip"
      "txt" -> "text/plain"
      "csv" -> "text/csv"
      "docx" -> "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      "xlsx" -> "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      "pptx" -> "application/vnd.openxmlformats-officedocument.presentationml.presentation"
      else -> "application/octet-stream"
    }

    // A plain fallback name for old browsers, plus the exact name in the encoded form. Quotes
    // and line breaks in a file name can never reach the header.
    val plain = file.name.map { if (it.code in 0x20..0x7e && it != '"' && it != '\\') it else '_' }.joinToString("")
    val exact = enc(file.name).replace("+", "%20")

    output.write(
      ("HTTP/1.1 200 OK\r\n" +
        "Content-Type: $mime\r\n" +
        "Content-Length: ${file.length()}\r\n" +
        "Content-Disposition: attachment; filename=\"$plain\"; filename*=UTF-8''$exact\r\n" +
        securityHeaders() +
        "Connection: close\r\n\r\n").toByteArray()
    )

    FileInputStream(file).use { it.copyTo(output, 65536) }
  }

  private fun receiveUpload(request: Request, output: OutputStream) {
    // Browsers name the page an upload came from. One from any other page is refused, whatever
    // cookies it carries.
    val origin = request.headers["origin"]
    val host = request.headers["host"]
    if (origin != null && host != null && origin != "http://$host") {
      return sendStatus(output, 403, "Forbidden")
    }

    val destination = request.params["path"]?.let { inside(it) }?.takeIf { it.isDirectory }
      ?: root ?: return sendStatus(output, 503, "Service Unavailable")

    val contentType = request.headers["content-type"] ?: ""
    val boundary = contentType.substringAfter("boundary=", "").trim().trim('"')
    val contentLength = request.headers["content-length"]?.toLongOrNull() ?: 0L

    if (boundary.isEmpty()) return sendStatus(output, 400, "Bad Request")
    if (contentLength > MAX_UPLOAD) return sendStatus(output, 413, "Payload Too Large")

    val saved = try {
      MultipartReader(request.body, boundary, contentLength).saveFiles(destination, onFileSaved)
    } catch (e: Exception) {
      return sendStatus(output, 500, "Internal Server Error")
    } ?: return sendStatus(output, 400, "Bad Request")

    val message = if (saved == 1) "✅ 1 file uploaded" else "✅ $saved files uploaded"
    val back = "/?path=${enc(destination.path)}"

    sendHtml(
      output, 200,
      "<html><head><meta charset='utf-8'><meta http-equiv='refresh' content='2;url=$back'></head>" +
        "<body><h2>$message</h2><p>Returning to folder...</p><a href='$back'>Back now</a></body></html>"
    )
  }

  // ─── Responses ──────────────────────────────────────────────────────────────

  private fun securityHeaders(): String =
    "Cache-Control: no-store\r\n" +
      "X-Content-Type-Options: nosniff\r\n" +
      "X-Frame-Options: DENY\r\n" +
      // same-origin, not no-referrer: with no-referrer the browser labels its own uploads as
      // coming from nowhere (Origin: null), and the upload check below then refuses them.
      "Referrer-Policy: same-origin\r\n" +
      // No scripts at all: even if something slipped past the escaping, it could not run.
      "Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; form-action 'self'; frame-ancestors 'none'\r\n"

  private fun page(body: String): String =
    "<!DOCTYPE html><html><head><meta charset='utf-8'>" +
      "<meta name='viewport' content='width=device-width,initial-scale=1'><title>AskFiles WiFi Transfer</title>" +
      "<style>body{font-family:sans-serif;max-width:800px;margin:0 auto;padding:16px}" +
      "a{text-decoration:none;color:#185FA5;font-size:16px}h1{color:#185FA5}" +
      ".row{padding:10px;border-bottom:1px solid #eee}.error{color:#b3261e}" +
      ".upload{margin:16px 0;padding:16px;background:#f5f5f5;border-radius:8px}" +
      "button{background:#185FA5;color:white;border:none;padding:10px 20px;border-radius:6px;cursor:pointer}</style>" +
      "</head><body>$body</body></html>"

  private fun sendHtml(output: OutputStream, status: Int, html: String) {
    val body = html.toByteArray(Charsets.UTF_8)
    output.write(
      ("HTTP/1.1 $status ${reason(status)}\r\n" +
        "Content-Type: text/html; charset=utf-8\r\n" +
        "Content-Length: ${body.size}\r\n" +
        securityHeaders() +
        "Connection: close\r\n\r\n").toByteArray()
    )
    output.write(body)
  }

  private fun sendStatus(output: OutputStream, status: Int, text: String) {
    output.write("HTTP/1.1 $status $text\r\n${securityHeaders()}Content-Length: 0\r\nConnection: close\r\n\r\n".toByteArray())
  }

  private fun redirect(output: OutputStream, location: String) {
    output.write("HTTP/1.1 303 See Other\r\nLocation: $location\r\n${securityHeaders()}Content-Length: 0\r\nConnection: close\r\n\r\n".toByteArray())
  }

  private fun reason(status: Int) = when (status) {
    200 -> "OK"
    401 -> "Unauthorized"
    410 -> "Gone"
    429 -> "Too Many Requests"
    else -> "OK"
  }
}

/**
 * Reads a multipart upload straight from the socket to disk, without holding a file in memory.
 * The parsing is the same sliding-window approach AskFiles has always used.
 */
internal class MultipartReader(
  private val input: InputStream,
  boundary: String,
  private val contentLength: Long,
) {
  private val boundaryBytes = "--$boundary".toByteArray(Charsets.UTF_8)
  private val terminator = "\r\n--$boundary".toByteArray(Charsets.UTF_8)
  private val windowSize = 65536 + boundaryBytes.size * 2
  private val window = ByteArray(windowSize)
  private var windowLen = 0
  private var totalRead = 0L

  private fun fill() {
    while (windowLen < windowSize && totalRead < contentLength) {
      val toRead = minOf(windowSize - windowLen, (contentLength - totalRead).toInt())
      val read = input.read(window, windowLen, toRead)
      if (read == -1) return
      windowLen += read
      totalRead += read
    }
  }

  private fun consume(n: Int) {
    if (n <= 0) return
    val remaining = windowLen - n
    if (remaining > 0) System.arraycopy(window, n, window, 0, remaining)
    windowLen = maxOf(0, remaining)
  }

  private fun find(seq: ByteArray, safeLen: Int): Int {
    val limit = minOf(safeLen, windowLen - seq.size + 1)
    outer@ for (i in 0 until limit) {
      for (j in seq.indices) {
        if (window[i + j] != seq[j]) continue@outer
      }
      return i
    }
    return -1
  }

  /** Save every file part into [destination]. Returns how many, or null if the body is not multipart. */
  fun saveFiles(destination: File, onSaved: (File) -> Unit): Int? {
    fill()

    val first = find(boundaryBytes, windowLen)
    if (first == -1) return null
    consume(first + boundaryBytes.size)

    var saved = 0
    val headerEnd = "\r\n\r\n".toByteArray()

    while (true) {
      fill()
      if (windowLen < 2) break
      if (window[0] == '-'.code.toByte() && window[1] == '-'.code.toByte()) break
      if (window[0] == '\r'.code.toByte() && window[1] == '\n'.code.toByte()) consume(2)
      fill()

      val header = StringBuilder()
      var done = false
      while (!done) {
        fill()
        val end = find(headerEnd, windowLen - headerEnd.size + 1)
        if (end != -1) {
          header.append(String(window, 0, end, Charsets.UTF_8))
          consume(end + 4)
          done = true
        } else {
          val safe = maxOf(0, windowLen - headerEnd.size)
          if (safe > 0) {
            header.append(String(window, 0, safe, Charsets.UTF_8))
            consume(safe)
          }
          fill()
          if (windowLen == 0) break
        }
        if (header.length > 16384) return null
      }

      val fileName = Regex("filename=\"([^\"]+)\"", RegexOption.IGNORE_CASE)
        .find(header)?.groupValues?.get(1)
        ?.let { File(it).name }
        ?.takeIf { it.isNotBlank() && it != "." && it != ".." && !it.contains('/') && !it.contains('\\') }

      if (fileName != null) {
        val target = File(destination, fileName)
        FileOutputStream(target).use { out ->
          while (true) {
            fill()
            if (windowLen == 0) break
            val at = find(terminator, windowLen)
            val safeLen = windowLen - terminator.size
            when {
              at != -1 -> {
                if (at > 0) out.write(window, 0, at)
                consume(at + terminator.size)
                break
              }
              safeLen > 0 -> {
                out.write(window, 0, safeLen)
                consume(safeLen)
              }
              else -> {
                fill()
                if (windowLen == 0) break
              }
            }
          }
        }
        onSaved(target)
        saved++
      } else {
        while (true) {
          fill()
          if (windowLen == 0) break
          val at = find(terminator, windowLen)
          if (at != -1) {
            consume(at + terminator.size)
            break
          }
          val safeLen = windowLen - terminator.size
          if (safeLen > 0) consume(safeLen) else fill()
        }
      }

      fill()
      if (windowLen >= 2 && window[0] == '-'.code.toByte() && window[1] == '-'.code.toByte()) break
    }

    return saved
  }
}
