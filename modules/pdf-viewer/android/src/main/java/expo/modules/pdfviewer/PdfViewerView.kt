package expo.modules.pdfviewer

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.pdf.PdfRenderer
import android.os.Handler
import android.os.Looper
import android.os.ParcelFileDescriptor
import android.view.GestureDetector
import android.view.MotionEvent
import android.view.ScaleGestureDetector
import android.view.View
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import java.io.File
import java.util.concurrent.Executors
import kotlin.math.min

class PdfViewerView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {

    private val onPageCount by EventDispatcher()

    private val mainHandler = Handler(Looper.getMainLooper())
    private val executor = Executors.newSingleThreadExecutor()

    private var pdfRenderer: PdfRenderer? = null
    private var currentPage: Int = 0
    private var currentBitmap: Bitmap? = null

    private var viewW = 0
    private var viewH = 0

    private val currentMatrix = Matrix()
    private var currentScale = 1f
    private var fitScale = 1f
    private val maxScale = 5f
    private val doubleTapScale = 2.5f

    private val canvasView = object : View(context) {
        override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
            super.onSizeChanged(w, h, oldw, oldh)
            viewW = w
            viewH = h
            if (currentBitmap != null) resetMatrix()
        }

        override fun onDraw(canvas: Canvas) {
            super.onDraw(canvas)
            val bmp = currentBitmap ?: return
            canvas.drawColor(Color.WHITE)
            canvas.drawBitmap(bmp, currentMatrix, null)
        }
    }.apply {
        setBackgroundColor(Color.WHITE)
    }

    private val scaleDetector = ScaleGestureDetector(context,
        object : ScaleGestureDetector.SimpleOnScaleGestureListener() {
            override fun onScale(detector: ScaleGestureDetector): Boolean {
                val newScale = (currentScale * detector.scaleFactor).coerceIn(fitScale * 0.9f, maxScale)
                val actualFactor = newScale / currentScale
                currentScale = newScale
                currentMatrix.postScale(actualFactor, actualFactor, detector.focusX, detector.focusY)
                clampMatrix()
                canvasView.invalidate()
                return true
            }
        }
    )

    private val gestureDetector = GestureDetector(context,
        object : GestureDetector.SimpleOnGestureListener() {
            override fun onDoubleTap(e: MotionEvent): Boolean {
                val isZoomedIn = currentScale > fitScale + 0.1f
                if (isZoomedIn) {
                    resetMatrix()
                } else {
                    val factor = doubleTapScale / currentScale
                    currentScale = doubleTapScale
                    currentMatrix.postScale(factor, factor, e.x, e.y)
                    clampMatrix()
                    canvasView.invalidate()
                }
                return true
            }

            override fun onScroll(
                e1: MotionEvent?, e2: MotionEvent,
                distanceX: Float, distanceY: Float
            ): Boolean {
                currentMatrix.postTranslate(-distanceX, -distanceY)
                clampMatrix()
                canvasView.invalidate()
                return true
            }
        }
    )

    init {
        canvasView.layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
        canvasView.setOnTouchListener { _, event ->
            scaleDetector.onTouchEvent(event)
            gestureDetector.onTouchEvent(event)
            true
        }
        addView(canvasView)
    }

    fun loadPdf(uri: String) {
        executor.execute {
            try {
                pdfRenderer?.close()
                val file = File(uri.removePrefix("file://"))
                val fd = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
                pdfRenderer = PdfRenderer(fd)
                val count = pdfRenderer!!.pageCount
                mainHandler.post {
                    onPageCount(mapOf("count" to count))
                    renderPage(currentPage)
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    fun goToPage(page: Int) {
        if (page == currentPage && currentBitmap != null) return
        currentPage = page
        renderPage(page)
    }

    private fun renderPage(pageIndex: Int) {
        executor.execute {
            val renderer = pdfRenderer ?: return@execute
            if (pageIndex < 0 || pageIndex >= renderer.pageCount) return@execute

            val page = renderer.openPage(pageIndex)
            val screenW = context.resources.displayMetrics.widthPixels
            val screenH = context.resources.displayMetrics.heightPixels
            val scaleX = screenW.toFloat() / page.width
            val scaleY = screenH.toFloat() / page.height
            val scale = minOf(scaleX, scaleY, 3f) // cap at 3x for quality without OOM
            val width = (page.width * scale).toInt()
            val height = (page.height * scale).toInt()

            val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
            val canvas = Canvas(bitmap)
            canvas.drawColor(Color.WHITE)
            page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
            page.close()

            mainHandler.post {
                currentBitmap?.recycle()
                currentBitmap = bitmap
                resetMatrix()
                canvasView.invalidate()
            }
        }
    }

    private fun resetMatrix() {
        val bmp = currentBitmap ?: return
        val vw = viewW.takeIf { it > 0 } ?: return
        val vh = viewH.takeIf { it > 0 } ?: return
        val scale = min(vw.toFloat() / bmp.width, vh.toFloat() / bmp.height)
        val dx = (vw - bmp.width * scale) / 2f
        val dy = (vh - bmp.height * scale) / 2f
        currentMatrix.reset()
        currentMatrix.setScale(scale, scale)
        currentMatrix.postTranslate(dx, dy)
        currentScale = scale
        fitScale = scale
        canvasView.invalidate()
    }

    private fun clampMatrix() {
        val bmp = currentBitmap ?: return
        val vw = viewW.takeIf { it > 0 } ?: return
        val vh = viewH.takeIf { it > 0 } ?: return
        val values = FloatArray(9)
        currentMatrix.getValues(values)
        val transX = values[Matrix.MTRANS_X]
        val transY = values[Matrix.MTRANS_Y]
        val scaledW = bmp.width * currentScale
        val scaledH = bmp.height * currentScale

        var dx = 0f
        var dy = 0f

        if (scaledW <= vw) {
            dx = (vw - scaledW) / 2f - transX
        } else {
            if (transX > 0f) dx = -transX
            else if (transX + scaledW < vw) dx = vw - transX - scaledW
        }

        if (scaledH <= vh) {
            dy = (vh - scaledH) / 2f - transY
        } else {
            if (transY > 0f) dy = -transY
            else if (transY + scaledH < vh) dy = vh - transY - scaledH
        }

        if (dx != 0f || dy != 0f) currentMatrix.postTranslate(dx, dy)
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        executor.execute {
            pdfRenderer?.close()
            pdfRenderer = null
            mainHandler.post {
                currentBitmap?.recycle()
                currentBitmap = null
            }
        }
    }
}
