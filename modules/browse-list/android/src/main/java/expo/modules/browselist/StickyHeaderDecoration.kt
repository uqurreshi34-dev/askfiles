package expo.modules.browselist

import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import androidx.recyclerview.widget.RecyclerView

class StickyHeaderDecoration(
    private val density: Float,
    private val getSectionLabel: (position: Int) -> String?
) : RecyclerView.ItemDecoration() {

    private val headerHeight = (32 * density).toInt()
    private val bgPaint = Paint().apply { color = Color.parseColor("#F1EFE8") }
    private val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#5F5E5A")
        textSize = 13f * density
        isFakeBoldText = true
    }

    fun setColors(bg: Int, text: Int) {
        bgPaint.color = bg
        textPaint.color = text
    }

    private fun isSectionStart(position: Int): Boolean {
        if (position == 0) return getSectionLabel(0) != null
        val current = getSectionLabel(position) ?: return false
        val previous = getSectionLabel(position - 1)
        return current != previous
    }

    override fun getItemOffsets(outRect: Rect, view: android.view.View, parent: RecyclerView, state: RecyclerView.State) {
        val position = parent.getChildAdapterPosition(view)
        if (position == RecyclerView.NO_POSITION) return
        outRect.top = if (isSectionStart(position)) headerHeight else 0
    }

    override fun onDrawOver(c: Canvas, parent: RecyclerView, state: RecyclerView.State) {
        if (parent.childCount == 0) return
        val topChild = parent.getChildAt(0)
        val topPosition = parent.getChildAdapterPosition(topChild)
        if (topPosition == RecyclerView.NO_POSITION) return
        val currentLabel = getSectionLabel(topPosition) ?: return

        // Draw inline headers for each visible section start
        for (i in 0 until parent.childCount) {
            val child = parent.getChildAt(i)
            val position = parent.getChildAdapterPosition(child)
            if (position != RecyclerView.NO_POSITION && isSectionStart(position) && position != topPosition) {
                val label = getSectionLabel(position) ?: continue
                drawHeader(c, parent, label, (child.top - headerHeight).toFloat())
            }
        }

        // Draw sticky pinned header, pushed off by the next section's inline header
        var stickyTop = 0f
        for (i in 0 until parent.childCount) {
            val child = parent.getChildAt(i)
            val position = parent.getChildAdapterPosition(child)
            if (position != RecyclerView.NO_POSITION && position > topPosition && isSectionStart(position)) {
                val childTop = child.top.toFloat()
                if (childTop < headerHeight) stickyTop = childTop - headerHeight
                break
            }
        }
        drawHeader(c, parent, currentLabel, stickyTop.coerceAtMost(0f))
    }

    private fun drawHeader(c: Canvas, parent: RecyclerView, label: String, top: Float) {
        c.drawRect(0f, top, parent.width.toFloat(), top + headerHeight, bgPaint)
        val textY = top + headerHeight / 2f - (textPaint.descent() + textPaint.ascent()) / 2f
        c.drawText(label, 16f * density, textY, textPaint)
    }
}
