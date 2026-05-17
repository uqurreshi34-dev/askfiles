package expo.modules.docindexer

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import android.content.ContentValues
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.text.PDFTextStripper
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.InputStream
import java.util.zip.ZipInputStream

// ── SQLite helper ──────────────────────────────────────────────────────────────
class IndexDbHelper(context: Context) : SQLiteOpenHelper(context, "doc_index.db", null, 1) {
  override fun onCreate(db: SQLiteDatabase) {
    db.execSQL("""
      CREATE TABLE IF NOT EXISTS doc_index (
        uri TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        snippet TEXT NOT NULL,
        indexed_at INTEGER NOT NULL
      )
    """.trimIndent())
    db.execSQL("CREATE INDEX IF NOT EXISTS idx_snippet ON doc_index(snippet)")
  }
  override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
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

    // Index a single file — call on-demand when user opens Smart Search
    AsyncFunction("indexFile") { uri: String, name: String ->
      val file = uriToFile(uri) ?: return@AsyncFunction false
      val snippet = extractText(file, name) ?: return@AsyncFunction false
      saveToDb(uri, name, snippet)
      true
    }

    // Bulk index a list of files — called by background WorkManager job
    AsyncFunction("indexFiles") { files: List<Map<String, String>> ->
      var count = 0
      for (entry in files) {
        val uri = entry["uri"] ?: continue
        val name = entry["name"] ?: continue
        val file = uriToFile(uri) ?: continue
        val snippet = extractText(file, name) ?: continue
        saveToDb(uri, name, snippet)
        count++
      }
      count
    }

    // Search indexed content — returns list of matches
    AsyncFunction("searchFiles") { query: String ->
      val results = mutableListOf<Map<String, String>>()
      val lower = query.lowercase()
      val cursor = db.readableDatabase.rawQuery(
        "SELECT uri, name, snippet FROM doc_index WHERE LOWER(snippet) LIKE ?",
        arrayOf("%$lower%")
      )
      cursor.use {
        while (it.moveToNext()) {
          val snippet = it.getString(2)
          val idx = snippet.lowercase().indexOf(lower)
          val preview = if (idx >= 0) {
            val start = maxOf(0, idx - 60)
            val end = minOf(snippet.length, idx + lower.length + 60)
            "...${snippet.substring(start, end)}..."
          } else snippet.take(150)

          results.add(mapOf(
            "uri" to it.getString(0),
            "name" to it.getString(1),
            "snippet" to preview
          ))
        }
      }
      results
    }

    // Check if a file is already indexed
    AsyncFunction("isIndexed") { uri: String ->
      val cursor = db.readableDatabase.rawQuery(
        "SELECT uri FROM doc_index WHERE uri = ?", arrayOf(uri)
      )
      val exists = cursor.count > 0
      cursor.close()
      exists
    }

    // Get total count of indexed files
    AsyncFunction("getIndexCount") {
      val cursor = db.readableDatabase.rawQuery("SELECT COUNT(*) FROM doc_index", null)
      var count = 0
      cursor.use { if (it.moveToFirst()) count = it.getInt(0) }
      count
    }

    // Remove a single file from index (e.g. after deletion)
    AsyncFunction("removeFromIndex") { uri: String ->
      db.writableDatabase.delete("doc_index", "uri = ?", arrayOf(uri))
    }

    // Wipe entire index
    AsyncFunction("clearIndex") {
      db.writableDatabase.execSQL("DELETE FROM doc_index")
    }
  }

  // ── Text extraction ──────────────────────────────────────────────────────────

  private fun extractText(file: File, name: String): String? {
    return try {
      val ext = name.substringAfterLast('.', "").lowercase()
      val text = when (ext) {
        "pdf"  -> extractPdf(file)
        "docx" -> extractDocx(file)
        "xlsx" -> extractXlsx(file)
        "txt", "csv", "rtf" -> file.readText(Charsets.UTF_8)
        else   -> null
      }
      text?.trim()?.take(2000)?.ifBlank { null }
    } catch (e: Exception) {
      null
    }
  }

  private fun extractPdf(file: File): String {
    PDDocument.load(file).use { doc ->
      val stripper = PDFTextStripper()
      stripper.endPage = minOf(3, doc.numberOfPages) // first 3 pages only
      return stripper.getText(doc)
    }
  }

  private fun extractDocx(file: File): String {
    // DOCX is a ZIP containing word/document.xml
    val sb = StringBuilder()
    ZipInputStream(file.inputStream()).use { zip ->
      var entry = zip.nextEntry
      while (entry != null) {
        if (entry.name == "word/document.xml") {
          val xml = zip.readBytes().toString(Charsets.UTF_8)
          // Extract text between <w:t> tags
          val regex = Regex("<w:t[^>]*>([^<]*)</w:t>")
          regex.findAll(xml).forEach { sb.append(it.groupValues[1]).append(" ") }
          break
        }
        entry = zip.nextEntry
      }
    }
    return sb.toString()
  }

  private fun extractXlsx(file: File): String {
    // XLSX is a ZIP containing xl/sharedStrings.xml (all text content)
    ZipInputStream(file.inputStream()).use { zip ->
      var entry = zip.nextEntry
      while (entry != null) {
        if (entry.name == "xl/sharedStrings.xml") {
          val xml = zip.readBytes().toString(Charsets.UTF_8)
          val sb = StringBuilder()
          val regex = Regex("<t[^>]*>([^<]*)</t>")
          regex.findAll(xml).forEach { sb.append(it.groupValues[1]).append(" ") }
          return sb.toString()
        }
        entry = zip.nextEntry
      }
    }
    return ""
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
    val values = ContentValues().apply {
      put("uri", uri)
      put("name", name)
      put("snippet", snippet)
      put("indexed_at", System.currentTimeMillis())
    }
    db.writableDatabase.insertWithOnConflict(
      "doc_index", null, values, SQLiteDatabase.CONFLICT_REPLACE
    )
  }
}
