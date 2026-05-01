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
        fun updateWidget(context: Context, appWidgetManager: AppWidgetManager, appWidgetId: Int) {
            val views = RemoteViews(context.packageName, R.layout.storage_widget)

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

            // Tap to open app
            val intent = context.packageManager.getLaunchIntentForPackage(context.packageName)
                ?: Intent(context, Class.forName("${context.packageName}.MainActivity"))
            val pendingIntent = PendingIntent.getActivity(
                context, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.widget_root, pendingIntent)

            appWidgetManager.updateAppWidget(appWidgetId, views)
        }
    }
}
