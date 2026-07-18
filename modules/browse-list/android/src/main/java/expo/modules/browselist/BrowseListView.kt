package expo.modules.browselist

import android.content.Context
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ItemTouchHelper
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.bumptech.glide.Glide
import com.bumptech.glide.load.DecodeFormat
import com.bumptech.glide.load.engine.DiskCacheStrategy
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView

class BrowseListView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
    override val shouldUseAndroidLayout: Boolean = true
    private val onItemTap by EventDispatcher()
    private val onItemLongPress by EventDispatcher()
    private val onItemDotsPress by EventDispatcher()
    private val onBookmarkPress by EventDispatcher()
    private val onItemSwipeDelete by EventDispatcher() 
    private val onItemSwipeBookmark by EventDispatcher()
    private val onDragSelectEnd by EventDispatcher()
    private val recyclerView = RecyclerView(context)
    private val adapter = FileAdapter()
    private var items: List<FileItem> = emptyList()
    private var folderCounts: Map<String, Int> = emptyMap()
    private var selectedUris: Set<String> = emptySet()
    private var bookmarkedUris: Set<String> = emptySet()
    private var selectMode: Boolean = false
    private var openingUri: String = ""
    private var movingUri: String = ""
    private var showFastScrollEnabled: Boolean = false
    private lateinit var emptyView: LinearLayout
    private lateinit var emptyIcon: ImageView
    private lateinit var emptyText: TextView
    private val alphabetIndex = AlphabetIndexView(context)
    private val letterPositions = mutableMapOf<Char, Int>()
    private var sectionMode: String = "none"
    private val headerDecoration = StickyHeaderDecoration(
        context.resources.displayMetrics.density
    ) { position -> getSectionLabel(position) }

    data class ColorSet(
        val textPrimary: Int = Color.BLACK,
        val textMuted: Int = Color.GRAY,
        val border: Int = Color.LTGRAY,
        val blue: Int = Color.parseColor("#185FA5"),
        val blueTint: Int = Color.parseColor("#EBF3FC"),
        val yellow: Int = Color.parseColor("#BA7517"),
        val surface: Int = Color.parseColor("#F1EFE8"),
        val deleteRed: Int = Color.parseColor("#E24B4A")
    )

    private var colorSet = ColorSet()

    fun setColors(raw: Map<String, String>) {
        colorSet = ColorSet(
            textPrimary = parseColor(raw["textPrimary"], Color.BLACK),
            textMuted = parseColor(raw["textMuted"], Color.GRAY),
            border = parseColor(raw["border"], Color.LTGRAY),
            blue = parseColor(raw["blue"], Color.parseColor("#185FA5")),
            blueTint = parseColor(raw["blueTint"], Color.parseColor("#EBF3FC")),
            yellow = parseColor(raw["yellow"], Color.parseColor("#BA7517")),
            surface = parseColor(raw["surface"], Color.parseColor("#F1EFE8")),
            deleteRed = parseColor(raw["deleteRed"], Color.parseColor("#E24B4A"))
        )
        adapter.notifyItemRangeChanged(0, items.size)
        if (::emptyIcon.isInitialized) {
            emptyIcon.setColorFilter(colorSet.textMuted)
            emptyText.setTextColor(colorSet.textMuted)
        }
    }

    private fun parseColor(hex: String?, fallback: Int): Int {
        return try { Color.parseColor(hex ?: return fallback) } catch (e: Exception) { fallback }
    }

    data class FileItem(
        val name: String,
        val uri: String,
        val isDirectory: Boolean,
        val size: Long,
        val date: Long
    )

    init {
        recyclerView.layoutManager = LinearLayoutManager(context)
        recyclerView.adapter = adapter
        recyclerView.setHasFixedSize(false)
        recyclerView.itemAnimator = null
        recyclerView.addItemDecoration(headerDecoration)
        addView(recyclerView, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
        val indexWidth = (28 * context.resources.displayMetrics.density).toInt()
        addView(alphabetIndex, FrameLayout.LayoutParams(indexWidth, FrameLayout.LayoutParams.MATCH_PARENT).apply {
            gravity = android.view.Gravity.END
        })
        alphabetIndex.visibility = View.GONE
        alphabetIndex.onLetterSelected = { letter ->
            letterPositions[letter]?.let { pos ->
                (recyclerView.layoutManager as? LinearLayoutManager)?.scrollToPositionWithOffset(pos, 0)
            }
        }

        val dp = context.resources.displayMetrics.density
        emptyIcon = ImageView(context).apply {
            setImageResource(R.drawable.ic_folder)
            scaleType = ImageView.ScaleType.FIT_CENTER
            layoutParams = LinearLayout.LayoutParams((48 * dp).toInt(), (48 * dp).toInt())
        }
        emptyText = TextView(context).apply {
            text = "This folder is empty"
            textSize = 14f
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { topMargin = (8 * dp).toInt() }
        }
        emptyView = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            gravity = android.view.Gravity.CENTER
            addView(emptyIcon)
            addView(emptyText)
            visibility = View.GONE
        }
        addView(emptyView, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))

        setupSwipeToDelete()
        setupDragToSelect()
    }

    override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
        super.onLayout(changed, l, t, r, b)
        val parentWidth = r - l
        val parentHeight = b - t
        val indexWidth = alphabetIndex.measuredWidth.takeIf { it > 0 }
            ?: (28 * context.resources.displayMetrics.density).toInt()
        alphabetIndex.layout(
            parentWidth - indexWidth,
            0,
            parentWidth,
            parentHeight
        )
    }

    private var dragSelecting = false
    private val dragSelectedUris = mutableSetOf<String>()

    private fun setupDragToSelect() {
        recyclerView.addOnItemTouchListener(object : RecyclerView.SimpleOnItemTouchListener() {

            override fun onInterceptTouchEvent(rv: RecyclerView, e: android.view.MotionEvent): Boolean {
                if (!selectMode || !dragSelecting) return false
                return when (e.action) {
                    android.view.MotionEvent.ACTION_MOVE,
                    android.view.MotionEvent.ACTION_UP,
                    android.view.MotionEvent.ACTION_CANCEL -> true
                    else -> false
                }
            }

            override fun onTouchEvent(rv: RecyclerView, e: android.view.MotionEvent) {
                if (!selectMode || !dragSelecting) return
                when (e.action) {
                    android.view.MotionEvent.ACTION_MOVE -> {
                        val child = rv.findChildViewUnder(e.x, e.y) ?: return
                        val position = rv.getChildAdapterPosition(child)
                        if (position == RecyclerView.NO_POSITION) return
                        val item = items.getOrNull(position) ?: return
                        if (dragSelectedUris.add(item.uri)) {
                            adapter.notifyItemChanged(position, PAYLOAD_SELECTION_PREVIEW)
                        }
                    }
                    android.view.MotionEvent.ACTION_UP, android.view.MotionEvent.ACTION_CANCEL -> {
                        endDragSelect()
                    }
                }
            }

            override fun onRequestDisallowInterceptTouchEvent(disallowIntercept: Boolean) {
                if (disallowIntercept) endDragSelect()
            }
        })
    }

    private fun endDragSelect() {
        if (!dragSelecting) return
        dragSelecting = false
        if (dragSelectedUris.isNotEmpty()) {
            onDragSelectEnd(mapOf("uris" to dragSelectedUris.toList()))
        }
    }

    fun startDragSelect(uri: String) {
        if (!selectMode) return
        dragSelecting = true
        dragSelectedUris.clear()
        dragSelectedUris.add(uri)
        val position = items.indexOfFirst { it.uri == uri }
        if (position != -1) adapter.notifyItemChanged(position, PAYLOAD_SELECTION_PREVIEW)
    }

    private fun setupSwipeToDelete() {
        val dp = context.resources.displayMetrics.density
        val paint = android.graphics.Paint()
        paint.color = colorSet.deleteRed
        val bookmarkIcon = androidx.core.content.ContextCompat.getDrawable(context, R.drawable.ic_bookmark_filled)?.mutate()?.apply { setTint(Color.WHITE) }
        val trashIcon = androidx.core.content.ContextCompat.getDrawable(context, R.drawable.ic_trash)?.mutate()?.apply { setTint(Color.WHITE) }
        val callback = object : ItemTouchHelper.SimpleCallback(0, ItemTouchHelper.LEFT or ItemTouchHelper.RIGHT) {

            override fun onMove(rv: RecyclerView, vh: RecyclerView.ViewHolder, t: RecyclerView.ViewHolder) = false

            override fun getSwipeThreshold(viewHolder: RecyclerView.ViewHolder) = 0.4f

            override fun getSwipeEscapeVelocity(defaultValue: Float) = defaultValue * 0.8f

            override fun getSwipeDirs(rv: RecyclerView, vh: RecyclerView.ViewHolder): Int {
                if (selectMode) return 0
                val pos = vh.bindingAdapterPosition
                if (pos == RecyclerView.NO_ID.toInt()) return 0
                val item = items[pos]
                if (item.isDirectory) return ItemTouchHelper.RIGHT
                return ItemTouchHelper.LEFT
            }

            override fun onSwiped(vh: RecyclerView.ViewHolder, direction: Int) {
                val pos = vh.bindingAdapterPosition
                if (pos == RecyclerView.NO_ID.toInt()) return
                val item = items[pos]
                if (direction == ItemTouchHelper.LEFT) {
                    onItemSwipeDelete(mapOf(
                        "uri" to item.uri,
                        "name" to item.name,
                        "isDirectory" to false
                    ))
                } else {
                    onItemSwipeBookmark(mapOf("uri" to item.uri, "name" to item.name))
                    adapter.notifyItemChanged(pos)
                }
            }

            override fun getAnimationDuration(recyclerView: RecyclerView, animationType: Int, animateDx: Float, animateDy: Float): Long {
                return if (animationType == ItemTouchHelper.ANIMATION_TYPE_SWIPE_CANCEL) 200L
                else super.getAnimationDuration(recyclerView, animationType, animateDx, animateDy)
            }

            override fun onChildDraw(
                c: android.graphics.Canvas,
                recyclerView: RecyclerView,
                viewHolder: RecyclerView.ViewHolder,
                dX: Float, dY: Float,
                actionState: Int,
                isCurrentlyActive: Boolean
            ) {
                val itemView = viewHolder.itemView
                val iconMargin = (16 * dp).toInt()
                val iconSize = (24 * dp).toInt()
                val iconTop = itemView.top + (itemView.height - iconSize) / 2

                if (dX > 0) {
                    // Blue bookmark background (right swipe)
                    paint.color = colorSet.blue
                    val background = android.graphics.RectF(
                        itemView.left.toFloat(),
                        itemView.top.toFloat(),
                        itemView.left + dX,
                        itemView.bottom.toFloat()
                    )
                    c.drawRoundRect(background, 12f * dp, 12f * dp, paint)
                    bookmarkIcon?.let {
                        val iconLeft = itemView.left + iconMargin
                        it.setBounds(iconLeft, iconTop, iconLeft + iconSize, iconTop + iconSize)
                        if (dX > iconMargin) it.draw(c)
                    }
                } else if (dX < 0) {
                    // Red delete background (left swipe)
                    paint.color = colorSet.deleteRed
                    val background = android.graphics.RectF(
                        itemView.right + dX,
                        itemView.top.toFloat(),
                        itemView.right.toFloat(),
                        itemView.bottom.toFloat()
                    )
                    c.drawRoundRect(background, 12f * dp, 12f * dp, paint)
                    trashIcon?.let {
                        val iconLeft = itemView.right - iconMargin - iconSize
                        it.setBounds(iconLeft, iconTop, iconLeft + iconSize, iconTop + iconSize)
                        if (dX < -iconMargin) it.draw(c)
                    }
                }

                super.onChildDraw(c, recyclerView, viewHolder, dX, dY, actionState, isCurrentlyActive)
            }
        }
        ItemTouchHelper(callback).attachToRecyclerView(recyclerView)
    }

    // ── Lifecycle — mirrors MediaGridView exactly ──────────────────────────────

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        recyclerView.requestLayout()
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        try {
            Glide.get(context).trimMemory(
                android.content.ComponentCallbacks2.TRIM_MEMORY_UI_HIDDEN
            )
        } catch (e: Exception) {}
    }

    // ── Props ──────────────────────────────────────────────────────────────────

    fun setItems(raw: List<Map<String, Any?>>) {
        val newItems = raw.map { map ->
            FileItem(
                name = map["name"] as? String ?: "",
                uri = map["uri"] as? String ?: "",
                isDirectory = map["isDirectory"] as? Boolean ?: false,
                size = (map["size"] as? Number)?.toLong() ?: 0L,
                date = (map["date"] as? Number)?.toLong() ?: 0L
            )
        }
        if (newItems.map { it.uri } == items.map { it.uri }) {
            // Same directory — use DiffUtil for efficient updates
            val diff = DiffUtil.calculateDiff(FileDiffCallback(items, newItems))
            items = newItems
            diff.dispatchUpdatesTo(adapter)
        } else {
            // Different directory — full swap + scroll to top
            items = newItems
            adapter.notifyDataSetChanged()
            recyclerView.scrollToPosition(0)
        }
        updateLetterPositions()
        recyclerView.post { recyclerView.invalidateItemDecorations() }
        updateEmptyState()
    }

    private fun updateEmptyState() {
        val isEmpty = items.isEmpty()
        emptyView.visibility = if (isEmpty) View.VISIBLE else View.GONE
        recyclerView.visibility = if (isEmpty) View.GONE else View.VISIBLE
        alphabetIndex.visibility = if (!isEmpty && showFastScrollEnabled) View.VISIBLE else View.GONE
    }

    fun setSectionMode(mode: String) {
        sectionMode = mode
        recyclerView.invalidateItemDecorations()
    }

    private fun getSectionLabel(position: Int): String? {
        if (position !in items.indices) return null
        val item = items[position]
        return when (sectionMode) {
            "alpha" -> {
                val c = item.name.firstOrNull()?.uppercaseChar()
                if (c != null && c in 'A'..'Z') c.toString() else "#"
            }
            "date" -> dateBucket(item.date)
            else -> null
        }
    }

    private fun dateBucket(ms: Long): String {
        if (ms == 0L) return "Older"
        val msActual = if (ms < 10_000_000_000L) ms * 1000L else ms
        val now = System.currentTimeMillis()
        val days = (now - msActual) / 86_400_000
        return when {
            days < 1 -> "Today"
            days < 2 -> "Yesterday"
            days < 7 -> "Last 7 Days"
            days < 30 -> "Last 30 Days"
            else -> "Older"
        }
    }

    private fun updateLetterPositions() {
        letterPositions.clear()
        items.forEachIndexed { i, item ->
            val c = item.name.firstOrNull()?.uppercaseChar()
            val key = if (c != null && c in 'A'..'Z') c else '#'
            if (!letterPositions.containsKey(key)) letterPositions[key] = i
        }
        alphabetIndex.availableLetters = letterPositions.keys
        alphabetIndex.invalidate()
    }

    fun setShowFastScroll(enabled: Boolean) {
        showFastScrollEnabled = enabled
        alphabetIndex.visibility = if (enabled && items.isNotEmpty()) View.VISIBLE else View.GONE
    }

    fun setFolderCounts(counts: Map<String, Int>) {
      folderCounts = counts
      adapter.notifyItemRangeChanged(0, items.size, PAYLOAD_META)
      requestLayout()
  }

    fun setSelectedUris(uris: List<String>) {
        selectedUris = uris.toHashSet()
        if (dragSelectedUris.isNotEmpty()) {
            dragSelectedUris.removeAll(selectedUris)
        }
        adapter.notifyItemRangeChanged(0, items.size, PAYLOAD_SELECTION)
    }

    fun setBookmarkedUris(uris: List<String>) {
        bookmarkedUris = uris.toHashSet()
        recyclerView.post {
            adapter.notifyDataSetChanged()
        }
    }

    fun setSelectMode(enabled: Boolean) {
        selectMode = enabled
        adapter.notifyItemRangeChanged(0, items.size, PAYLOAD_SELECTION)
    }

    fun setOpeningUri(uri: String) {
        openingUri = uri
        adapter.notifyItemRangeChanged(0, items.size, PAYLOAD_OPENING)
    }

    fun setMovingUri(uri: String) {
        movingUri = uri
        adapter.notifyItemRangeChanged(0, items.size, PAYLOAD_OPENING)
    }

    // ── Adapter ────────────────────────────────────────────────────────────────

    inner class FileAdapter : RecyclerView.Adapter<FileViewHolder>() {

        override fun getItemCount() = items.size

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): FileViewHolder {
            val row = LayoutInflater.from(parent.context)
                .inflate(R.layout.item_file_row, parent, false)
            return FileViewHolder(row)
        }

        override fun onBindViewHolder(holder: FileViewHolder, position: Int) {
            holder.bind(items[position])
        }

        override fun onBindViewHolder(
            holder: FileViewHolder,
            position: Int,
            payloads: MutableList<Any>
        ) {
            if (payloads.isEmpty()) {
                holder.bind(items[position])
                return
            }
            val item = items[position]
            payloads.forEach { payload ->
                when (payload) {
                    PAYLOAD_SELECTION -> holder.bindSelection(item)
                    PAYLOAD_SELECTION_PREVIEW -> holder.bindSelection(item)
                    PAYLOAD_META -> holder.bindMeta(item)
                    PAYLOAD_BOOKMARK -> holder.bindBookmark(item)
                    PAYLOAD_OPENING -> holder.bindOpening(item)
                }
            }
        }

        override fun onViewRecycled(holder: FileViewHolder) {
            super.onViewRecycled(holder)
            holder.recycle()
        }
    }

    // ── ViewHolder ─────────────────────────────────────────────────────────────

    inner class FileViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {

        private val iconWrap: FrameLayout = itemView.findViewById(R.id.iconWrap)
        private val iconImage: ImageView = itemView.findViewById(R.id.iconImage)
        private val iconText: TextView = itemView.findViewById(R.id.iconText)
        private val nameText: TextView = itemView.findViewById(R.id.nameText)
        private val metaText: TextView = itemView.findViewById(R.id.metaText)
        private val dotsBtn: View = itemView.findViewById(R.id.dotsBtn)
        private val bookmarkBtn: ImageView = itemView.findViewById(R.id.bookmarkBtn)
        private val chevron: ImageView = itemView.findViewById(R.id.chevron)
        private val checkIcon: ImageView = itemView.findViewById(R.id.checkIcon)
        private val loadingIndicator: View = itemView.findViewById(R.id.loadingIndicator)

        fun bind(item: FileItem) {
            nameText.text = item.name
            nameText.setTextColor(colorSet.textPrimary)
            metaText.setTextColor(colorSet.textMuted)
            bindMeta(item)
            bindSelection(item)
            bindBookmark(item)
            bindOpening(item)
            bindIcon(item)

            itemView.setOnClickListener {
                onItemTap(mapOf(
                    "uri" to item.uri,
                    "name" to item.name,
                    "isDirectory" to item.isDirectory
                ))
            }
            itemView.setOnLongClickListener {
                if (selectMode) {
                    startDragSelect(item.uri)
                } else {
                    onItemLongPress(mapOf(
                        "uri" to item.uri,
                        "name" to item.name,
                        "isDirectory" to item.isDirectory
                    ))
                }
                true
            }
            dotsBtn.setOnClickListener {
                onItemDotsPress(mapOf(
                    "uri" to item.uri,
                    "name" to item.name,
                    "isDirectory" to item.isDirectory
                ))
            }
            bookmarkBtn.setOnClickListener {
                onBookmarkPress(mapOf(
                    "uri" to item.uri,
                    "name" to item.name
                ))
            }
        }

        fun bindMeta(item: FileItem) {
            if (item.isDirectory) {
                val count = folderCounts[item.uri]
                metaText.text = when {
                    count == null -> "Folder"
                    count == 0 -> "Empty"
                    else -> "$count item${if (count != 1) "s" else ""}"
                }
                bookmarkBtn.visibility = View.VISIBLE
                chevron.visibility = View.VISIBLE
                dotsBtn.visibility = View.GONE
            } else {
                metaText.text = "${formatSize(item.size)} · ${formatDate(item.date)}"
                bookmarkBtn.visibility = View.GONE
                chevron.visibility = View.GONE
                dotsBtn.visibility = if (selectMode) View.GONE else View.VISIBLE
            }
            metaText.setTextColor(colorSet.textMuted)
        }

        fun bindSelection(item: FileItem) {
            val isSelected = selectedUris.contains(item.uri) || dragSelectedUris.contains(item.uri)
            itemView.setBackgroundColor(
                if (isSelected) colorSet.blueTint else Color.TRANSPARENT
            )
            checkIcon.visibility = if (selectMode) View.VISIBLE else View.GONE
            checkIcon.setImageResource(
                if (isSelected) android.R.drawable.checkbox_on_background
                else android.R.drawable.checkbox_off_background
            )
            dotsBtn.visibility = when {
                selectMode -> View.GONE
                item.isDirectory -> View.GONE
                else -> View.VISIBLE
            }
        }

        fun bindBookmark(item: FileItem) {
            if (!item.isDirectory) {
                bookmarkBtn.visibility = View.GONE
                return
            }
            bookmarkBtn.visibility = View.VISIBLE
            val isBookmarked = bookmarkedUris.contains(item.uri)
            bookmarkBtn.setImageResource(
                if (isBookmarked) R.drawable.ic_bookmark_filled
                else R.drawable.ic_bookmark_outline
            )
        }

        fun bindOpening(item: FileItem) {
            val isOpening = openingUri == item.uri || movingUri == item.uri
            loadingIndicator.visibility = if (isOpening) View.VISIBLE else View.GONE
            if (!item.isDirectory && !selectMode) {
                dotsBtn.visibility = if (isOpening) View.GONE else View.VISIBLE
            }
        }

        fun bindIcon(item: FileItem) {
            val ext = item.name.substringAfterLast('.', "").lowercase()
            val isImage = ext in IMAGE_EXTS
            val isVideo = ext in VIDEO_EXTS

            if (item.isDirectory) {
                iconImage.visibility = View.VISIBLE
                iconText.visibility = View.GONE
                iconImage.clearColorFilter()
                iconImage.setImageResource(R.drawable.ic_folder)
                iconImage.setColorFilter(colorSet.yellow)
                val drawable = GradientDrawable()
                drawable.cornerRadius = 10f * context.resources.displayMetrics.density
                drawable.setColor(Color.argb(51, Color.red(colorSet.yellow), Color.green(colorSet.yellow), Color.blue(colorSet.yellow)))
                iconWrap.background = drawable
            } else if (isImage || isVideo) {
                  iconImage.visibility = View.VISIBLE
                  iconText.visibility = View.GONE
                  iconImage.clearColorFilter()
                  val roundBg = GradientDrawable()
                  roundBg.cornerRadius = 10f * context.resources.displayMetrics.density
                  roundBg.setColor(Color.TRANSPARENT)
                  iconWrap.background = roundBg
                  iconWrap.clipToOutline = true
                  Glide.with(iconImage)
                      .load(android.net.Uri.parse(item.uri))
                      .override(80, 80)
                      .centerCrop()
                      .format(DecodeFormat.PREFER_RGB_565)
                      .diskCacheStrategy(DiskCacheStrategy.RESOURCE)
                      .dontAnimate()
                      .into(iconImage)
           } else {
                iconImage.visibility = View.GONE
                iconText.visibility = View.VISIBLE
                val (bgColor, label) = getFileStyle(item)
                val baseColor = Color.parseColor(bgColor)
                val drawable = GradientDrawable()
                drawable.cornerRadius = 10f * context.resources.displayMetrics.density
                drawable.setColor(Color.argb(34, Color.red(baseColor), Color.green(baseColor), Color.blue(baseColor)))
                iconWrap.background = drawable
                iconText.text = label
                iconText.setTextColor(baseColor)
            }
        }

        fun recycle() {
            Glide.with(iconImage.context).clear(iconImage)
            iconImage.setImageDrawable(null)
        }
    }

    // ── DiffUtil ───────────────────────────────────────────────────────────────

    class FileDiffCallback(
        private val old: List<FileItem>,
        private val new: List<FileItem>
    ) : DiffUtil.Callback() {
        override fun getOldListSize() = old.size
        override fun getNewListSize() = new.size
        override fun areItemsTheSame(oldPos: Int, newPos: Int) =
            old[oldPos].uri == new[newPos].uri
        override fun areContentsTheSame(oldPos: Int, newPos: Int) =
            old[oldPos] == new[newPos]
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    private fun formatSize(bytes: Long): String {
        return when {
            bytes >= 1_073_741_824 -> "%.1f GB".format(bytes / 1_073_741_824.0)
            bytes >= 1_048_576 -> "%.1f MB".format(bytes / 1_048_576.0)
            bytes >= 1_024 -> "%.1f KB".format(bytes / 1_024.0)
            else -> "$bytes B"
        }
    }

    private fun formatDate(ms: Long): String {
        if (ms == 0L) return ""
        val msActual = if (ms < 10_000_000_000L) ms * 1000L else ms
        val now = System.currentTimeMillis()
        val diff = now - msActual
        val mins = diff / 60_000
        val hours = diff / 3_600_000
        val days = diff / 86_400_000
        val months = days / 30
        return when {
            mins < 1 -> "Just now"
            mins < 60 -> "$mins min ago"
            hours < 24 -> "$hours hour${if (hours != 1L) "s" else ""} ago"
            days < 30 -> "$days day${if (days != 1L) "s" else ""} ago"
            months < 12 -> "$months month${if (months != 1L) "s" else ""} ago"
            else -> {
                val sdf = java.text.SimpleDateFormat("d MMM yyyy", java.util.Locale.getDefault())
                sdf.format(java.util.Date(msActual))
            }
        }
    }

    private fun getFileStyle(item: FileItem): Pair<String, String> {
        return when (item.name.substringAfterLast('.', "").lowercase()) {
            "pdf" -> Pair("#D2342B", "PDF")
            "doc", "docx" -> Pair("#2B579A", "DOC")
            "xls", "xlsx" -> Pair("#217346", "XLS")
            "csv" -> Pair("#217346", "CSV")
            "ppt", "pptx" -> Pair("#C43E1C", "PPT")
            "txt", "md" -> Pair("#5F5E5A", "TXT")
            "mp3", "wav", "aac", "flac", "m4a", "ogg" -> Pair("#854F0B", "MP3")
            "zip", "rar", "7z", "tar", "gz" -> Pair("#3B6D11", "ZIP")
            "apk" -> Pair("#2E7D32", "APK")
            else -> Pair("#5F5E5A", item.name.substringAfterLast('.', "?").uppercase().take(3))
        }
    }

    companion object {
        private const val PAYLOAD_SELECTION = "selection"
        private const val PAYLOAD_META = "meta"
        private const val PAYLOAD_BOOKMARK = "bookmark"
        private const val PAYLOAD_OPENING = "opening"
        private const val PAYLOAD_SELECTION_PREVIEW = "selection_preview"

        private val IMAGE_EXTS = setOf(
            "jpg", "jpeg", "png", "gif", "webp", "heic", "heif", "bmp"
        )
        private val VIDEO_EXTS = setOf(
            "mp4", "mkv", "avi", "mov", "wmv", "flv", "webm", "3gp", "m4v"
        )
    }
}
