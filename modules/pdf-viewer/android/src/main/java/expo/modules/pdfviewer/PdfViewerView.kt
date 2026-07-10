package expo.modules.pdfviewer

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Rect
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
import kotlin.math.roundToInt

class PdfViewerView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {

    private val onPageCount by EventDispatcher()
    private val onPageChange by EventDispatcher()

    private val mainHandler = Handler(Looper.getMainLooper())
    private val executor = Executors.newSingleThreadExecutor()

    private var pdfRenderer: PdfRenderer? = null
    private var pageCount = 0
    private var currentPage = 0

    private val recyclerView: RecyclerView
    private val adapter: PdfPageAdapter

    // ── Zoom state ────────────────────────────────────────────────────────────
    private var currentScale = 1f
    private val minScale = 1f
    private val maxScale = 5f
    private val doubleTapScale = 2.5f

    // pivotX/Y fixed at (0,0). Only translationX is ever set by us — translationY
    // is NEVER touched. Vertical movement while zoomed goes through RecyclerView's
    // own scrollBy(), so pages bind/unbind correctly as you scroll through the doc.

    private val scaleDetector = ScaleGestureDetector(context,
        object : ScaleGestureDetector.SimpleOnScaleGestureListener() {
            override fun onScaleBegin(detector: ScaleGestureDetector): Boolean = true

            override fun onScale(detector: ScaleGestureDetector): Boolean {
                val prevScale = currentScale
                val newScale = (currentScale * detector.scaleFactor).coerceIn(minScale, maxScale)
                if (newScale == prevScale) return true
                currentScale = newScale

                // All coords are screen-space (listener lives on ExpoView, outside
                // the RecyclerView transform). Keep horizontal focus point fixed.
                // Vertical: don't touch translationY — RecyclerView owns that axis.
                val focusX = detector.focusX
                val contentX = (focusX - recyclerView.translationX) / prevScale
                recyclerView.scaleX = newScale
                recyclerView.scaleY = newScale
                recyclerView.translationX = focusX - contentX * newScale
                clampTranslation()
                return true
            }
        }
    )

    private val gestureDetector = GestureDetector(context,
        object : GestureDetector.SimpleOnGestureListener() {
            override fun onDoubleTap(e: MotionEvent): Boolean {
                if (currentScale > 1.05f) {
                    animateResetZoom()
                } else {
                    val prevScale = currentScale
                    currentScale = doubleTapScale
                    val contentX = (e.x - recyclerView.translationX) / prevScale
                    recyclerView.scaleX = currentScale
                    recyclerView.scaleY = currentScale
                    recyclerView.translationX = e.x - contentX * currentScale
                    clampTranslation()
                }
                return true
            }

            override fun onScroll(
                e1: MotionEvent?,
                e2: MotionEvent,
                distanceX: Float,
                distanceY: Float
            ): Boolean {
                if (currentScale <= 1.05f) return false
                // Horizontal: pan via translationX, clamped to content edges
                recyclerView.translationX -= distanceX
                clampTranslation()
                // Vertical: let RecyclerView scroll — pages bind/unbind normally
                recyclerView.scrollBy(0, distanceY.roundToInt())
                return true
            }
        }
    )

    private fun clampTranslation() {
        val vw = width.takeIf { it > 0 } ?: return
        val scaledW = vw * currentScale
        // pivotX = 0, so scaled content spans [0, scaledW].
        // Max right-pan (translationX > 0): 0 — content left edge is already at screen left.
        // Max left-pan (translationX < 0): -(scaledW - vw) — content right edge at screen right.
        val maxTransX = (scaledW - vw).coerceAtLeast(0f)
        recyclerView.translationX = recyclerView.translationX.coerceIn(-maxTransX, 0f)
    }

    private fun animateResetZoom() {
        currentScale = 1f
        recyclerView.animate()
            .scaleX(1f)
            .scaleY(1f)
            .translationX(0f)
            .setDuration(200)
            .start()
        // translationY is never set by us so no need to reset it
    }

    override fun onInterceptTouchEvent(ev: MotionEvent): Boolean {
        return true
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        scaleDetector.onTouchEvent(event)
        gestureDetector.onTouchEvent(event)

        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                recyclerView.dispatchTouchEvent(event)
            }
            MotionEvent.ACTION_MOVE -> {
                if (!scaleDetector.isInProgress) {
                    // At any scale with one finger: dispatch to RecyclerView.
                    // At 1x it scrolls vertically. At >1x, onScroll above also
                    // fires and handles horizontal pan simultaneously.
                    recyclerView.dispatchTouchEvent(event)
                } else {
                    // Active pinch — cancel RecyclerView so it doesn't fight zoom
                    val cancel = MotionEvent.obtain(event).also {
                        it.action = MotionEvent.ACTION_CANCEL
                    }
                    recyclerView.dispatchTouchEvent(cancel)
                    cancel.recycle()
                }
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                recyclerView.dispatchTouchEvent(event)
            }
        }
        return true
    }

    init {
        adapter = PdfPageAdapter()
        recyclerView = RecyclerView(context).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            layoutManager = LinearLayoutManager(context, LinearLayoutManager.VERTICAL, false)
            setHasFixedSize(false)
            itemAnimator = null
            pivotX = 0f
            pivotY = 0f
            isNestedScrollingEnabled = false
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

                // Sample first two pages — most PDFs are uniform size.
                // Scanning all 690 pages before first render causes a
                // visible grey screen delay. If page 0 and 1 match,
                // assume uniform and fill the rest without opening pages.
                val sizes = ArrayList<Pair<Int, Int>>(count)
                val page0 = renderer.openPage(0)
                val w0 = page0.width; val h0 = page0.height
                page0.close()
                sizes.add(Pair(w0, h0))

                val uniform = if (count > 1) {
                    val page1 = renderer.openPage(1)
                    val match = page1.width == w0 && page1.height == h0
                    sizes.add(Pair(page1.width, page1.height))
                    page1.close()
                    match
                } else true

                if (uniform) {
                    // Fill remaining pages with same dimensions — no openPage needed
                    for (i in 2 until count) sizes.add(Pair(w0, h0))
                } else {
                    // Mixed sizes — full scan required
                    for (i in 2 until count) {
                        val page = renderer.openPage(i)
                        sizes.add(Pair(page.width, page.height))
                        page.close()
                    }
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
        mainHandler.post {
            // scrollToPositionWithOffset fails when target page is outside the
            // layout window (childCount is typically 2 on tall screens).
            // scrollBy with precomputed pixel offset bypasses layout window
            // entirely — RecyclerView moves by raw pixels then binds whatever
            // items fall into the new viewport.
            val screenW = context.resources.displayMetrics.widthPixels
            val targetOffset = adapter.getPageOffset(page, screenW)
            val currentOffset = adapter.getPageOffset(
                (recyclerView.layoutManager as LinearLayoutManager)
                    .findFirstVisibleItemPosition().coerceAtLeast(0),
                screenW
            )
            recyclerView.scrollBy(0, targetOffset - currentOffset)
            currentPage = page
            onPageChange(mapOf("page" to page))
        }
    }

    fun renderPage(pageIndex: Int, callback: (Bitmap?) -> Unit) {
        executor.execute {
            val renderer = pdfRenderer ?: run { mainHandler.post { callback(null) }; return@execute }
            if (pageIndex < 0 || pageIndex >= renderer.pageCount) {
                mainHandler.post { callback(null) }
                return@execute
            }
            val page = renderer.openPage(pageIndex)
            try {
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
                    mainHandler.post { callback(null) }
                    return@execute
                }
                val canvas = Canvas(bitmap)
                canvas.drawColor(Color.WHITE)
                page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                mainHandler.post { callback(bitmap) }
            } catch (e: Exception) {
                mainHandler.post { callback(null) }
            } finally {
                page.close()
            }
        }
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        executor.execute {
            pdfRenderer?.close()
            pdfRenderer = null
        }
        executor.shutdown()
        adapter.recycleBitmaps()
    }

    // ── Adapter ──────────────────────────────────────────────────────────────

    inner class PdfPageAdapter : RecyclerView.Adapter<PdfPageAdapter.PageViewHolder>() {

        private var count = 0
        private var pageSizes: List<Pair<Int, Int>> = emptyList()
        private val bitmapCache = LinkedHashMap<Int, Bitmap?>(8, 0.75f, true)
        private val MAX_CACHED = 5
        private val boundPositions = HashSet<Int>()

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

        // Returns the pixel offset of a page using precomputed page sizes —
        // no layout window dependency, works for any page index instantly.
        fun getPageOffset(page: Int, screenW: Int): Int {
            var offset = 0
            for (i in 0 until page.coerceAtMost(pageSizes.size)) {
                val (w, h) = pageSizes[i]
                offset += if (w > 0) (h.toFloat() / w * screenW).toInt() else (screenW * 1.414f).toInt()
            }
            return offset
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

            pageSizes.getOrNull(position)?.let { (w, h) ->
                holder.pageView.setPageSize(w, h)
            }
            holder.pageView.setPageNumber(position + 1)

            val cached = bitmapCache[position]
            if (cached != null && !cached.isRecycled) {
                holder.pageView.setBitmap(cached)
                return
            }
            holder.pageView.setBitmap(null)
            renderPage(position) { bitmap ->
                if (bitmap == null) return@renderPage
                if (bitmapCache.size >= MAX_CACHED) {
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
            prefetch(position + 1)
            prefetch(position - 1)
        }

        private fun prefetch(position: Int) {
            if (position < 0 || position >= count) return
            if (bitmapCache[position]?.isRecycled == false) return
            renderPage(position) { bitmap ->
                if (bitmap == null) return@renderPage
                if (bitmapCache.size >= MAX_CACHED) {
                    val victim = bitmapCache.entries.firstOrNull { it.key !in boundPositions }
                    if (victim != null) {
                        victim.value?.recycle()
                        bitmapCache.remove(victim.key)
                    }
                }
                bitmapCache[position] = bitmap
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

    // ── Per-page view ─────────────────────────────────────────────────────────

    inner class PdfPageView(context: Context) : View(context) {

        private var bitmap: Bitmap? = null
        private val destRect = Rect()
        private var pageWidth = 0
        private var pageHeight = 0
        private var pageNumber = ""

        private val labelBgPaint = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
            color = android.graphics.Color.argb(115, 0, 0, 0)
        }
        private val labelTextPaint = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.WHITE
            textSize = 28f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
        }

        init {
            setBackgroundColor(Color.WHITE)
        }

        fun setPageSize(w: Int, h: Int) {
            if (w <= 0 || h <= 0 || (pageWidth == w && pageHeight == h)) return
            pageWidth = w
            pageHeight = h
            requestLayout()
        }

        fun setBitmap(bmp: Bitmap?) {
            bitmap = bmp
            invalidate()
        }

        fun setPageNumber(number: Int) {
            pageNumber = "$number"
            invalidate()
        }

        override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
            val w = MeasureSpec.getSize(widthMeasureSpec).takeIf { it > 0 }
                ?: context.resources.displayMetrics.widthPixels
            val height = if (pageWidth > 0 && pageHeight > 0) {
                (pageHeight.toFloat() / pageWidth * w).toInt()
            } else {
                (w * 1.414f).toInt()
            }
            setMeasuredDimension(w, height.coerceAtLeast(1))
        }

        override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
            super.onSizeChanged(w, h, oldw, oldh)
            destRect.set(0, 0, w, h)
        }

        override fun onDraw(canvas: Canvas) {
            super.onDraw(canvas)
            val bmp = bitmap ?: return
            if (bmp.isRecycled) return
            canvas.drawColor(Color.WHITE)
            canvas.drawBitmap(bmp, null, destRect, null)

            // Page number pill — bottom right, drawn on top of page content
            if (pageNumber.isNotEmpty()) {
                val textW = labelTextPaint.measureText(pageNumber)
                val padH = 10f
                val padV = 6f
                val radius = 12f
                val right = width.toFloat() - 20f
                val bottom = height.toFloat() - 20f
                val left = right - textW - padH * 2
                val top = bottom - labelTextPaint.textSize - padV * 2
                val rect = android.graphics.RectF(left, top, right, bottom)
                canvas.drawRoundRect(rect, radius, radius, labelBgPaint)
                canvas.drawText(
                    pageNumber,
                    left + padH,
                    bottom - padV - labelTextPaint.descent(),
                    labelTextPaint
                )
            }
        }
    }
}
