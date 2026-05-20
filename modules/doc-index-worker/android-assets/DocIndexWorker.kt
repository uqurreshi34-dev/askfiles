package com.askfiles.mobile

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.pm.ServiceInfo
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.work.*
import java.io.File
import java.util.zip.ZipInputStream
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

class DocIndexWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    companion object {
        const val WORK_NAME = "doc_index_worker"
        const val CHANNEL_ID = "doc_index_channel"
        const val NOTIFICATION_ID = 42

        fun schedule(context: Context) {
            val constraints = Constraints.Builder()
                .setRequiresCharging(true)
                .build()

            val request = PeriodicWorkRequestBuilder<DocIndexWorker>(
                24, java.util.concurrent.TimeUnit.HOURS
            )
                .setConstraints(constraints)
                .build()

            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                WORK_NAME,
                ExistingPeriodicWorkPolicy.KEEP,
                request
            )
        }
    }

    override suspend fun doWork(): Result {
        try {
            createNotificationChannel()
            setForeground(getForegroundInfo())

            val db = DocIndexDbHelper(applicationContext).writableDatabase
            val files = collectFiles()

            db.beginTransaction()
            try {
                for (file in files.take(500)) {
                    // Skip if already indexed
                    val cursor = db.rawQuery(
                        "SELECT id FROM doc_meta WHERE uri = ?",
                        arrayOf("file://${file.absolutePath}")
                    )
                    val exists = cursor.count > 0
                    cursor.close()
                    if (exists) continue

                    val snippet = extractText(file) ?: continue
                    val uri = "file://${file.absolutePath}"

                    // Insert meta
                    db.execSQL(
                        "INSERT INTO doc_meta(uri, name, snippet, indexed_at) VALUES(?,?,?,?)",
                        arrayOf(uri, file.name, snippet, System.currentTimeMillis().toString())
                    )

                    // Get new id and insert FTS
                    val idCursor = db.rawQuery(
                        "SELECT id FROM doc_meta WHERE uri = ?", arrayOf(uri)
                    )
                    if (idCursor.moveToFirst()) {
                        val id = idCursor.getLong(0)
                        db.execSQL(
                            "INSERT INTO doc_fts(rowid, name, snippet) VALUES(?,?,?)",
                            arrayOf(id.toString(), file.name, snippet)
                        )
                    }
                    idCursor.close()
                }
                db.setTransactionSuccessful()
            } finally {
                db.endTransaction()
            }

            return Result.success()
        } catch (e: Exception) {
            return Result.failure()
        }
    }

    override suspend fun getForegroundInfo(): ForegroundInfo {
        val notification = createNotification()
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ForegroundInfo(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            ForegroundInfo(NOTIFICATION_ID, notification)
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Document Indexing",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Preparing Smart Search in background"
                setShowBadge(false)
            }
            val manager = applicationContext.getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }
    }

    private fun createNotification(): Notification {
        return NotificationCompat.Builder(applicationContext, CHANNEL_ID)
            .setContentTitle("Preparing Smart Search")
            .setContentText("AskFiles is indexing your documents")
            .setSmallIcon(android.R.drawable.ic_menu_search)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setSilent(true)
            .setOngoing(true)
            .build()
    }

    private fun collectFiles(): List<File> {
        val results = mutableListOf<File>()
        val extensions = setOf("pdf", "docx", "xlsx", "txt", "csv", "rtf")
        val scanDirs = listOf(
            "/storage/emulated/0/Documents/",
            "/storage/emulated/0/Download/"
        )
        for (dir in scanDirs) {
            scanDir(File(dir), results, extensions)
        }
        return results
    }

    private fun scanDir(dir: File, results: MutableList<File>, extensions: Set<String>) {
        if (!dir.exists() || !dir.isDirectory) return
        val contents = dir.listFiles() ?: return
        for (item in contents) {
            if (item.name.startsWith('.')) continue
            if (item.isDirectory) {
                scanDir(item, results, extensions)
            } else {
                val ext = item.name.substringAfterLast('.', "").lowercase()
                if (ext in extensions) results.add(item)
            }
        }
    }

    private fun extractText(file: File): String? {
        return try {
            val ext = file.name.substringAfterLast('.', "").lowercase()
            val text = when (ext) {
                "pdf" -> extractPdf(file)
                "docx" -> extractDocx(file)
                "xlsx" -> extractXlsx(file)
                else -> file.readText().take(5000)
            }
            text?.trim()?.take(5000)?.ifBlank { null }
        } catch (e: Exception) {
            null
        }
    }

    private fun extractPdf(file: File): String {
        return try {
            // Basic text extraction — strips PDF binary, keeps readable text
            val bytes = file.inputStream().use { stream ->
                if (file.length() > 2 * 1024 * 1024) stream.readNBytes(2 * 1024 * 1024)
                else stream.readBytes()
            }
            val raw = bytes.toString(Charsets.ISO_8859_1)
            val sb = StringBuilder()
            val regex = Regex("""\(([^)]{3,100})\)""")
            regex.findAll(raw).forEach { match ->
                val text = match.groupValues[1]
                if (text.any { it.isLetter() }) {
                    sb.append(text).append(" ")
                }
                if (sb.length >= 5000) return@forEach
            }
            sb.toString()
        } catch (e: Exception) { "" }
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
                    Regex("<w:t[^>]*>([^<]*)</w:t>").findAll(xml).forEach {
                        sb.append(it.groupValues[1]).append(" ")
                        if (sb.length >= 5000) return@forEach
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
        ZipInputStream(file.inputStream()).use { zip ->
            var entry = zip.nextEntry
            while (entry != null) {
                if (entry.name == "xl/sharedStrings.xml") {
                    val bytes = zip.readBytes()
                    val xml = if (bytes.size > 512 * 1024)
                        bytes.take(512 * 1024).toByteArray().toString(Charsets.UTF_8)
                    else bytes.toString(Charsets.UTF_8)
                    Regex("<t[^>]*>([^<]*)</t>").findAll(xml).forEach {
                        sb.append(it.groupValues[1]).append(" ")
                        if (sb.length >= 5000) return@forEach
                    }
                    break
                }
                entry = zip.nextEntry
            }
        }
        return sb.toString()
    }
}

// Reuses the same database as DocIndexerModule
class DocIndexDbHelper(context: Context) :
    SQLiteOpenHelper(context, "doc_index.db", null, 16) {

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
        onCreate(db)
    }
}
