package expo.modules.chartview

import android.content.Context
import android.graphics.*
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView

class ChartView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {

    var xLabels: List<String> = emptyList()
    var yValues: List<Double> = emptyList()
    var chartType: String = "bar"

    private val barPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#185FA5")
        style = Paint.Style.FILL
    }
    private val gridPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#22000000")
        style = Paint.Style.STROKE
        strokeWidth = 1f
    }
    private val labelPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#88000000")
        textSize = 26f
        textAlign = Paint.Align.RIGHT
    }
    private val valuePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#185FA5")
        textSize = 24f
        textAlign = Paint.Align.LEFT
        typeface = Typeface.DEFAULT_BOLD
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        if (yValues.isEmpty() || xLabels.isEmpty()) return

        val w = width.toFloat()
        val h = height.toFloat()
        val padL = 240f  // space for labels on left
        val padR = 120f  // space for values on right
        val padT = 16f
        val padB = 16f

        val chartW = w - padL - padR
        val chartH = h - padT - padB

        val count = xLabels.size.coerceAtMost(yValues.size)
        if (count == 0) return

        val maxVal = yValues.take(count).max().coerceAtLeast(0.001)

        val barH = (chartH / count) * 0.6f
        val gap = (chartH / count) * 0.4f

        for (i in 0 until count) {
            val y = padT + i * (chartH / count) + gap / 2
            val barW = (yValues[i] / maxVal * chartW).toFloat().coerceAtLeast(2f)

            // Bar
            canvas.drawRoundRect(padL, y, padL + barW, y + barH, 4f, 4f, barPaint)

            // Label on left
            val label = if (xLabels.size > i) xLabels[i] else ""
            canvas.drawText(label.take(12), padL - 8f, y + barH / 2 + labelPaint.textSize / 3, labelPaint)

            // Value on right of bar
            val fmt = when {
                yValues[i] >= 1_000_000 -> "${"%.1f".format(yValues[i] / 1_000_000)}M"
                yValues[i] >= 1_000 -> "${"%.1f".format(yValues[i] / 1_000)}K"
                yValues[i] % 1.0 == 0.0 -> "%.0f".format(yValues[i])
                else -> "%.2f".format(yValues[i])
            }
            canvas.drawText(fmt, padL + barW + 8f, y + barH / 2 + valuePaint.textSize / 3, valuePaint)
        }
    }
}
