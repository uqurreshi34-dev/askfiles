package expo.modules.storagestats

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.view.View
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView

class StorageStatsView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {

    private val donutView = DonutView(context)

    init {
        addView(donutView, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
    }

    var usedBytes: Double = 0.0
        set(value) { field = value; donutView.usedBytes = value }

    var totalBytes: Double = 0.0
        set(value) { field = value; donutView.totalBytes = value }

    var trackColor: String = "#EFEFEF"
        set(value) { field = value; donutView.trackColor = value }

    var strokeWidth: Float = 20f
        set(value) { field = value; donutView.strokeWidthDp = value }
}

class DonutView(context: Context) : View(context) {

    var usedBytes: Double = 0.0
        set(value) { field = value; invalidate() }

    var totalBytes: Double = 0.0
        set(value) { field = value; invalidate() }

    var trackColor: String = "#EFEFEF"
        set(value) { field = value; invalidate() }

    var strokeWidthDp: Float = 20f
        set(value) { field = value; invalidate() }

    private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.BUTT
    }

    private val oval = RectF()

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)

        if (totalBytes <= 0.0) return

        val density = resources.displayMetrics.density
        val strokePx = strokeWidthDp * density

        val cx = width / 2f
        val cy = height / 2f
        val radius = (minOf(width, height) / 2f) - strokePx / 2f - strokePx * 0.1f

        oval.set(cx - radius, cy - radius, cx + radius, cy + radius)

        val usedPercent = (usedBytes / totalBytes).coerceIn(0.0, 1.0)
        val usedArc = (usedPercent * 360.0).toFloat()
        val freeArc = 360f - usedArc

        // Pick colour based on usage
        val usedColor = when {
            usedPercent < 0.50 -> Color.parseColor("#2E7D32")  // green
            usedPercent < 0.75 -> Color.parseColor("#F5B731")  // amber
            else               -> Color.parseColor("#D32F2F")  // red
        }

        paint.strokeWidth = strokePx

        // Draw free arc (track)
        paint.color = try { Color.parseColor(trackColor) } catch (e: Exception) { Color.LTGRAY }
        if (freeArc > 0f) {
            canvas.drawArc(oval, -90f + usedArc, freeArc, false, paint)
        }

        // Draw used arc
        paint.color = usedColor
        if (usedArc > 0f) {
            canvas.drawArc(oval, -90f, usedArc, false, paint)
        }
    }
}
