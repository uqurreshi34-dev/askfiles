package expo.modules.mediagrid

import android.content.Context
import android.graphics.Color
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.ProgressBar
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.bumptech.glide.Glide
import com.bumptech.glide.load.engine.DiskCacheStrategy
import com.bumptech.glide.request.RequestOptions
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView

class MediaGridView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {

    private var thumbSizeDp = 110
    private val onItemPress by EventDispatcher()
    private val onItemLongPress by EventDispatcher()
    private val onSelectionChange by EventDispatcher()
    private var isActive = true

    private val recyclerView = RecyclerView(context)
    private var adapter = MediaGridAdapter()
    private var layoutManager = object : GridLayoutManager(context, 3) {
        override fun checkLayoutParams(lp: RecyclerView.LayoutParams?): Boolean {
            val thumbPx = (thumbSizeDp * context.resources.displayMetrics.density).toInt()
            lp?.width = thumbPx
            lp?.height = thumbPx
            return true
        }
        override fun scrollVerticallyBy(dy: Int, recycler: RecyclerView.Recycler, state: RecyclerView.State): Int {
            if (!isActive) return 0
            return super.scrollVerticallyBy(dy, recycler, state)
        }
    }

    init {
        recyclerView.layoutParams = LayoutParams(
            LayoutParams.MATCH_PARENT,
            LayoutParams.MATCH_PARENT
        )
        recyclerView.layoutManager = layoutManager
        recyclerView.adapter = adapter
        adapter.stateRestorationPolicy = RecyclerView.Adapter.StateRestorationPolicy.PREVENT_WHEN_EMPTY
        recyclerView.setHasFixedSize(false)
        recyclerView.itemAnimator = null
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
        adapter.onSelectionChanged = { selectedUris ->
            onSelectionChange(mapOf("selectedUris" to selectedUris.toList()))
        }
    }

    override fun onStartTemporaryDetach() {
        isActive = false
        recyclerView.stopScroll()
        super.onStartTemporaryDetach()
    }

    override fun onDetachedFromWindow() {
        isActive = false
        recyclerView.stopScroll()
        adapter.onItemClick = null
        adapter.onItemLongClick = null
        adapter.onSelectionChanged = null
        super.onDetachedFromWindow()
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        if (w != oldw && w > 0) {
            val thumbPx = (thumbSizeDp * context.resources.displayMetrics.density).toInt()
            val cols = maxOf(2, w / thumbPx)
            if (layoutManager.spanCount != cols) {
                layoutManager.spanCount = cols
            }
        }
    }

    fun setUris(uris: List<String>) { adapter.setUris(uris) }
    fun setSelectMode(selectMode: Boolean) { adapter.setSelectMode(selectMode) }
    fun setCategory(category: String) { adapter.setCategory(category) }
    fun setOpeningUri(openingUri: String) { adapter.setOpeningUri(openingUri) }

    inner class MediaGridAdapter : RecyclerView.Adapter<MediaGridAdapter.GridViewHolder>() {

        private var uris: List<String> = emptyList()
        private var selectedUris: MutableSet<String> = mutableSetOf()
        private var selectMode: Boolean = false
        private var category: String = "images"
        private var openingUri: String = ""

        var onItemClick: ((String, Int) -> Unit)? = null
        var onItemLongClick: ((String, Int) -> Unit)? = null
        var onSelectionChanged: ((Set<String>) -> Unit)? = null

        fun isSelectMode(): Boolean = selectMode

        fun setUris(newUris: List<String>) {
            if (newUris.size == uris.size && newUris.containsAll(uris) && uris.containsAll(newUris)) return
            uris = newUris
            notifyDataSetChanged()
        }

        fun setSelectMode(newSelectMode: Boolean) {
            if (selectMode != newSelectMode) {
                selectMode = newSelectMode
                if (!newSelectMode) {
                    selectedUris.clear()
                }
                for (i in uris.indices) {
                    notifyItemChanged(i, "selectMode")
                }
            }
        }

        fun setCategory(newCategory: String) { category = newCategory }

        fun setOpeningUri(uri: String) {
            val oldUri = openingUri
            openingUri = uri
            val oldIndex = uris.indexOf(oldUri)
            val newIndex = uris.indexOf(uri)
            if (oldIndex >= 0) notifyItemChanged(oldIndex)
            if (newIndex >= 0) notifyItemChanged(newIndex)
        }

        fun toggleSelection(uri: String, holder: GridViewHolder) {
            val isNowSelected = !selectedUris.contains(uri)
            if (isNowSelected) selectedUris.add(uri) else selectedUris.remove(uri)
            holder.updateSelection(isNowSelected)
            onSelectionChanged?.invoke(selectedUris.toSet())
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
            holder.bind(uri, selectedUris.contains(uri), openingUri == uri, category, selectMode)
        }

        override fun onBindViewHolder(holder: GridViewHolder, position: Int, payloads: MutableList<Any>) {
            when {
                payloads.isNotEmpty() && payloads[0] == "selectMode" -> {
                    holder.updateSelection(selectedUris.contains(uris[position]))
                }
                else -> super.onBindViewHolder(holder, position, payloads)
            }
        }

        override fun onViewRecycled(holder: GridViewHolder) {
            super.onViewRecycled(holder)
            try {
                Glide.with(holder.imageView.context.applicationContext).clear(holder.imageView)
            } catch (e: Exception) {
                // context already destroyed, nothing to clear
            }
        }

        inner class GridViewHolder(private val container: FrameLayout) :
            RecyclerView.ViewHolder(container) {

            val imageView = ImageView(container.context).apply {
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
                updateSelection(isSelected)

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

                val requestOptions = RequestOptions()
                    .diskCacheStrategy(DiskCacheStrategy.RESOURCE)
                    .override(256, 256)
                    .centerCrop()

                Glide.with(container.context.applicationContext)
                    .load(android.net.Uri.parse(uri))
                    .apply(requestOptions)
                    .into(imageView)

                container.setOnClickListener {
                    val pos = bindingAdapterPosition
                    if (pos == RecyclerView.NO_POSITION || !isActive) return@setOnClickListener
                    val currentSelectMode = adapter.isSelectMode()
                    if (currentSelectMode) {
                        adapter.toggleSelection(uri, this)
                    }
                    onItemClick?.invoke(uri, pos)
                }
                container.setOnLongClickListener {
                    val pos = bindingAdapterPosition
                    if (pos == RecyclerView.NO_POSITION || !isActive) return@setOnLongClickListener true
                    onItemLongClick?.invoke(uri, pos)
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
            }

            private fun dpToPx(dp: Int): Int =
                (dp * container.context.resources.displayMetrics.density).toInt()
        }
    }
}
