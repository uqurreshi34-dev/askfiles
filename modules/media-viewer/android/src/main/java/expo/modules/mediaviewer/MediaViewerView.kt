package expo.modules.mediaviewer

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Matrix
import android.os.Handler
import android.os.Looper
import android.view.GestureDetector
import android.view.MotionEvent
import android.view.ScaleGestureDetector
import android.view.View
import androidx.exifinterface.media.ExifInterface
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import java.util.concurrent.Executors
import kotlin.math.abs
import kotlin.math.min

class MediaViewerView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {

    private val onTap by EventDispatcher()
    private val onSwipeNext by EventDispatcher()
    private val onSwipePrevious by EventDispatcher()

    private val mainHandler = Handler(Looper.getMainLooper())
    private val executor = Executors.newFixedThreadPool(3)

    private val screenW = context.resources.displayMetrics.widthPixels
    private val screenH = context.resources.displayMetrics.heightPixels

    private var viewW = 0
    private var viewH = 0

    // Current image
    private var currentUri: String? = null
    private var currentBitmap: Bitmap? = null
    private val currentMatrix = Matrix()
    private var currentScale = 1f
    private var fitScale = 1f
    private val maxScale = 5f
    private val doubleTapScale = 2.5f

    // Adjacent images
    private var prevUri: String? = null
    private var nextUri: String? = null
    private var prevBitmap: Bitmap? = null
    private var nextBitmap: Bitmap? = null

    // Drag-to-navigate state
    private var dragOffsetX = 0f
    private var isDraggingToNavigate = false
    private var dragNavigateFired = false
    private val snapThresholdRatio = 0.50f
    private val flingVelocityThreshold = 600f

    // Zoomed edge-overscroll
    private var edgeOverscroll = 0f
    private var edgeSwipeFired = false
    private val edgeSwipeThreshold = context.resources.displayMetrics.density * 70f

    // Custom view that renders all three panels
    private val canvasView = object : View(context) {
        override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
            super.onSizeChanged(w, h, oldw, oldh)
            viewW = w
            viewH = h
            if (currentBitmap != null) resetMatrix()
        }

        override fun onDraw(canvas: Canvas) {
            super.onDraw(canvas)
            val vw = viewW.takeIf { it > 0 } ?: return

            // Draw prev image (offset one screen width to the left + drag)
            if (dragOffsetX > 0 && prevBitmap != null) {
                canvas.save()
                canvas.translate(-vw + dragOffsetX, 0f)
                drawBitmapFit(canvas, prevBitmap!!)
                canvas.restore()
            }

            // Draw next image (offset one screen width to the right + drag)
            if (dragOffsetX < 0 && nextBitmap != null) {
                canvas.save()
                canvas.translate(vw + dragOffsetX, 0f)
                drawBitmapFit(canvas, nextBitmap!!)
                canvas.restore()
            }

            // Draw current image with its pan/zoom matrix
            canvas.save()
            canvas.translate(dragOffsetX, 0f)
            val bmp = currentBitmap
            if (bmp != null) {
                canvas.drawBitmap(bmp, currentMatrix, null)
            }
            canvas.restore()
        }

        private fun drawBitmapFit(canvas: Canvas, bmp: Bitmap) {
            val vw = viewW.takeIf { it > 0 } ?: screenW
            val vh = viewH.takeIf { it > 0 } ?: screenH
            val scale = min(vw.toFloat() / bmp.width, vh.toFloat() / bmp.height)
            val dx = (vw - bmp.width * scale) / 2f
            val dy = (vh - bmp.height * scale) / 2f
            val m = Matrix()
            m.setScale(scale, scale)
            m.postTranslate(dx, dy)
            canvas.drawBitmap(bmp, m, null)
        }
    }.apply {
        setBackgroundColor(android.graphics.Color.BLACK)
    }

    private val scaleDetector = ScaleGestureDetector(context,
        object : ScaleGestureDetector.SimpleOnScaleGestureListener() {
            override fun onScale(detector: ScaleGestureDetector): Boolean {
                val newScale = (currentScale * detector.scaleFactor).coerceIn(fitScale, maxScale)
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

            override fun onSingleTapConfirmed(e: MotionEvent): Boolean {
                onTap(mapOf<String, Any>())
                return true
            }

            override fun onDoubleTap(e: MotionEvent): Boolean {
                val isZoomedIn = currentScale > fitScale + 0.1f
                val targetScale = if (isZoomedIn) fitScale else doubleTapScale
                val factor = targetScale / currentScale
                currentScale = targetScale
                currentMatrix.postScale(factor, factor, e.x, e.y)
                if (isZoomedIn) resetMatrix() else clampMatrix()
                canvasView.invalidate()
                return true
            }

            override fun onScroll(
                e1: MotionEvent?, e2: MotionEvent,
                distanceX: Float, distanceY: Float
            ): Boolean {
                if (currentScale > fitScale + 0.01f) {
                    // Zoomed: pan with edge-overscroll navigation
                    val (hasOverflow, atLeftBound, atRightBound) = horizontalEdge()
                    val draggingPastLeft = hasOverflow && atLeftBound && distanceX > 0f
                    val draggingPastRight = hasOverflow && atRightBound && distanceX < 0f
                    if (draggingPastLeft || draggingPastRight) {
                        edgeOverscroll += abs(distanceX)
                        if (!edgeSwipeFired && edgeOverscroll > edgeSwipeThreshold) {
                            edgeSwipeFired = true
                            if (draggingPastLeft) onSwipeNext(mapOf<String, Any>())
                            else onSwipePrevious(mapOf<String, Any>())
                        }
                        currentMatrix.postTranslate(0f, -distanceY)
                        clampMatrix()
                        canvasView.invalidate()
                        return true
                    }
                    edgeOverscroll = 0f
                    currentMatrix.postTranslate(-distanceX, -distanceY)
                    clampMatrix()
                    canvasView.invalidate()
                    return true
                }

                // Fit scale: drag-to-navigate
                val isHorizontalDrag = e1 != null &&
                    abs(e2.x - e1.x) > abs(e2.y - e1.y) * 1.2f

                if (isHorizontalDrag || isDraggingToNavigate) {
                    isDraggingToNavigate = true
                    dragOffsetX -= distanceX
                    canvasView.invalidate()
                    return true
                }

                return true
            }

            override fun onFling(
                e1: MotionEvent?, e2: MotionEvent,
                velocityX: Float, velocityY: Float
            ): Boolean {
                if (currentScale > fitScale + 0.01f) {
                    val (hasOverflow, atLeftBound, atRightBound) = horizontalEdge()
                    val isHorizontalFling = abs(velocityX) > abs(velocityY) * 1.5f &&
                        abs(velocityX) > flingVelocityThreshold
                    if (hasOverflow && isHorizontalFling && atLeftBound && velocityX < 0f) {
                        if (!edgeSwipeFired) onSwipeNext(mapOf<String, Any>())
                        return true
                    }
                    if (hasOverflow && isHorizontalFling && atRightBound && velocityX > 0f) {
                        if (!edgeSwipeFired) onSwipePrevious(mapOf<String, Any>())
                        return true
                    }
                    currentMatrix.postTranslate(velocityX * 0.1f, velocityY * 0.1f)
                    clampMatrix()
                    canvasView.invalidate()
                    return true
                }

                // Fit scale fling — velocity override
                val isHorizontalFling = abs(velocityX) > abs(velocityY) * 1.5f &&
                    abs(velocityX) > flingVelocityThreshold
                if (isHorizontalFling && !dragNavigateFired) {
                    dragNavigateFired = true
                    isDraggingToNavigate = false
                    dragOffsetX = 0f
                    canvasView.invalidate()
                    if (velocityX < 0) onSwipeNext(mapOf<String, Any>())
                    else onSwipePrevious(mapOf<String, Any>())
                }
                return true
            }
        }
    )

    init {
        setBackgroundColor(android.graphics.Color.BLACK)
        addView(canvasView, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))

        canvasView.setOnTouchListener { _, event ->
            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    edgeOverscroll = 0f
                    edgeSwipeFired = false
                    isDraggingToNavigate = false
                    dragNavigateFired = false
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    if (isDraggingToNavigate && !dragNavigateFired) {
                        val vw = viewW.takeIf { it > 0 } ?: screenW
                        val snapThreshold = vw * snapThresholdRatio
                        when {
                            dragOffsetX < -snapThreshold -> {
                                dragNavigateFired = true
                                isDraggingToNavigate = false
                                dragOffsetX = 0f
                                canvasView.invalidate()
                                onSwipeNext(mapOf<String, Any>())
                            }
                            dragOffsetX > snapThreshold -> {
                                dragNavigateFired = true
                                isDraggingToNavigate = false
                                dragOffsetX = 0f
                                canvasView.invalidate()
                                onSwipePrevious(mapOf<String, Any>())
                            }
                            else -> {
                                // Spring back instantly
                                isDraggingToNavigate = false
                                dragOffsetX = 0f
                                canvasView.invalidate()
                            }
                        }
                    }
                }
            }
            scaleDetector.onTouchEvent(event)
            gestureDetector.onTouchEvent(event)
            true
        }
    }

    fun setUri(uri: String) {
        if (uri == currentUri) return
        currentUri = uri
        dragOffsetX = 0f
        isDraggingToNavigate = false
        dragNavigateFired = false
        loadBitmap(uri) { bmp ->
            recycleBitmap(currentBitmap)
            currentBitmap = bmp
            canvasView.setImageBitmapAndReset(bmp)
        }
    }

    fun setPrevUri(uri: String) {
        if (uri == prevUri) return
        prevUri = uri.ifEmpty { null }
        if (prevUri == null) {
            recycleBitmap(prevBitmap)
            prevBitmap = null
            return
        }
        loadBitmap(uri) { bmp ->
            recycleBitmap(prevBitmap)
            prevBitmap = bmp
        }
    }

    fun setNextUri(uri: String) {
        if (uri == nextUri) return
        nextUri = uri.ifEmpty { null }
        if (nextUri == null) {
            recycleBitmap(nextBitmap)
            nextBitmap = null
            return
        }
        loadBitmap(uri) { bmp ->
            recycleBitmap(nextBitmap)
            nextBitmap = bmp
        }
    }

    private fun View.setImageBitmapAndReset(bmp: Bitmap?) {
        if (viewW > 0 && viewH > 0 && bmp != null) resetMatrix()
        invalidate()
    }

    private fun loadBitmap(uri: String, onLoaded: (Bitmap?) -> Unit) {
        executor.execute {
            val path = try {
                java.net.URLDecoder.decode(uri.removePrefix("file://"), "UTF-8")
            } catch (e: Exception) {
                uri.removePrefix("file://")
            }
            val bmp = decodeSafe(path)
            mainHandler.post { onLoaded(bmp) }
        }
    }

    private fun decodeSafe(path: String): Bitmap? {
        return try {
            val opts = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeFile(path, opts)

            var sampleSize = 1
            var w = opts.outWidth
            var h = opts.outHeight
            while (w > screenW * 2 || h > screenH * 2) {
                sampleSize *= 2; w /= 2; h /= 2
            }

            val decoded = BitmapFactory.Options().apply {
                inSampleSize = sampleSize
                inPreferredConfig = Bitmap.Config.RGB_565
            }.let { BitmapFactory.decodeFile(path, it) } ?: return null

            val exif = ExifInterface(path)
            val degrees = when (exif.getAttributeInt(
                ExifInterface.TAG_ORIENTATION,
                ExifInterface.ORIENTATION_NORMAL
            )) {
                ExifInterface.ORIENTATION_ROTATE_90  -> 90f
                ExifInterface.ORIENTATION_ROTATE_180 -> 180f
                ExifInterface.ORIENTATION_ROTATE_270 -> 270f
                else -> 0f
            }
            if (degrees == 0f) decoded else {
                val m = Matrix().apply { postRotate(degrees) }
                val rotated = Bitmap.createBitmap(decoded, 0, 0, decoded.width, decoded.height, m, true)
                decoded.recycle()
                rotated
            }
        } catch (oom: OutOfMemoryError) { null }
        catch (e: Exception) { null }
    }

    private fun resetMatrix() {
        val bmp = currentBitmap ?: return
        val vw = viewW.takeIf { it > 0 } ?: screenW
        val vh = viewH.takeIf { it > 0 } ?: screenH
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

    private fun horizontalEdge(): Triple<Boolean, Boolean, Boolean> {
        val bmp = currentBitmap ?: return Triple(false, false, false)
        val vw = viewW.takeIf { it > 0 } ?: screenW
        val scaledW = bmp.width * currentScale
        if (scaledW <= vw) return Triple(false, false, false)
        val values = FloatArray(9)
        currentMatrix.getValues(values)
        val transX = values[Matrix.MTRANS_X]
        val atLeftBound = transX <= (vw - scaledW) + 0.5f
        val atRightBound = transX >= -0.5f
        return Triple(true, atLeftBound, atRightBound)
    }

    private fun clampMatrix() {
        val bmp = currentBitmap ?: return
        val vw = viewW.takeIf { it > 0 } ?: screenW
        val vh = viewH.takeIf { it > 0 } ?: screenH
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

    private fun recycleBitmap(bmp: Bitmap?) {
        bmp?.let { if (!it.isRecycled) it.recycle() }
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        executor.shutdownNow()
        recycleBitmap(currentBitmap)
        recycleBitmap(prevBitmap)
        recycleBitmap(nextBitmap)
        currentBitmap = null
        prevBitmap = null
        nextBitmap = null
        currentUri = null
        prevUri = null
        nextUri = null
    }
}
