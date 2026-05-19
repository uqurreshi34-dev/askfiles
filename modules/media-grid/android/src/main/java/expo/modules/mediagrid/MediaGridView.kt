package expo.modules.mediagrid

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.media.ThumbnailUtils
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.ProgressBar
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.RecyclerView
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import java.util.concurrent.Executors
import android.os.Build
import java.io.File

class MediaGridView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {

    private var thumbSizeDp = 110
    private val onItemPress by EventDispatcher()
    private val onItemLongPress by EventDispatcher()

    private val recyclerView = RecyclerView(context)
    private var adapter = MediaGridAdapter()
    private var layoutManager = object : GridLayoutManager(context, 3) {
        override fun checkLayoutParams(lp: RecyclerView.LayoutParams?): Boolean {
            val thumbPx = (thumbSizeDp * context.resources.displayMetrics.density).toInt()
            lp?.width = thumbPx
            lp?.height = thumbPx
            return true
        }
    }
    private val mainHandler = Handler(Looper.getMainLooper())
    private val executor = Executors.newFixedThreadPool(4)

    init {
        recyclerView.layoutParams = LayoutParams(
            LayoutParams.MATCH_PARENT,
            LayoutParams.MATCH_PARENT
        )
        recyclerView.layoutManager = layoutManager
        recyclerView.adapter = adapter
        recyclerView.setHasFixedSize(false)
        recyclerView.addItemDecoration(object : RecyclerView.ItemDecoration() {
            override fun getItemOffsets(
                outRect: android.graphics.Rect,
                view: View,
                parent: RecyclerView,
                state: RecyclerView.State
            ) {
                val spacing = (2 * context.resources.displayMetrics.density).toInt()
                outRect.set(spacing, spacing, spacing, spacing)
            }
        })
        addView(recyclerView)

        adapter.onItemClick = { uri, index ->
            onItemPress(mapOf("uri" to uri, "index" to index))
        }
        adapter.onItemLongClick = { uri, index ->
            onItemLongPress(mapOf("uri" to uri, "index" to index))
        }
        adapter.executor = executor
        adapter.mainHandler = mainHandler
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        if (w != oldw && w > 0) {
            val thumbPx = (thumbSizeDp * context.resources.displayMetrics.density).toInt()
            val cols = maxOf(2, w / thumbPx)
            layoutManager.spanCount = cols
            adapter.notifyDataSetChanged()
        }
    }

    fun setUris(uris: List<String>) {
        adapter.setUris(uris)
    }

    fun setNumColumns(numColumns: Int) {
        if (layoutManager.spanCount != numColumns) {
            layoutManager.spanCount = numColumns
            requestLayout()
            adapter.notifyDataSetChanged()
        }
    }

    fun setSelectedUris(selectedUris: Set<String>) {
        adapter.setSelectedUris(selectedUris)
    }

    fun setSelectMode(selectMode: Boolean) {
        adapter.setSelectMode(selectMode)
    }

    fun setCategory(category: String) {
        adapter.setCategory(category)
    }

    fun setOpeningUri(openingUri: String) {
        adapter.setOpeningUri(openingUri)
    }

    // ── Adapter ──────────────────────────────────────────────────────────────

    inner class MediaGridAdapter : RecyclerView.Adapter<MediaGridAdapter.GridViewHolder>() {

        private var uris: List<String> = emptyList()
        private var selectedUris: Set<String> = emptySet()
        private var selectMode: Boolean = false
        private var category: String = "images"
        private var openingUri: String = ""

        var onItemClick: ((String, Int) -> Unit)? = null
        var onItemLongClick: ((String, Int) -> Unit)? = null
        var executor: java.util.concurrent.ExecutorService? = null
        var mainHandler: Handler? = null

        // Thumbnail cache
        private val cache = java.util.Collections.synchronizedMap(
            object : java.util.LinkedHashMap<String, Bitmap>(64, 0.75f, true) {
                override fun removeEldestEntry(eldest: Map.Entry<String, Bitmap>): Boolean {
                    return size > 150
                }
            }
        )

        fun setUris(newUris: List<String>) {
            uris = newUris
            notifyDataSetChanged()
        }

        fun setSelectedUris(newSelected: Set<String>) {
            val old = selectedUris
            selectedUris = newSelected
            val changed = mutableListOf<Int>()
            uris.forEachIndexed { index, uri ->
                if (old.contains(uri) != newSelected.contains(uri)) {
                    changed.add(index)
                }
            }
            mainHandler?.post {
                changed.forEach { index -> 
                recyclerView.findViewHolderForAdapterPosition(index)?.let { holder ->
                    (holder as? GridViewHolder)?.updateSelection(selectedUris.contains(uris[index]))
                }
              }
            }
        }

        fun setSelectMode(newSelectMode: Boolean) {
            if (selectMode != newSelectMode) {
                selectMode = newSelectMode
                notifyDataSetChanged()
            }
        }

        fun setCategory(newCategory: String) {
            category = newCategory
        }

        fun setOpeningUri(uri: String) {
            val oldUri = openingUri
            openingUri = uri
            val oldIndex = uris.indexOf(oldUri)
            val newIndex = uris.indexOf(uri)
            if (oldIndex >= 0) notifyItemChanged(oldIndex)
            if (newIndex >= 0) notifyItemChanged(newIndex)
        }

        override fun getItemCount() = uris.size

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): GridViewHolder {
            val container = FrameLayout(parent.context).apply {
                layoutParams = ViewGroup.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT
                )
            }
            return GridViewHolder(container)
        }

        override fun onBindViewHolder(holder: GridViewHolder, position: Int) {
            val uri = uris[position]
            val isSelected = selectedUris.contains(uri)
            val isOpening = openingUri == uri
            holder.bind(uri, isSelected, isOpening, category, selectMode)
        }

        override fun onBindViewHolder(holder: GridViewHolder, position: Int, payloads: List<Any>) {
            if (payloads.contains("selection")) {
                // Only update selection state — don't reload thumbnail
                holder.updateSelection(selectedUris.contains(uris[position]))
            } else {
                onBindViewHolder(holder, position)
            }
        }

        inner class GridViewHolder(private val container: FrameLayout) :
            RecyclerView.ViewHolder(container) {

            private val imageView = ImageView(container.context).apply {
                layoutParams = FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.MATCH_PARENT,
                    FrameLayout.LayoutParams.MATCH_PARENT
                )
                scaleType = ImageView.ScaleType.CENTER_CROP
            }

            private val overlay = View(container.context).apply {
                layoutParams = FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.MATCH_PARENT,
                    FrameLayout.LayoutParams.MATCH_PARENT
                )
                visibility = View.GONE
            }

            private val checkView = ImageView(container.context).apply {
                val size = dpToPx(24)
                val margin = dpToPx(4)
                layoutParams = FrameLayout.LayoutParams(size, size).apply {
                    gravity = android.view.Gravity.TOP or android.view.Gravity.END
                    setMargins(0, margin, margin, 0)
                }
                setImageResource(android.R.drawable.checkbox_on_background)
                visibility = View.INVISIBLE
            }

            private val playIcon = ImageView(container.context).apply {
                val size = dpToPx(16)
                val margin = dpToPx(4)
                layoutParams = FrameLayout.LayoutParams(size, size).apply {
                    gravity = android.view.Gravity.BOTTOM or android.view.Gravity.END
                    setMargins(0, 0, margin, margin)
                }
                setImageResource(android.R.drawable.ic_media_play)
                setColorFilter(Color.WHITE)
                visibility = View.GONE
            }

            private val spinner = ProgressBar(container.context).apply {
                val size = dpToPx(20)
                val margin = dpToPx(4)
                layoutParams = FrameLayout.LayoutParams(size, size).apply {
                    gravity = android.view.Gravity.BOTTOM or android.view.Gravity.END
                    setMargins(0, 0, margin, margin)
                }
                visibility = View.GONE
            }

            init {
                container.addView(imageView)
                container.addView(overlay)
                container.addView(checkView)
                container.addView(playIcon)
                container.addView(spinner)
            }

            fun bind(
                uri: String,
                isSelected: Boolean,
                isOpening: Boolean,
                category: String,
                selectMode: Boolean
            ) {
                // Selection overlay
                if (isSelected) {
                    overlay.setBackgroundColor(Color.argb(80, 24, 95, 165))
                    overlay.visibility = View.VISIBLE
                    checkView.visibility = View.VISIBLE
                } else {
                    overlay.visibility = View.GONE
                    checkView.visibility = View.INVISIBLE
                }

                // Border for selected
                if (isSelected) {
                    container.setPadding(dpToPx(3), dpToPx(3), dpToPx(3), dpToPx(3))
                    container.setBackgroundColor(Color.parseColor("#185FA5"))
                } else {
                    container.setPadding(0, 0, 0, 0)
                    container.setBackgroundColor(Color.TRANSPARENT)
                }

                // Play icon / spinner for videos
                if (category == "videos" && !selectMode) {
                    if (isOpening) {
                        playIcon.visibility = View.GONE
                        spinner.visibility = View.VISIBLE
                    } else {
                        playIcon.visibility = View.VISIBLE
                        spinner.visibility = View.GONE
                    }
                } else {
                    playIcon.visibility = View.GONE
                    spinner.visibility = View.GONE
                }

                // Load thumbnail
                imageView.setImageBitmap(null)
                val cached = cache[uri]
                if (cached != null) {
                    imageView.setImageBitmap(cached)
                } else {
                    executor?.execute {
                        val bitmap = loadThumbnail(uri, category)
                        if (bitmap != null) {
                            cache[uri] = bitmap
                            mainHandler?.post {
                                // Only set if view is still showing same URI
                                val currentPos = bindingAdapterPosition
                                if (currentPos != RecyclerView.NO_ID.toInt() &&
                                    currentPos < uris.size &&
                                    uris[currentPos] == uri
                                ) {
                                    imageView.setImageBitmap(bitmap)
                                }
                            }
                        }
                    }
                }

                // Click handlers
                container.setOnClickListener {
                    if (selectMode) {
                        val isNowSelected = !selectedUris.contains(uri)
                        // Update visuals immediately — don't wait for JS round trip
                        updateSelection(isNowSelected)
                        // Update local state so subsequent taps are correct
                        val newSet = selectedUris.toMutableSet()
                        if (isNowSelected) newSet.add(uri) else newSet.remove(uri)
                        selectedUris = newSet
                    }
                    onItemClick?.invoke(uri, bindingAdapterPosition)
                }
                container.setOnLongClickListener {
                    onItemLongClick?.invoke(uri, bindingAdapterPosition)
                    true
                }
            }

            fun updateSelection(isSelected: Boolean) {
                if (isSelected) {
                    overlay.setBackgroundColor(Color.argb(80, 24, 95, 165))
                    overlay.visibility = View.VISIBLE
                    checkView.visibility = View.VISIBLE
                    container.setPadding(dpToPx(3), dpToPx(3), dpToPx(3), dpToPx(3))
                    container.setBackgroundColor(Color.parseColor("#185FA5"))
                } else {
                    overlay.visibility = View.GONE
                    checkView.visibility = View.INVISIBLE
                    container.setPadding(0, 0, 0, 0)
                    container.setBackgroundColor(Color.TRANSPARENT)
                }
                container.requestLayout()
                container.invalidate()
            }

            private fun loadThumbnail(uri: String, category: String): Bitmap? {
                return try {
                    if (category == "videos") {
                        // Use MediaStore to get video thumbnail
                        val path = uri.replace("file://", "")
                            .let { java.net.URLDecoder.decode(it, "UTF-8") }
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                            ThumbnailUtils.createVideoThumbnail(File(path), android.util.Size(512, 512), null)
                        } else {
                            @Suppress("DEPRECATION")
                            ThumbnailUtils.createVideoThumbnail(path, MediaStore.Images.Thumbnails.MINI_KIND)
                        }
                    } else {
                        val path = uri.replace("file://", "")
                            .let { java.net.URLDecoder.decode(it, "UTF-8") }
                        // Decode with sampling
                        val opts = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                        BitmapFactory.decodeFile(path, opts)
                        val thumbSize = 200
                        opts.inSampleSize = calculateInSampleSize(opts, thumbSize, thumbSize)
                        opts.inJustDecodeBounds = false
                        val bitmap = BitmapFactory.decodeFile(path, opts) ?: return null
                        // Read EXIF rotation and apply — fast, just reads header
                        val exif = androidx.exifinterface.media.ExifInterface(path)
                        val degrees = when (exif.getAttributeInt(
                            androidx.exifinterface.media.ExifInterface.TAG_ORIENTATION,
                            androidx.exifinterface.media.ExifInterface.ORIENTATION_NORMAL
                        )) {
                            androidx.exifinterface.media.ExifInterface.ORIENTATION_ROTATE_90 -> 90f
                            androidx.exifinterface.media.ExifInterface.ORIENTATION_ROTATE_180 -> 180f
                            androidx.exifinterface.media.ExifInterface.ORIENTATION_ROTATE_270 -> 270f
                            else -> 0f
                        }
                        if (degrees != 0f) {
                            val matrix = android.graphics.Matrix()
                            matrix.postRotate(degrees)
                            android.graphics.Bitmap.createBitmap(
                                bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true
                            ).also { bitmap.recycle() }
                        } else {
                            bitmap
                        }
                    }
                } catch (e: Exception) {
                    null
                }
            }

            private fun calculateInSampleSize(
                options: BitmapFactory.Options,
                reqWidth: Int,
                reqHeight: Int
            ): Int {
                val height = options.outHeight
                val width = options.outWidth
                var inSampleSize = 1
                if (height > reqHeight || width > reqWidth) {
                    val halfHeight = height / 2
                    val halfWidth = width / 2
                    while (halfHeight / inSampleSize >= reqHeight &&
                        halfWidth / inSampleSize >= reqWidth
                    ) {
                        inSampleSize *= 2
                    }
                }
                return inSampleSize
            }

            private fun dpToPx(dp: Int): Int {
                return (dp * container.context.resources.displayMetrics.density).toInt()
            }
        }
    }
}
