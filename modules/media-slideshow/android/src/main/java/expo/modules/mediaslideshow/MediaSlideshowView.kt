package expo.modules.mediaslideshow

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Handler
import android.os.Looper
import android.widget.FrameLayout
import android.widget.ImageView
import androidx.appcompat.widget.AppCompatImageView
import androidx.exifinterface.media.ExifInterface
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import java.util.concurrent.Executors

class MediaSlideshowView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {

    private val onImagePress by EventDispatcher()

    private val mainHandler = Handler(Looper.getMainLooper())
    // Single-thread executor: only one decode runs at a time,
    // previous task is superseded when index changes rapidly.
    private val executor = Executors.newSingleThreadExecutor()

    private var uris: List<String> = emptyList()
    private var currentIndex: Int = 0
    private var lastLoadedUri: String? = null
    private var currentBitmap: Bitmap? = null

    // Screen size for inSampleSize calculation — never 0, available immediately.
    private val screenW = context.resources.displayMetrics.widthPixels
    private val screenH = context.resources.displayMetrics.heightPixels

    private val imageView = AppCompatImageView(context).apply {
        scaleType = ImageView.ScaleType.FIT_CENTER
        setBackgroundColor(android.graphics.Color.BLACK)
        setOnClickListener { onImagePress(mapOf("index" to currentIndex)) }
    }

    init {
        setBackgroundColor(android.graphics.Color.BLACK)
        addView(imageView, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
    }

    fun setUris(newUris: List<String>) {
        uris = newUris
        // Don't reload if index unchanged and uri unchanged — avoids flicker on re-render
        loadCurrent()
    }

    fun setCurrentIndex(newIndex: Int) {
        if (uris.isEmpty()) return
        currentIndex = newIndex.coerceIn(0, uris.size - 1)
        loadCurrent()
    }

    private fun loadCurrent() {
        if (uris.isEmpty()) {
            imageView.setImageBitmap(null)
            recycleCurrent()
            return
        }
        val uri = uris[currentIndex.coerceIn(0, uris.size - 1)]
        // Skip if already showing this uri
        if (uri == lastLoadedUri) return
        lastLoadedUri = uri

        executor.execute {
            val path = try {
                java.net.URLDecoder.decode(uri.removePrefix("file://"), "UTF-8")
            } catch (e: Exception) {
                uri.removePrefix("file://")
            }

            val bitmap = decodeSafe(path)

            mainHandler.post {
                // Guard: uri may have changed while decode was running
                if (uri != lastLoadedUri) {
                    bitmap?.recycle()
                    return@post
                }
                recycleCurrent()
                currentBitmap = bitmap
                imageView.setImageBitmap(bitmap)
            }
        }
    }

    // OOM-safe decode:
    // 1. Read just the dimensions (inJustDecodeBounds) — no memory allocated.
    // 2. Calculate inSampleSize to fit within screen bounds.
    // 3. Decode with RGB_565 (half the memory of ARGB_8888).
    // 4. Catch OOM explicitly and return null — imageView stays blank rather than crashing.
    private fun decodeSafe(path: String): Bitmap? {
        return try {
            val opts = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeFile(path, opts)

            var sampleSize = 1
            var w = opts.outWidth
            var h = opts.outHeight
            while (w > screenW * 2 || h > screenH * 2) {
                sampleSize *= 2
                w /= 2
                h /= 2
            }

            val decoded = BitmapFactory.Options().apply {
                inSampleSize = sampleSize
                inPreferredConfig = Bitmap.Config.RGB_565
            }.let { decodeOpts ->
                BitmapFactory.decodeFile(path, decodeOpts)
            } ?: return null

            // Read EXIF orientation and rotate if needed
            val exif = ExifInterface(path)
            val orientation = exif.getAttributeInt(
                ExifInterface.TAG_ORIENTATION,
                ExifInterface.ORIENTATION_NORMAL
            )
            val degrees = when (orientation) {
                ExifInterface.ORIENTATION_ROTATE_90  -> 90f
                ExifInterface.ORIENTATION_ROTATE_180 -> 180f
                ExifInterface.ORIENTATION_ROTATE_270 -> 270f
                else -> 0f
            }
            if (degrees == 0f) decoded else {
                val matrix = android.graphics.Matrix().apply { postRotate(degrees) }
                val rotated = Bitmap.createBitmap(decoded, 0, 0, decoded.width, decoded.height, matrix, true)
                decoded.recycle()
                rotated
            }
        } catch (oom: OutOfMemoryError) {
            recycleCurrent()
            null
        } catch (e: Exception) {
            null
        }
    }

    private fun recycleCurrent() {
        currentBitmap?.let {
            if (!it.isRecycled) it.recycle()
        }
        currentBitmap = null
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        // Stop accepting new tasks and interrupt any in-flight decode.
        // shutdownNow() is correct here: any in-progress BitmapFactory.decodeFile
        // will either finish or be interrupted, but we don't need the result.
        executor.shutdownNow()
        // Cleanup runs on the main thread — we're already on it here.
        imageView.setImageBitmap(null)
        recycleCurrent()
        lastLoadedUri = null
    }
}
