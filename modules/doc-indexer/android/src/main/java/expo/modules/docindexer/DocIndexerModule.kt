package expo.modules.docindexer

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.text.PDFTextStripper
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.InputStream
import java.util.zip.ZipInputStream

// ── SQLite helper ──────────────────────────────────────────────────────────────
class IndexDbHelper(context: Context) : SQLiteOpenHelper(context, "doc_index.db", null, 16) {
  override fun onCreate(db: SQLiteDatabase) {
    db.execSQL("""
      CREATE TABLE IF NOT EXISTS doc_meta (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uri TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        snippet TEXT NOT NULL,
        indexed_at INTEGER NOT NULL
      )
    """.trimIndent())
    try {
      db.execSQL("""
        CREATE VIRTUAL TABLE IF NOT EXISTS doc_fts USING fts5(
          name, snippet,
          content=doc_meta,
          content_rowid=id,
          tokenize='unicode61'
        )
      """.trimIndent())
    } catch (e: Exception) {
      db.execSQL("""
        CREATE VIRTUAL TABLE IF NOT EXISTS doc_fts USING fts4(
            name, snippet,
            content=doc_meta,
            tokenize=unicode61
          )
      """.trimIndent())
    }
  }
  override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
    db.execSQL("DROP TABLE IF EXISTS doc_fts")
    db.execSQL("DROP TABLE IF EXISTS doc_meta")
    db.execSQL("DROP TABLE IF EXISTS doc_index")
    onCreate(db)
  }
}

// ── Module ─────────────────────────────────────────────────────────────────────
class DocIndexerModule : Module() {

  private lateinit var db: IndexDbHelper

  override fun definition() = ModuleDefinition {
    Name("DocIndexer")

    OnCreate {
      val ctx = appContext.reactContext ?: return@OnCreate
      PDFBoxResourceLoader.init(ctx)
      db = IndexDbHelper(ctx)
    }

    // Index a single file
    AsyncFunction("indexFile") { uri: String, name: String ->
      val file = uriToFile(uri) ?: return@AsyncFunction false
      val snippet = extractText(file, name) ?: return@AsyncFunction false
      saveToDb(uri, name, snippet)
      true
    }

    // Bulk index a list of files
    AsyncFunction("indexFiles") { files: List<Map<String, String>> ->
      val writableDb = db.writableDatabase
      var count = 0

      writableDb.beginTransaction()

      try {

        for (entry in files.take(200)) {

          val uri = entry["uri"] ?: continue
          val name = entry["name"] ?: continue

          val file = uriToFile(uri) ?: continue
          val snippet = extractText(file, name) ?: continue

          saveToDb(uri, name, snippet)

          count++
        }

        writableDb.setTransactionSuccessful()

      } finally {
        writableDb.endTransaction()
      }

      count
    }

    // Search indexed content — term frequency ranked, LIKE fallback
   AsyncFunction("searchFiles") { query: String ->
      val results = mutableListOf<Pair<Int, Map<String, String>>>()
      val lower = query.trim().lowercase()

      try {
        val ftsQuery = lower.split("\\s+".toRegex())
          .filter { it.isNotBlank() }
          .joinToString(" ") { "$it*" }

        val cursor = db.readableDatabase.rawQuery(
          """SELECT m.uri, m.name, m.snippet
            FROM doc_fts f
            JOIN doc_meta m ON f.rowid = m.id
            WHERE doc_fts MATCH ?""",
          arrayOf(ftsQuery)
        )

        cursor.use {
          while (it.moveToNext()) {
            val uri = it.getString(0)
            val name = it.getString(1)
            val snippet = it.getString(2)
            val text = snippet.lowercase()
            val score = lower.split(" ").sumOf { term -> text.split(term).size - 1 }
            val idx = text.indexOf(lower)
            val preview = if (idx >= 0) {
              "...${snippet.substring(maxOf(0, idx - 60), minOf(snippet.length, idx + lower.length + 60))}..."
            } else snippet.take(150)
            results.add(Pair(score, mapOf("uri" to uri, "name" to name, "snippet" to preview)))
          }
        }
      } catch (e: Exception) {
        try {
          val cursor = db.readableDatabase.rawQuery(
            "SELECT uri, name, snippet FROM doc_meta WHERE LOWER(snippet) LIKE ? OR LOWER(name) LIKE ?",
            arrayOf("%$lower%", "%$lower%")
          )
          cursor.use {
            while (it.moveToNext()) {
              val uri = it.getString(0)
              val name = it.getString(1)
              val snippet = it.getString(2)
              val text = snippet.lowercase()
              val score = text.split(lower).size - 1
              val idx = text.indexOf(lower)
              val preview = if (idx >= 0) {
                "...${snippet.substring(maxOf(0, idx - 60), minOf(snippet.length, idx + lower.length + 60))}..."
              } else snippet.take(150)
              results.add(Pair(score, mapOf("uri" to uri, "name" to name, "snippet" to preview)))
            }
          }
        } catch (e2: Exception) { }
      }

      results.sortedByDescending { it.first }.map { it.second }
    }

    // Check if a file is already indexed
    AsyncFunction("isIndexed") { uri: String ->
      db.readableDatabase.rawQuery(
        "SELECT id FROM doc_meta WHERE uri = ?", arrayOf(uri)
      ).use { cursor -> cursor.count > 0 }
    }

    // Get total count of indexed files
    AsyncFunction("getIndexCount") {
      db.readableDatabase.rawQuery(
        "SELECT COUNT(*) FROM doc_meta", null
      ).use { cursor ->
        if (cursor.moveToFirst()) cursor.getInt(0) else 0
      }
    }

    // Remove a single file from index
    AsyncFunction("removeFromIndex") { uri: String ->
      try {
        db.readableDatabase.rawQuery(
          "SELECT id FROM doc_meta WHERE uri = ?", arrayOf(uri)
        ).use { cursor ->
          if (cursor.moveToFirst()) {
            val id = cursor.getLong(0)
           db.writableDatabase.delete("doc_fts", "rowid=?", arrayOf(id.toString()))
           db.writableDatabase.delete("doc_meta", "uri=?", arrayOf(uri))
          }
        }
      } catch (e: Exception) { }
    }

    // Wipe entire index
    AsyncFunction("clearIndex") {
      db.writableDatabase.delete("doc_fts", null, null)
      db.writableDatabase.delete("doc_meta", null, null)
    }
  }

  // ── Text extraction ──────────────────────────────────────────────────────────

  private fun decodeHtmlEntities(text: String): String {
    return text
        .replace("&#163;", "£")
        .replace("&#38;", "&")
        .replace("&#60;", "<")
        .replace("&#62;", ">")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&pound;", "£")
}

  private fun extractText(file: File, name: String): String? {
    return try {
      val ext = name.substringAfterLast('.', "").lowercase()
      val text = when (ext) {
        "pdf"  -> extractPdf(file)
        "docx" -> extractDocx(file)
        "xlsx" -> extractXlsx(file)
        "txt", "csv", "rtf" -> {
          file.inputStream().bufferedReader(Charsets.UTF_8).use { reader ->
            val buffer = CharArray(5000)
            val read = reader.read(buffer)
            if (read > 0) String(buffer, 0, read) else ""
          }
        }
        else -> null
      }
      text?.trim()?.take(5000)?.ifBlank { null }
    } catch (e: Exception) {
      null
    }
  }

  private fun extractPdf(file: File): String {
    try {
      val maxBytes = 10 * 1024 * 1024
      val bytes = file.inputStream().use { stream ->
        if (file.length() > maxBytes) stream.readNBytes(maxBytes)
        else stream.readBytes()
      }
      PDDocument.load(java.io.ByteArrayInputStream(bytes)).use { doc ->
        val stripper = PDFTextStripper()
        stripper.endPage = minOf(3, doc.numberOfPages)
        return stripper.getText(doc)
      }
    } catch (e: Exception) {
      return ""
    }
  }

  private fun extractDocx(file: File): String {
    val sb = StringBuilder()
    ZipInputStream(file.inputStream()).use { zip ->
      var entry = zip.nextEntry
      while (entry != null) {
        if (entry.name == "word/document.xml") {
          val bytes = zip.readBytes()
          val xml = if (bytes.size > 512 * 1024)
            bytes.take(512 * 1024).toByteArray().toString(Charsets.UTF_8)
          else bytes.toString(Charsets.UTF_8)
          val regex = Regex("<w:t[^>]*>([^<]*)</w:t>")
          for (match in regex.findAll(xml)) {
            sb.append(match.groupValues[1]).append(" ")
            if (sb.length >= 5000) break
          }
          break
        }
        entry = zip.nextEntry
      }
    }
    return sb.toString()
  }

  private fun extractXlsx(file: File): String {
    val sb = StringBuilder()

    // First pass — sharedStrings.xml
    ZipInputStream(file.inputStream()).use { zip ->
      var entry = zip.nextEntry
      while (entry != null) {
        if (entry.name == "xl/sharedStrings.xml") {
          val bytes = zip.readBytes()
          val xml = if (bytes.size > 512 * 1024)
            bytes.take(512 * 1024).toByteArray().toString(Charsets.UTF_8)
          else bytes.toString(Charsets.UTF_8)
          val regex = Regex("<t[^>]*>([^<]*)</t>")
          for (match in regex.findAll(xml)) {
            sb.append(match.groupValues[1]).append(" ")
            if (sb.length >= 5000) break
          }
          break
        }
        entry = zip.nextEntry
      }
    }

    // Second pass — sheet1.xml fallback if sharedStrings empty
    if (sb.isBlank()) {
      ZipInputStream(file.inputStream()).use { zip ->
        var entry = zip.nextEntry
        while (entry != null) {
          if (entry.name == "xl/worksheets/sheet1.xml") {
            val bytes = zip.readBytes()
            val xml = if (bytes.size > 512 * 1024)
              bytes.take(512 * 1024).toByteArray().toString(Charsets.UTF_8)
            else bytes.toString(Charsets.UTF_8)
            val regex = Regex("<t[^>]*>([^<]+)</t>|<v>([^<]+)</v>")
            for (match in regex.findAll(xml)) {
              val value = match.groupValues[1].ifEmpty { match.groupValues[2] }
              if (value.isNotBlank() && !value.matches(Regex("[0-9.,E+\\-]+"))) {
                sb.append(value).append(" ")
              }
              if (sb.length >= 5000) break
            }
            break
          }
          entry = zip.nextEntry
        }
      }
    }

    return decodeHtmlEntities(sb.toString())
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  private fun uriToFile(uri: String): File? {
    val path = try {
      java.net.URLDecoder.decode(uri.removePrefix("file://"), "UTF-8")
    } catch (e: Exception) {
      uri.removePrefix("file://")
    }
    val file = File(path)
    return if (file.exists() && file.canRead()) file else null
  }

  private fun saveToDb(uri: String, name: String, snippet: String) {
    try {
      // Remove existing entry if present
      db.readableDatabase.rawQuery(
        "SELECT id FROM doc_meta WHERE uri = ?", arrayOf(uri)
      ).use { cursor ->
        if (cursor.moveToFirst()) {
          val id = cursor.getLong(0)
          db.writableDatabase.delete("doc_fts", "rowid=?", arrayOf(id.toString()))
          db.writableDatabase.delete("doc_meta", "id=?", arrayOf(id.toString()))
        }
      }
      // Insert into doc_meta first
      db.writableDatabase.execSQL(
        "INSERT INTO doc_meta(uri, name, snippet, indexed_at) VALUES(?,?,?,?)",
        arrayOf(uri, name, snippet, System.currentTimeMillis().toString())
      )
      // Get the new id and insert into FTS with matching rowid
      db.readableDatabase.rawQuery(
        "SELECT id FROM doc_meta WHERE uri = ?", arrayOf(uri)
      ).use { cursor ->
        if (cursor.moveToFirst()) {
          val id = cursor.getLong(0)
          db.writableDatabase.execSQL(
            "INSERT INTO doc_fts(rowid, name, snippet) VALUES(?,?,?)",
            arrayOf(id.toString(), name, snippet)
          )
        }
      }
    } catch (e: Exception) {
      // silent fail
    }
  }
}
