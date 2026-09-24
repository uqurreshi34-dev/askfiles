package com.askfiles.mobile.sharemodule

import java.io.File
import java.io.FileInputStream
import java.nio.ByteBuffer
import java.nio.charset.CharacterCodingException
import java.nio.charset.CodingErrorAction

/**
 * Works out what kind of file something is, so Android offers apps that can actually open it.
 *
 * Asking Android to open a file as the wildcard type lets whichever app claims every type take it
 * without asking, which is how a code file ends up in a music player. The type comes instead from
 * Android's own extension table, and when that does not know the extension (.tsx, .bak, .tmp) or
 * names a media type for what is really text (.ts is listed as video), the first bytes of the file
 * decide: readable text opens as text, anything else as generic data.
 *
 * Kept free of Android types so it can be tested on a desktop JVM; the extension table is passed in.
 */
object FileTypes {

  const val TEXT = "text/plain"
  const val BINARY = "application/octet-stream"

  private const val SNIFF_BYTES = 8192

  /** What the app passed when it had no better idea. */
  fun isGeneric(mime: String?): Boolean =
    mime.isNullOrBlank() || mime == "*/*" || mime == BINARY

  /**
   * The type to open [file] as.
   *
   * @param lookup Android's extension table: extension in lower case to a type, or null.
   */
  fun resolve(file: File, lookup: (String) -> String?): String {
    val extension = file.extension.lowercase()
    val listed = extension.takeIf { it.isNotEmpty() }?.let(lookup)
    val text = looksLikeText(file)

    return when {
      listed == null -> if (text) TEXT else BINARY
      // A media type on a file that is plainly text is a clash of names, not a song.
      text && isMedia(listed) -> TEXT
      else -> listed
    }
  }

  private fun isMedia(mime: String) =
    mime.startsWith("audio/") || mime.startsWith("video/") || mime.startsWith("image/")

  /** True when the start of the file is valid UTF-8 with no NUL bytes. Empty files count as text. */
  fun looksLikeText(file: File): Boolean {
    val bytes = try {
      FileInputStream(file).use { input ->
        val buffer = ByteArray(SNIFF_BYTES)
        var read = 0
        while (read < buffer.size) {
          val n = input.read(buffer, read, buffer.size - read)
          if (n < 0) break
          read += n
        }
        buffer.copyOf(read)
      }
    } catch (e: Exception) {
      return false
    }

    if (bytes.any { it == 0.toByte() }) return false

    // The sample may end part-way through a character; drop up to three trailing bytes of it.
    val decoder = Charsets.UTF_8.newDecoder()
      .onMalformedInput(CodingErrorAction.REPORT)
      .onUnmappableCharacter(CodingErrorAction.REPORT)

    for (trim in 0..minOf(3, bytes.size)) {
      try {
        decoder.reset()
        decoder.decode(ByteBuffer.wrap(bytes, 0, bytes.size - trim))
        return true
      } catch (e: CharacterCodingException) {
        if (bytes.size < SNIFF_BYTES) return false
      }
    }

    return false
  }
}
