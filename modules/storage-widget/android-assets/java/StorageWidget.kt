package com.askfiles.mobile

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.os.StatFs
import android.os.Environment
import android.widget.RemoteViews
import com.askfiles.mobile.R
import org.json.JSONArray
import org.json.JSONObject

class StorageWidget : AppWidgetProvider() {

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        android.util.Log.d("AskFilesWidget", "onUpdate called for ${appWidgetIds.size} widgets")
        for (appWidgetId in appWidgetIds) {
            updateWidget(context, appWidgetManager, appWidgetId)
        }
    }

    override fun onReceive(context: Context, intent: Intent) {
        android.util.Log.d("AskFilesWidget", "onReceive fired: ${intent.action}")
        super.onReceive(context, intent)
        if (intent.action == "com.askfiles.mobile.UPDATE_WIDGET") {
            android.util.Log.d("AskFilesWidget", "UPDATE_WIDGET received")
            val manager = AppWidgetManager.getInstance(context)
            val ids = manager.getAppWidgetIds(
                android.content.ComponentName(context, StorageWidget::class.java)
            )
            android.util.Log.d("AskFilesWidget", "Found ${ids.size} widget IDs")
            for (id in ids) {
                updateWidget(context, manager, id)
            }
        }
    }

    companion object {

        fun getMimeType(name: String): String {
            return when (name.substringAfterLast('.', "").lowercase()) {
                "jpg", "jpeg" -> "image/jpeg"
                "png" -> "image/png"
                "gif" -> "image/gif"
                "webp" -> "image/webp"
                "heic" -> "image/heic"
                "mp4" -> "video/mp4"
                "mkv" -> "video/x-matroska"
                "avi" -> "video/x-msvideo"
                "mov" -> "video/quicktime"
                "webm" -> "video/webm"
                "3gp" -> "video/3gpp"
                "mp3" -> "audio/mpeg"
                "aac" -> "audio/aac"
                "wav" -> "audio/wav"
                "flac" -> "audio/flac"
                "m4a" -> "audio/mp4"
                "pdf" -> "application/pdf"
                "doc" -> "application/msword"
                "docx" -> "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                "xls" -> "application/vnd.ms-excel"
                "xlsx" -> "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                "txt" -> "text/plain"
                "zip" -> "application/zip"
                "apk" -> "application/vnd.android.package-archive"
                else -> "*/*"
            }
        }

        /**
         * Words in the app's language, saved by the app (saveWidgetStrings) whenever
         * the language changes. English is the fallback before the app has run.
         * Counted keys: base_one (1), base_two (2, Arabic dual), base_few (2-10), base_many (11+).
         */
        fun widgetStrings(context: Context): JSONObject? = try {
            context.getSharedPreferences("askfiles_widget", Context.MODE_PRIVATE)
                .getString("strings", null)?.let { JSONObject(it) }
        } catch (e: Exception) { null }

        private fun word(s: JSONObject?, key: String, fallback: String): String =
            s?.optString(key)?.takeIf { it.isNotEmpty() } ?: fallback

        private fun counted(s: JSONObject?, base: String, n: Long, fallback: String): String {
            val key = when {
                n == 1L -> "${base}_one"
                n == 2L && s?.has("${base}_two") == true -> "${base}_two"
                n in 2L..10L -> "${base}_few"
                else -> "${base}_many"
            }
            return word(s, key, fallback).replace("{n}", n.toString())
        }

        fun timeAgo(openedAt: Long, s: JSONObject? = null): String {
            val diff = System.currentTimeMillis() - openedAt
            val minutes = diff / 60000
            val hours = diff / 3600000
            val days = diff / 86400000
            return when {
                minutes < 1 -> word(s, "justNow", "Just now")
                minutes < 60 -> counted(s, "mins", minutes, "$minutes min ago")
                hours < 24 -> counted(s, "hours", hours, "$hours hr ago")
                days == 1L -> word(s, "yesterday", "Yesterday")
                else -> counted(s, "days", days, "$days days ago")
            }
        }

        fun updateWidget(context: Context, appWidgetManager: AppWidgetManager, appWidgetId: Int) {
            val views = RemoteViews(context.packageName, R.layout.storage_widget)
            val s = widgetStrings(context)

            // Storage stats
            try {
                val GB = 1_073_741_824L
                val sizes = listOf(32L, 64L, 128L, 256L, 512L, 1024L, 2048L).map { it * GB }

                val rawTotal: Long
                val freeBytes: Long

                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                    val storageManager = context.getSystemService(android.content.Context.STORAGE_SERVICE) as android.os.storage.StorageManager
                    val storageStatsManager = context.getSystemService(android.content.Context.STORAGE_STATS_SERVICE) as android.app.usage.StorageStatsManager
                    rawTotal = storageStatsManager.getTotalBytes(android.os.storage.StorageManager.UUID_DEFAULT)
                    freeBytes = storageStatsManager.getFreeBytes(android.os.storage.StorageManager.UUID_DEFAULT)
                } else {
                    val extStat = StatFs(Environment.getExternalStorageDirectory().absolutePath)
                    rawTotal = extStat.blockCountLong * extStat.blockSizeLong
                    freeBytes = extStat.availableBlocksLong * extStat.blockSizeLong
                }

                val usedBytes = rawTotal - freeBytes
                val marketedTotal = sizes.firstOrNull { it >= rawTotal } ?: rawTotal

                val usedGB = usedBytes.toFloat() / 1_073_741_824f
                val totalGB = marketedTotal.toFloat() / 1_073_741_824f
                val freeGB = freeBytes.toFloat() / 1_073_741_824f
                val usedPercent = if (marketedTotal > 0) ((usedBytes.toFloat() / marketedTotal.toFloat()) * 100).toInt() else 0

                views.setTextViewText(R.id.widget_used, word(s, "gbUsed", "{n} GB used").replace("{n}", "%.1f".format(usedGB)))
                views.setTextViewText(R.id.widget_total, word(s, "gbOf", "of {n} GB").replace("{n}", "%.0f".format(totalGB)))
                views.setTextViewText(R.id.widget_free, word(s, "gbAvailable", "{n} GB available").replace("{n}", "%.1f".format(freeGB)))
                views.setTextViewText(R.id.widget_percent, "$usedPercent%")
                views.setProgressBar(R.id.widget_progress, 100, usedPercent, false)
            } catch (e: Exception) {
                views.setTextViewText(R.id.widget_used, word(s, "tapToOpen", "Tap to open"))
                views.setTextViewText(R.id.widget_total, "AskFiles")
                views.setTextViewText(R.id.widget_free, "")
                views.setTextViewText(R.id.widget_percent, "")
                views.setProgressBar(R.id.widget_progress, 100, 0, false)
            }

            // Tap header to open app
            val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
                ?: Intent(context, Class.forName("${context.packageName}.MainActivity"))
            val launchPending = PendingIntent.getActivity(
                context, 0, launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.widget_root, launchPending)

            // Recent files
            val prefs = context.getSharedPreferences("askfiles_widget", Context.MODE_PRIVATE)
            val recentsJson = prefs.getString("recents", "[]") ?: "[]"
            android.util.Log.d("AskFilesWidget", "Loading recents: $recentsJson")

            data class RowIds(val rowId: Int, val nameId: Int, val metaId: Int)
            val recentIds = listOf(
                RowIds(R.id.recent_row_1, R.id.recent_name_1, R.id.recent_meta_1),
                RowIds(R.id.recent_row_2, R.id.recent_name_2, R.id.recent_meta_2),
                RowIds(R.id.recent_row_3, R.id.recent_name_3, R.id.recent_meta_3),
                RowIds(R.id.recent_row_4, R.id.recent_name_4, R.id.recent_meta_4),
            )

            try {
                val arr = JSONArray(recentsJson)
                for (i in recentIds.indices) {
                    val rowId = recentIds[i].rowId
                    val nameId = recentIds[i].nameId
                    val metaId = recentIds[i].metaId
                    if (i < arr.length()) {
                        val item = arr.getJSONObject(i)
                        val name = item.getString("name")
                        val uri = item.getString("uri")
                        val openedAt = item.getLong("openedAt")

                        views.setTextViewText(nameId, name)
                        views.setTextViewText(metaId, timeAgo(openedAt, s))
                        views.setViewVisibility(rowId, android.view.View.VISIBLE)

                        // PendingIntent to open file
                        try {
                            val filePath = java.net.URLDecoder.decode(uri.removePrefix("file://"), "UTF-8")
                            // Built the same way as opening a file inside the app: real type,
                            // Open with for unknown types, and SD card files included.
                            val fileIntent = com.askfiles.mobile.sharemodule.OpenIntents
                                .viewIntent(context, filePath, getMimeType(name))
                            val filePending = PendingIntent.getActivity(
                                context, 100 + i, fileIntent,
                                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                            )
                            views.setOnClickPendingIntent(rowId, filePending)
                        } catch (e: Exception) {
                            android.util.Log.d("AskFilesWidget", "File intent error: ${e.message}")
                        }
                    } else {
                        views.setViewVisibility(rowId, android.view.View.GONE)
                    }
                }
            } catch (e: Exception) {
                android.util.Log.d("AskFilesWidget", "Recents parse error: ${e.message}")
                for (row in recentIds) {
                    views.setViewVisibility(row.rowId, android.view.View.GONE)
                }
            }

            appWidgetManager.updateAppWidget(appWidgetId, views)
        }
    }
}
