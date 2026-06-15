package expo.modules.mediaviewer

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.graphics.PointF
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
import kotlin.math.min

class MediaViewerView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {

    private val onTap by EventDispatcher()

    private val mainHandler = Handler(Looper.getMainLooper())
    private val executor = Executors.newSingleThreadExecutor()

    private var currentUri: String? = null
    private var currentBitmap: Bitmap? = null

    private val screenW = context.resources.displayMetrics.widthPixels
    private val screenH = context.resources.displayMetrics.heightPixels

    // Stored from setFrame on the ImageView — guaranteed real dimensions after layout
    private var viewW = 0
    private var viewH = 0

    private val matrix = Matrix()

    private var currentScale = 1f
    private val minScale = 1f
    private var fitScale = 1f
    private val maxScale = 5f
    private val doubleTapScale = 2.5f

    // Override setFrame on the ImageView itself — fires after every layout pass
    // with guaranteed non-zero dimensions. This is the correct hook for Fabric.
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
                val targetScale = if (currentScale > minScale + 0.1f) minScale else doubleTapScale
                val factor = targetScale / currentScale
                currentScale = targetScale
                matrix.postScale(factor, factor, e.x, e.y)
                if (targetScale == minScale) resetMatrix()
                else clampMatrix()
                imageView.imageMatrix = matrix
                return true
            }

            override fun onScroll(
                e1: MotionEvent?, e2: MotionEvent,
                distanceX: Float, distanceY: Float
            ): Boolean {
                if (currentScale > fitScale + 0.01f) {
                    matrix.postTranslate(-distanceX, -distanceY)
                    clampMatrix()
                    imageView.imageMatrix = matrix
                }
                return true
            }

            override fun onFling(
                e1: MotionEvent?, e2: MotionEvent,
                velocityX: Float, velocityY: Float
            ): Boolean {
                if (currentScale > minScale + 0.01f) {
                    matrix.postTranslate(velocityX * 0.1f, velocityY * 0.1f)
                    clampMatrix()
                    imageView.imageMatrix = matrix
                }
                return true
            }
        }
    )

    init {
        setBackgroundColor(android.graphics.Color.BLACK)
        addView(imageView, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
        imageView.setOnTouchListener { _, event ->
            scaleDetector.onTouchEvent(event)
            gestureDetector.onTouchEvent(event)
            true
        }
    }

    fun setUri(uri: String) {
        if (uri == currentUri) return
        currentUri = uri
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
        executor.shutdownNow()
        imageView.setImageBitmap(null)
        recycleCurrent()
        currentUri = null
    }
}
