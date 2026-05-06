package com.askfiles.mobile

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.StatFs
import android.os.Environment
import android.widget.RemoteViews
import com.askfiles.mobile.R
import org.json.JSONArray

class StorageWidget : AppWidgetProvider() {

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        for (appWidgetId in appWidgetIds) {
            updateWidget(context, appWidgetManager, appWidgetId)
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
                "bmp" -> "image/bmp"
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
                "ogg" -> "audio/ogg"
                "m4a" -> "audio/mp4"
                "pdf" -> "application/pdf"
                "doc" -> "application/msword"
                "docx" -> "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                "xls" -> "application/vnd.ms-excel"
                "xlsx" -> "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                "ppt" -> "application/vnd.ms-powerpoint"
                "pptx" -> "application/vnd.openxmlformats-officedocument.presentationml.presentation"
                "txt" -> "text/plain"
                "zip" -> "application/zip"
                "rar" -> "application/x-rar-compressed"
                "apk" -> "application/vnd.android.package-archive"
                else -> "*/*"
            }
        }

        fun updateWidget(context: Context, appWidgetManager: AppWidgetManager, appWidgetId: Int) {
            val views = RemoteViews(context.packageName, R.layout.storage_widget)

            // Storage stats
            try {
                val extPath = Environment.getExternalStorageDirectory().absolutePath
                val extStat = StatFs(extPath)
                val rawTotal = extStat.blockCountLong * extStat.blockSizeLong
                val freeBytes = extStat.availableBlocksLong * extStat.blockSizeLong
                val usedBytes = rawTotal - freeBytes
                val GB = 1_073_741_824L
                val sizes = listOf(32L, 64L, 128L, 256L, 512L, 1024L, 2048L).map { it * GB }
                val marketedTotal = sizes.firstOrNull { it >= rawTotal } ?: rawTotal

                val usedGB = usedBytes.toFloat() / 1_073_741_824f
                val totalGB = marketedTotal.toFloat() / 1_073_741_824f
                val freeGB = freeBytes.toFloat() / 1_073_741_824f
                val usedPercent = if (marketedTotal > 0) ((usedBytes.toFloat() / marketedTotal.toFloat()) * 100).toInt() else 0

                views.setTextViewText(R.id.widget_used, "%.1f GB used".format(usedGB))
                views.setTextViewText(R.id.widget_total, "of %.0f GB".format(totalGB))
                views.setTextViewText(R.id.widget_free, "%.1f GB available · user accessible storage".format(freeGB))
                views.setTextViewText(R.id.widget_percent, "$usedPercent%")
                views.setProgressBar(R.id.widget_progress, 100, usedPercent, false)
            } catch (e: Exception) {
                views.setTextViewText(R.id.widget_used, "Tap to open")
                views.setTextViewText(R.id.widget_total, "AskFiles")
                views.setTextViewText(R.id.widget_free, "")
                views.setTextViewText(R.id.widget_percent, "")
                views.setProgressBar(R.id.widget_progress, 100, 0, false)
            }

            // Tap widget header to open app
            val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
                ?: Intent(context, Class.forName("${context.packageName}.MainActivity"))
            val launchPending = PendingIntent.getActivity(
                context, 0, launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.widget_root, launchPending)

            // Recent files from SharedPreferences
            val prefs = context.getSharedPreferences("askfiles_widget", Context.MODE_PRIVATE)
            val recentsJson = prefs.getString("recents", "[]") ?: "[]"
            val recentIds = listOf(
                Triple(R.id.recent_row_1, R.id.recent_name_1, R.id.recent_meta_1),
                Triple(R.id.recent_row_2, R.id.recent_name_2, R.id.recent_meta_2),
                Triple(R.id.recent_row_3, R.id.recent_name_3, R.id.recent_meta_3),
                Triple(R.id.recent_row_4, R.id.recent_name_4, R.id.recent_meta_4),
            )

            try {
                val arr = JSONArray(recentsJson)
                for (i in recentIds.indices) {
                    val (rowId, nameId, metaId) = recentIds[i]
                    if (i < arr.length()) {
                        val item = arr.getJSONObject(i)
                        val name = item.getString("name")
                        val uri = item.getString("uri")
                        val openedAt = item.getLong("openedAt")

                        views.setTextViewText(nameId, name)
                        views.setTextViewText(metaId, timeAgo(openedAt))
                        views.setViewVisibility(rowId, android.view.View.VISIBLE)

                        // PendingIntent to open the file directly
                        val filePath = uri.removePrefix("file://")
                        val mime = getMimeType(name)
                        val fileIntent = Intent(Intent.ACTION_VIEW).apply {
                            val file = java.io.File(filePath)
                            val fileUri = androidx.core.content.FileProvider.getUriForFile(
                                context,
                                "${context.packageName}.provider",
                                file
                            )
                            setDataAndType(fileUri, mime)
                            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        }
                        val filePending = PendingIntent.getActivity(
                            context, 100 + i, fileIntent,
                            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                        )
                        views.setOnClickPendingIntent(rowId, filePending)
                    } else {
                        views.setViewVisibility(rowId, android.view.View.GONE)
                    }
                }
            } catch (e: Exception) {
                for ((rowId, _, _) in recentIds) {
                    views.setViewVisibility(rowId, android.view.View.GONE)
                }
            }

            appWidgetManager.updateAppWidget(appWidgetId, views)
        }

        fun timeAgo(openedAt: Long): String {
            val diff = System.currentTimeMillis() - openedAt
            val minutes = diff / 60000
            val hours = diff / 3600000
            val days = diff / 86400000
            return when {
                minutes < 1 -> "Just now"
                minutes < 60 -> "$minutes min ago"
                hours < 24 -> "$hours hr ago"
                days == 1L -> "Yesterday"
                else -> "$days days ago"
            }
        }
    }
}
