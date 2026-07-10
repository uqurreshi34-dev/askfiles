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
import android.view.ViewGroup
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import java.io.File
import java.util.concurrent.Executors
import kotlin.math.min

class PdfViewerView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {

    private val onPageCount by EventDispatcher()
    private val onPageChange by EventDispatcher()

    private val mainHandler = Handler(Looper.getMainLooper())
    // PdfRenderer is NOT thread-safe — one page open at a time
    private val executor = Executors.newSingleThreadExecutor()

    private var pdfRenderer: PdfRenderer? = null
    private var pageCount = 0
    private var currentPage = 0

    private val recyclerView: RecyclerView
    private val adapter: PdfPageAdapter

    init {
        adapter = PdfPageAdapter()
        recyclerView = RecyclerView(context).apply {
            layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
            layoutManager = LinearLayoutManager(context, LinearLayoutManager.VERTICAL, false)
            setHasFixedSize(true) // item size no longer depends on late bitmap arrival
            itemAnimator = null
        }
        recyclerView.adapter = adapter
        recyclerView.addOnScrollListener(object : RecyclerView.OnScrollListener() {
            override fun onScrolled(rv: RecyclerView, dx: Int, dy: Int) {
                val lm = rv.layoutManager as LinearLayoutManager
                val visible = lm.findFirstCompletelyVisibleItemPosition()
                    .takeIf { it >= 0 } ?: lm.findFirstVisibleItemPosition()
                if (visible >= 0 && visible != currentPage) {
                    currentPage = visible
                    onPageChange(mapOf("page" to currentPage))
                }
            }
        })
        addView(recyclerView)
    }

    fun loadPdf(uri: String) {
        executor.execute {
            try {
                pdfRenderer?.close()
                currentPage = 0
                val file = File(uri.removePrefix("file://"))
                val fd = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
                val renderer = PdfRenderer(fd)
                pdfRenderer = renderer
                val count = renderer.pageCount
                pageCount = count

                // Read every page's real dimensions upfront — cheap metadata read,
                // no bitmap decode. This lets RecyclerView know each item's final
                // height BEFORE it ever binds, so there's no late requestLayout()
                // race once bitmaps arrive asynchronously.
                val sizes = ArrayList<Pair<Int, Int>>(count)
                for (i in 0 until count) {
                    val page = renderer.openPage(i)
                    sizes.add(Pair(page.width, page.height))
                    page.close()
                }

                mainHandler.post {
                    adapter.recycleBitmaps()
                    adapter.setPageData(count, sizes)
                    onPageCount(mapOf("count" to count, "page" to 0))
                }
            } catch (e: Exception) {
                android.util.Log.e("PdfViewer", "LOAD FAILED: ${e.javaClass.simpleName} - ${e.message}", e)
            }
        }
    }

    fun goToPage(page: Int) {
        if (page < 0 || page >= pageCount) return
        currentPage = page
        recyclerView.scrollToPosition(page)
    }

    fun renderPage(pageIndex: Int, callback: (Bitmap?) -> Unit) {
        executor.execute {
            val renderer = pdfRenderer ?: run { mainHandler.post { callback(null) }; return@execute }
            if (pageIndex < 0 || pageIndex >= renderer.pageCount) {
                mainHandler.post { callback(null) }
                return@execute
            }
            try {
                val page = renderer.openPage(pageIndex)
                val screenW = context.resources.displayMetrics.widthPixels
                val screenH = context.resources.displayMetrics.heightPixels
                val scaleX = screenW.toFloat() / page.width
                val scaleY = screenH.toFloat() / page.height
                val scale = minOf(scaleX, scaleY, 3f)
                val width = (page.width * scale).toInt().coerceAtLeast(1)
                val height = (page.height * scale).toInt().coerceAtLeast(1)
                val bitmap = try {
                    Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
                } catch (oom: OutOfMemoryError) {
                    page.close()
                    mainHandler.post { callback(null) }
                    return@execute
                }
                val canvas = Canvas(bitmap)
                canvas.drawColor(Color.WHITE)
                page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                page.close()
                mainHandler.post { callback(bitmap) }
            } catch (e: Exception) {
                mainHandler.post { callback(null) }
            }
        }
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        executor.execute {
            pdfRenderer?.close()
            pdfRenderer = null
        }
        adapter.recycleBitmaps()
    }

    // ── Adapter ──────────────────────────────────────────────────────────────

    inner class PdfPageAdapter : RecyclerView.Adapter<PdfPageAdapter.PageViewHolder>() {

        private var count = 0
        private var pageSizes: List<Pair<Int, Int>> = emptyList()
        private val bitmapCache = LinkedHashMap<Int, Bitmap?>(5, 0.75f, true)
        private val MAX_CACHED = 3
        private val boundPositions = HashSet<Int>() // positions currently attached to a live holder

        fun setPageData(n: Int, sizes: List<Pair<Int, Int>>) {
            count = n
            pageSizes = sizes
            notifyDataSetChanged()
        }

        fun recycleBitmaps() {
            bitmapCache.values.forEach { it?.recycle() }
            bitmapCache.clear()
            boundPositions.clear()
        }
        override fun getItemCount() = count

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): PageViewHolder {
            val pageView = PdfPageView(parent.context)
            pageView.layoutParams = RecyclerView.LayoutParams(
                RecyclerView.LayoutParams.MATCH_PARENT,
                RecyclerView.LayoutParams.WRAP_CONTENT
            )
            return PageViewHolder(pageView)
        }

        override fun onBindViewHolder(holder: PageViewHolder, position: Int) {
            holder.boundPosition = position
            boundPositions.add(position)

            // Set the real page size FIRST, synchronously, before touching bitmaps.
            // This is what onMeasure uses — RecyclerView gets a correct height on
            // the very first layout pass, no waiting on async render.
            pageSizes.getOrNull(position)?.let { (w, h) ->
                holder.pageView.setPageSize(w, h)
            }

            val cached = bitmapCache[position]
            if (cached != null && !cached.isRecycled) {
                holder.pageView.setBitmap(cached)
                return
            }
            holder.pageView.setBitmap(null)
            renderPage(position) { bitmap ->
                if (bitmap == null) return@renderPage
                if (bitmapCache.size >= MAX_CACHED) {
                    // Only evict/recycle an entry that isn't currently bound to a
                    // live holder — recycling a bitmap still being drawn crashes
                    // onDraw. If everything cached is in use, skip eviction this
                    // cycle rather than crash; cache briefly exceeds MAX_CACHED.
                    val victim = bitmapCache.entries.firstOrNull { it.key !in boundPositions }
                    if (victim != null) {
                        victim.value?.recycle()
                        bitmapCache.remove(victim.key)
                    }
                }
                bitmapCache[position] = bitmap
                if (holder.bindingAdapterPosition == position) {
                    holder.pageView.setBitmap(bitmap)
                }
            }
        }

        override fun onViewRecycled(holder: PageViewHolder) {
            boundPositions.remove(holder.boundPosition)
            holder.boundPosition = RecyclerView.NO_POSITION
            holder.pageView.setBitmap(null)
        }

        inner class PageViewHolder(val pageView: PdfPageView) : RecyclerView.ViewHolder(pageView) {
            var boundPosition: Int = RecyclerView.NO_POSITION
        }
    }

    // ── Per-page view with zoom/pan ──────────────────────────────────────────

    inner class PdfPageView(context: Context) : View(context) {

        private var bitmap: Bitmap? = null
        private val matrix = Matrix()
        private var currentScale = 1f
        private var fitScale = 1f
        private val maxScale = 5f
        private val doubleTapScale = 2.5f
        private val screenW = context.resources.displayMetrics.widthPixels

        // Real PDF page dimensions (in PDF points) — known upfront, independent
        // of whether a bitmap has rendered yet. Drives onMeasure directly.
        private var pageWidth = 0
        private var pageHeight = 0

        private val scaleDetector = ScaleGestureDetector(context,
            object : ScaleGestureDetector.SimpleOnScaleGestureListener() {
                override fun onScale(detector: ScaleGestureDetector): Boolean {
                    val newScale = (currentScale * detector.scaleFactor).coerceIn(fitScale * 0.9f, maxScale)
                    val factor = newScale / currentScale
                    currentScale = newScale
                    matrix.postScale(factor, factor, detector.focusX, detector.focusY)
                    clampMatrix()
                    invalidate()
                    return true
                }
            }
        )

        private val gestureDetector = GestureDetector(context,
            object : GestureDetector.SimpleOnGestureListener() {
                override fun onDoubleTap(e: MotionEvent): Boolean {
                    if (currentScale > fitScale + 0.1f) {
                        resetMatrix()
                    } else {
                        val factor = doubleTapScale / currentScale
                        currentScale = doubleTapScale
                        matrix.postScale(factor, factor, e.x, e.y)
                        clampMatrix()
                        invalidate()
                    }
                    return true
                }

                override fun onScroll(
                    e1: MotionEvent?, e2: MotionEvent,
                    distanceX: Float, distanceY: Float
                ): Boolean {
                    if (currentScale > fitScale + 0.05f) {
                        matrix.postTranslate(-distanceX, -distanceY)
                        clampMatrix()
                        invalidate()
                        return true
                    }
                    return false
                }
            }
        )

        init {
            setBackgroundColor(Color.WHITE)
            setOnTouchListener { _, event ->
                scaleDetector.onTouchEvent(event)
                gestureDetector.onTouchEvent(event)
                // Only consume the touch (block RecyclerView's own scroll) while
                // actually zoomed in. At fit-scale, let RecyclerView handle scroll.
                currentScale > fitScale + 0.05f
            }
        }

        /** Called once at bind time, before any bitmap exists. Fixes this item's
         *  final height immediately so RecyclerView never has to re-measure later. */
        fun setPageSize(w: Int, h: Int) {
            if (w <= 0 || h <= 0 || (pageWidth == w && pageHeight == h)) return
            pageWidth = w
            pageHeight = h
            requestLayout()
        }

        fun setBitmap(bmp: Bitmap?) {
            bitmap = bmp
            if (bmp != null) resetMatrix()
            invalidate()
        }

        override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
            val w = View.MeasureSpec.getSize(widthMeasureSpec).takeIf { it > 0 } ?: screenW
            val height = if (pageWidth > 0 && pageHeight > 0) {
                (pageHeight.toFloat() / pageWidth * w).toInt()
            } else {
                // Fallback only hit if setPageSize hasn't been called yet — A4-ish ratio
                (w * 1.414f).toInt()
            }
            setMeasuredDimension(w, height.coerceAtLeast(1))
        }

        override fun onDraw(canvas: Canvas) {
            super.onDraw(canvas)
            val bmp = bitmap ?: return
            canvas.drawColor(Color.WHITE)
            canvas.drawBitmap(bmp, matrix, null)
        }

        private fun resetMatrix() {
            val bmp = bitmap ?: return
            val vw = width.takeIf { it > 0 } ?: screenW
            val vh = height.takeIf { it > 0 } ?: return
            val scale = min(vw.toFloat() / bmp.width, vh.toFloat() / bmp.height)
            val dx = (vw - bmp.width * scale) / 2f
            val dy = (vh - bmp.height * scale) / 2f
            matrix.reset()
            matrix.setScale(scale, scale)
            matrix.postTranslate(dx, dy)
            currentScale = scale
            fitScale = scale
            invalidate()
        }

        private fun clampMatrix() {
            val bmp = bitmap ?: return
            val vw = width.takeIf { it > 0 } ?: return
            val vh = height.takeIf { it > 0 } ?: return
            val values = FloatArray(9)
            matrix.getValues(values)
            val transX = values[Matrix.MTRANS_X]
            val transY = values[Matrix.MTRANS_Y]
            val scaledW = bmp.width * currentScale
            val scaledH = bmp.height * currentScale
            var dx = 0f
            var dy = 0f
            if (scaledW <= vw) dx = (vw - scaledW) / 2f - transX
            else {
                if (transX > 0f) dx = -transX
                else if (transX + scaledW < vw) dx = vw - transX - scaledW
            }
            if (scaledH <= vh) dy = (vh - scaledH) / 2f - transY
            else {
                if (transY > 0f) dy = -transY
                else if (transY + scaledH < vh) dy = vh - transY - scaledH
            }
            if (dx != 0f || dy != 0f) matrix.postTranslate(dx, dy)
        }
    }
}
