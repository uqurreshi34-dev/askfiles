package expo.modules.browselist

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.view.MotionEvent
import android.view.View

class AlphabetIndexView(context: Context) : View(context) {

    val letters: List<Char> = ('A'..'Z').toList() + '#'
    var availableLetters: Set<Char> = emptySet()
    var onLetterSelected: ((Char) -> Unit)? = null

    var enabledColor: Int = Color.parseColor("#185FA5")
    var disabledColor: Int = Color.parseColor("#C7C7C7")
    var bubbleBgColor: Int = Color.parseColor("#185FA5")
    var bubbleTextColor: Int = Color.WHITE

    private val dp = context.resources.displayMetrics.density
    private val letterPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        textAlign = Paint.Align.CENTER
    }
    private val bubblePaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val bubbleTextPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        textAlign = Paint.Align.CENTER
        textSize = 28f * dp
        color = Color.WHITE
    }

    private var activeIndex = -1
    private var lastHapticIndex = -1

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        if (height == 0) return
        val itemHeight = height.toFloat() / letters.size
        letterPaint.textSize = (itemHeight * 0.55f).coerceIn(8f * dp, 12f * dp)
        letters.forEachIndexed { i, c ->
            letterPaint.color = if (availableLetters.contains(c)) enabledColor else disabledColor
            val cy = itemHeight * i + itemHeight / 2f - (letterPaint.descent() + letterPaint.ascent()) / 2f
            canvas.drawText(c.toString(), width / 2f, cy, letterPaint)
        }

        if (activeIndex in letters.indices) {
            val letter = letters[activeIndex]
            if (availableLetters.contains(letter)) {
                val bubbleRadius = 24f * dp
                val itemCenterY = itemHeight * activeIndex + itemHeight / 2f
                val bubbleCx = -bubbleRadius * 1.6f
                val bubbleCy = itemCenterY
                bubblePaint.color = bubbleBgColor
                canvas.drawCircle(bubbleCx, bubbleCy, bubbleRadius, bubblePaint)
                val ty = bubbleCy - (bubbleTextPaint.descent() + bubbleTextPaint.ascent()) / 2f
                canvas.drawText(letter.toString(), bubbleCx, ty, bubbleTextPaint)
            }
        }
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        when (event.action) {
            MotionEvent.ACTION_DOWN, MotionEvent.ACTION_MOVE -> {
                if (height == 0) return true
                val itemHeight = height.toFloat() / letters.size
                val index = (event.y / itemHeight).toInt().coerceIn(0, letters.size - 1)
                val letter = letters[index]
                if (availableLetters.contains(letter)) {
                    if (index != lastHapticIndex) {
                        performHapticFeedback(android.view.HapticFeedbackConstants.CLOCK_TICK)
                        lastHapticIndex = index
                    }
                    activeIndex = index
                    onLetterSelected?.invoke(letter)
                    invalidate()
                } else {
                    activeIndex = index
                    invalidate()
                }
                parent?.requestDisallowInterceptTouchEvent(true)
                return true
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                activeIndex = -1
                lastHapticIndex = -1
                invalidate()
                parent?.requestDisallowInterceptTouchEvent(false)
            }
        }
        return true
    }
}
