package expo.modules.browselist

import android.content.Context
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.os.Handler
import android.os.Looper
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.TextView
import androidx.recyclerview.widget.DiffUtil
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

    private val recyclerView = RecyclerView(context)
    private val adapter = FileAdapter()
    private val mainHandler = Handler(Looper.getMainLooper())

    private var items: List<FileItem> = emptyList()
    private var folderCounts: Map<String, Int> = emptyMap()
    private var selectedUris: Set<String> = emptySet()
    private var bookmarkedUris: Set<String> = emptySet()
    private var selectMode: Boolean = false
    private var openingUri: String = ""
    private var movingUri: String = ""

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
        addView(recyclerView, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
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
        mainHandler.removeCallbacksAndMessages(null)
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
    }

    fun setFolderCounts(counts: Map<String, Int>) {
      folderCounts = counts
      adapter.notifyItemRangeChanged(0, items.size, PAYLOAD_META)
      requestLayout()
  }

    fun setSelectedUris(uris: List<String>) {
        selectedUris = uris.toHashSet()
        adapter.notifyItemRangeChanged(0, items.size, PAYLOAD_SELECTION)
    }

    fun setBookmarkedUris(uris: List<String>) {
        bookmarkedUris = uris.toHashSet()
        adapter.notifyItemRangeChanged(0, items.size, PAYLOAD_BOOKMARK)
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
                onItemLongPress(mapOf(
                    "uri" to item.uri,
                    "name" to item.name,
                    "isDirectory" to item.isDirectory
                ))
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
            val isSelected = selectedUris.contains(item.uri)
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
            if (!item.isDirectory) return
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
                iconWrap.background = null
                val params = iconImage.layoutParams as FrameLayout.LayoutParams
                params.width = (20f * context.resources.displayMetrics.density).toInt()
                params.height = (20f * context.resources.displayMetrics.density).toInt()
                params.gravity = android.view.Gravity.CENTER
                iconImage.layoutParams = params
                iconImage.scaleType = ImageView.ScaleType.FIT_CENTER
                Glide.with(iconImage)
                    .load(android.net.Uri.parse(item.uri))
                    .override(80, 80)
                    .centerCrop()
                    .format(DecodeFormat.PREFER_RGB_565)
                    .diskCacheStrategy(DiskCacheStrategy.RESOURCE)
                    .dontAnimate()
                    .into(iconImage)
            } else {
              iconImage.visibility = View.VISIBLE
              iconText.visibility = View.GONE
              iconImage.clearColorFilter()
              val (bgColor, iconRes) = getFileStyle(item)
              val baseColor = Color.parseColor(bgColor)
              // Solid colored background (no transparency) — icon is white on top
              val bg = GradientDrawable()
              bg.cornerRadius = 10f * context.resources.displayMetrics.density
              bg.setColor(baseColor)
              iconWrap.background = bg
              iconImage.setImageResource(iconRes)
              // No color filter — icon lines stay white as defined in XML
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

    private fun getFileStyle(item: FileItem): Pair<String, Int> {
      return when (item.name.substringAfterLast('.', "").lowercase()) {
          "pdf" -> Pair("#D2342B", R.drawable.ic_file_document)
          "doc", "docx" -> Pair("#2B579A", R.drawable.ic_file_document)
          "xls", "xlsx", "csv" -> Pair("#217346", R.drawable.ic_file_document)
          "ppt", "pptx" -> Pair("#C43E1C", R.drawable.ic_file_document)
          "txt", "md" -> Pair("#5F5E5A", R.drawable.ic_file_document)
          "mp3", "wav", "aac", "flac", "m4a", "ogg" -> Pair("#854F0B", R.drawable.ic_file_audio)
          "zip", "rar", "7z", "tar", "gz" -> Pair("#3B6D11", R.drawable.ic_file_archive)
          "apk" -> Pair("#2E7D32", R.drawable.ic_file_android)
          else -> Pair("#5F5E5A", R.drawable.ic_file_document)
      }
  }

    companion object {
        private const val PAYLOAD_SELECTION = "selection"
        private const val PAYLOAD_META = "meta"
        private const val PAYLOAD_BOOKMARK = "bookmark"
        private const val PAYLOAD_OPENING = "opening"

        private val IMAGE_EXTS = setOf(
            "jpg", "jpeg", "png", "gif", "webp", "heic", "heif", "bmp"
        )
        private val VIDEO_EXTS = setOf(
            "mp4", "mkv", "avi", "mov", "wmv", "flv", "webm", "3gp", "m4v"
        )
    }
}
