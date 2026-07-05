package expo.modules.mediaviewer

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.os.Handler
import android.os.Looper
import android.view.GestureDetector
import android.view.MotionEvent
import android.view.ScaleGestureDetector
import android.widget.ImageView
import androidx.appcompat.widget.AppCompatImageView
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
    private val executor = Executors.newSingleThreadExecutor()

    private var currentUri: String? = null
    private var currentBitmap: Bitmap? = null

    private val screenW = context.resources.displayMetrics.widthPixels
    private val screenH = context.resources.displayMetrics.heightPixels

    private var viewW = 0
    private var viewH = 0

    private val matrix = Matrix()

    private var currentScale = 1f
    private var fitScale = 1f
    private val maxScale = 5f
    private val doubleTapScale = 2.5f

    // Drag-to-navigate state (fit scale only)
    private var dragOffsetX = 0f           // how far the image has been dragged horizontally
    private var isDraggingToNavigate = false
    private var dragNavigateFired = false
    private var springBackAnimator: ValueAnimator? = null

    // Fling threshold
    private val flingVelocityThreshold = 600f

    // Snap threshold — 50% of view width
    private val snapThresholdRatio = 0.50f

    // Zoomed edge-overscroll state
    private var edgeOverscroll = 0f
    private var edgeSwipeFired = false
    private val edgeSwipeThreshold = context.resources.displayMetrics.density * 70f

    private val imageView = object : AppCompatImageView(context) {
        override fun setFrame(l: Int, t: Int, r: Int, b: Int): Boolean {
            val changed = super.setFrame(l, t, r, b)
            val w = r - l
            val h = b - t
            if (w > 0 && h > 0) {
                viewW = w
                viewH = h
                if (currentBitmap != null) resetMatrix()
            }
            return changed
        }
    }.apply {
        scaleType = ImageView.ScaleType.MATRIX
        setBackgroundColor(android.graphics.Color.BLACK)
    }

    private val scaleDetector = ScaleGestureDetector(context,
        object : ScaleGestureDetector.SimpleOnScaleGestureListener() {
            override fun onScale(detector: ScaleGestureDetector): Boolean {
                val newScale = (currentScale * detector.scaleFactor).coerceIn(fitScale, maxScale)
                val actualFactor = newScale / currentScale
                currentScale = newScale
                matrix.postScale(actualFactor, actualFactor, detector.focusX, detector.focusY)
                clampMatrix()
                imageView.imageMatrix = matrix
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
                matrix.postScale(factor, factor, e.x, e.y)
                if (isZoomedIn) resetMatrix() else clampMatrix()
                imageView.imageMatrix = matrix
                return true
            }

            override fun onScroll(
                e1: MotionEvent?, e2: MotionEvent,
                distanceX: Float, distanceY: Float
            ): Boolean {
                if (currentScale > fitScale + 0.01f) {
                    // --- Zoomed: pan image, edge-overscroll to navigate ---
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
                        matrix.postTranslate(0f, -distanceY)
                        clampMatrix()
                        imageView.imageMatrix = matrix
                        return true
                    }
                    edgeOverscroll = 0f
                    matrix.postTranslate(-distanceX, -distanceY)
                    clampMatrix()
                    imageView.imageMatrix = matrix
                    return true
                }

                // --- Fit scale: drag-to-navigate ---
                val isHorizontalDrag = e1 != null &&
                    abs(e2.x - e1.x) > abs(e2.y - e1.y) * 1.2f

                if (isHorizontalDrag || isDraggingToNavigate) {
                    isDraggingToNavigate = true
                    springBackAnimator?.cancel()
                    dragOffsetX -= distanceX
                    applyDragOffset(dragOffsetX)
                    return true
                }

                return true
            }

            override fun onFling(
                e1: MotionEvent?, e2: MotionEvent,
                velocityX: Float, velocityY: Float
            ): Boolean {
                if (currentScale > fitScale + 0.01f) {
                    // Zoomed fling
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
                    matrix.postTranslate(velocityX * 0.1f, velocityY * 0.1f)
                    clampMatrix()
                    imageView.imageMatrix = matrix
                    return true
                }

                // Fit scale fling — velocity override, always navigates
                val isHorizontalFling = abs(velocityX) > abs(velocityY) * 1.5f &&
                    abs(velocityX) > flingVelocityThreshold
                if (isHorizontalFling && !dragNavigateFired) {
                    dragNavigateFired = true
                    isDraggingToNavigate = false
                    dragOffsetX = 0f
                    applyDragOffset(0f)
                    if (velocityX < 0) onSwipeNext(mapOf<String, Any>())
                    else onSwipePrevious(mapOf<String, Any>())
                }
                return true
            }
        }
    )

    init {
        setBackgroundColor(android.graphics.Color.BLACK)
        addView(imageView, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))

        imageView.setOnTouchListener { _, event ->
            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    springBackAnimator?.cancel()
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
                                // Dragged left past threshold → next
                                dragNavigateFired = true
                                isDraggingToNavigate = false
                                dragOffsetX = 0f
                                applyDragOffset(0f)
                                onSwipeNext(mapOf<String, Any>())
                            }
                            dragOffsetX > snapThreshold -> {
                                // Dragged right past threshold → previous
                                dragNavigateFired = true
                                isDraggingToNavigate = false
                                dragOffsetX = 0f
                                applyDragOffset(0f)
                                onSwipePrevious(mapOf<String, Any>())
                            }
                            else -> {
                                // Below threshold — spring back instantly
                                isDraggingToNavigate = false
                                dragOffsetX = 0f
                                applyDragOffset(0f)
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

    // Translate image horizontally by offset — gives the drag-peek effect
    private fun applyDragOffset(offsetX: Float) {
        val bmp = currentBitmap ?: return
        val vw = viewW.takeIf { it > 0 } ?: screenW
        val vh = viewH.takeIf { it > 0 } ?: screenH
        val scale = fitScale
        val dx = (vw - bmp.width * scale) / 2f + offsetX
        val dy = (vh - bmp.height * scale) / 2f
        matrix.reset()
        matrix.setScale(scale, scale)
        matrix.postTranslate(dx, dy)
        imageView.imageMatrix = matrix
    }

    fun setUri(uri: String) {
        if (uri == currentUri) return
        currentUri = uri
        dragOffsetX = 0f
        isDraggingToNavigate = false
        dragNavigateFired = false
        springBackAnimator?.cancel()
        loadImage(uri)
    }

    private fun loadImage(uri: String) {
        executor.execute {
            val path = try {
                java.net.URLDecoder.decode(uri.removePrefix("file://"), "UTF-8")
            } catch (e: Exception) {
                uri.removePrefix("file://")
            }
            val bitmap = decodeSafe(path)
            mainHandler.post {
                if (uri != currentUri) { bitmap?.recycle(); return@post }
                recycleCurrent()
                currentBitmap = bitmap
                imageView.setImageBitmap(bitmap)
                if (viewW > 0 && viewH > 0) resetMatrix()
            }
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
        } catch (oom: OutOfMemoryError) { recycleCurrent(); null }
        catch (e: Exception) { null }
    }

    private fun resetMatrix() {
        val bmp = currentBitmap ?: return
        val vw = viewW.takeIf { it > 0 } ?: screenW
        val vh = viewH.takeIf { it > 0 } ?: screenH
        val scale = min(vw.toFloat() / bmp.width, vh.toFloat() / bmp.height)
        val dx = (vw - bmp.width * scale) / 2f
        val dy = (vh - bmp.height * scale) / 2f
        matrix.reset()
        matrix.setScale(scale, scale)
        matrix.postTranslate(dx, dy)
        currentScale = scale
        fitScale = scale
        imageView.imageMatrix = matrix
    }

    private fun horizontalEdge(): Triple<Boolean, Boolean, Boolean> {
        val bmp = currentBitmap ?: return Triple(false, false, false)
        val vw = viewW.takeIf { it > 0 } ?: screenW
        val scaledW = bmp.width * currentScale
        if (scaledW <= vw) return Triple(false, false, false)
        val values = FloatArray(9)
        matrix.getValues(values)
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
        matrix.getValues(values)
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

        if (dx != 0f || dy != 0f) matrix.postTranslate(dx, dy)
    }

    private fun recycleCurrent() {
        currentBitmap?.let { if (!it.isRecycled) it.recycle() }
        currentBitmap = null
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        springBackAnimator?.cancel()
        executor.shutdownNow()
        imageView.setImageBitmap(null)
        recycleCurrent()
        currentUri = null
    }
}
