package expo.modules.mediagrid

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import androidx.compose.ui.platform.LocalContext
import android.view.HapticFeedbackConstants
import androidx.compose.ui.platform.LocalView
import androidx.compose.runtime.snapshotFlow
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectDragGesturesAfterLongPress
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.AbstractComposeView
import androidx.compose.ui.platform.ViewCompositionStrategy
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.findViewTreeLifecycleOwner
import kotlinx.coroutines.launch
import com.bumptech.glide.integration.compose.CrossFade
import com.bumptech.glide.integration.compose.ExperimentalGlideComposeApi
import com.bumptech.glide.integration.compose.GlideImage
import com.bumptech.glide.load.DecodeFormat
import com.bumptech.glide.load.engine.DiskCacheStrategy
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView

class MediaGridView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {

    private val onItemPress by EventDispatcher()
    private val onItemLongPress by EventDispatcher()
    private val onSelectionChange by EventDispatcher()
    private val onDragSelectEnd by EventDispatcher()
    private val onDragSelectProgress by EventDispatcher()

    private val uris = mutableStateListOf<String>()
    private val selectedUris = mutableStateListOf<String>()
    private val selectMode = mutableStateOf(false)
    private val category = mutableStateOf("images")
    private val openingUri = mutableStateOf("")
    private val itemDates = mutableStateListOf<Long>()
    private val sortMode = mutableStateOf("")
    // Theme surface color (hex) for the tile placeholder background, passed from JS
    // so decoding tiles match the user's selected theme instead of a fixed grey.
    private val placeholderColor = mutableStateOf("#1E1E1E")

    // Tracks whether this view has ever been attached to a window.
    // Guards against Fabric measuring ComposeView before it has a window
    // recomposer — root cause of IllegalStateException on Android 16.
    private var hasBeenAttached = false

    fun setUris(newUris: List<String>) {
        if (newUris == uris) return
        uris.clear()
        uris.addAll(newUris)
    }

    fun setSelectMode(newSelectMode: Boolean) {
        selectMode.value = newSelectMode
        if (!newSelectMode) selectedUris.clear()
    }

    fun setSelectedUrisFromJS(uris: List<String>) {
        selectedUris.clear()
        selectedUris.addAll(uris)
    }

    fun setCategory(newCategory: String) { category.value = newCategory }
    fun setOpeningUri(newOpeningUri: String) { openingUri.value = newOpeningUri }
    fun setPlaceholderColor(hex: String) { placeholderColor.value = hex }

    fun setItemDates(dates: List<Double>) {
        itemDates.clear()
        itemDates.addAll(dates.map { it.toLong() })
    }
    fun setSortMode(mode: String) { sortMode.value = mode }

    private val composeView = object : AbstractComposeView(context) {
        init {
            // Safe default — upgraded to lifecycle-aware in outer onAttachedToWindow
            setViewCompositionStrategy(ViewCompositionStrategy.DisposeOnDetachedFromWindowOrReleasedFromPool)
        }

        @OptIn(ExperimentalGlideComposeApi::class)
        @Composable
        override fun Content() {
            val currentUris = uris
            val currentSelected = selectedUris.toList()
            val currentSelectMode = selectMode.value
            val currentCategory = category.value
            val currentOpeningUri = openingUri.value
            val currentDates = itemDates.toList()
            val currentSortMode = sortMode.value
            // Parse the theme placeholder hex once; fall back to a neutral dark grey
            // if the string is ever malformed, so a bad value can never crash the grid.
            val placeholderBg = remember(placeholderColor.value) {
                try {
                    Color(android.graphics.Color.parseColor(placeholderColor.value))
                } catch (e: Exception) {
                    Color(0xFF1E1E1E)
                }
            }

            val gridState = rememberLazyGridState()

            // ---- Scroll boundary haptics ----
            // Light tick on arriving at the top or bottom of the grid.
            // Edge-triggered: fires once on arrival, not repeatedly while parked
            // at the edge. Seeded from the current state so it never fires on mount.
            val ctx = LocalContext.current
            val vibrator = remember(ctx) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    (ctx.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)?.defaultVibrator
                } else {
                    @Suppress("DEPRECATION")
                    ctx.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
                }
            }

            LaunchedEffect(gridState) {
                fun tick() {
                    val v = vibrator
                    if (v == null || !v.hasVibrator()) return
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        v.vibrate(VibrationEffect.createOneShot(40, 255))
                    } else {
                        @Suppress("DEPRECATION")
                        v.vibrate(40)
                    }
                }

                var wasAtTop = !gridState.canScrollBackward
                var wasAtBottom = !gridState.canScrollForward
                snapshotFlow {
                    Pair(!gridState.canScrollBackward, !gridState.canScrollForward)
                }.collect { (atTop, atBottom) ->
                    if (atTop && !wasAtTop) tick()
                    if (atBottom && !wasAtBottom) tick()
                    wasAtTop = atTop
                    wasAtBottom = atBottom
                }
            }

            BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
                val thumbDp: Dp = 110.dp
                // Width-based default column count (the value before any pinch).
                val defaultCols = maxOf(2, (maxWidth / thumbDp).toInt())

                // Pinch-controlled column override. null = use the width-based default.
                // Ephemeral by design: not persisted, resets when the view is recreated
                // (leaving/returning to the category). Range clamped to 1..6.
                var pinchCols by remember { mutableStateOf<Int?>(null) }
                val cols = (pinchCols ?: defaultCols).coerceIn(1, 6)

                // Running scale factor for the pinch. 1.0 == the default column count.
                // Spreading fingers (zoom>1) drives this DOWN toward fewer columns
                // (bigger tiles); pinching (zoom<1) drives it UP toward more columns.
                var pinchScale by remember { mutableStateOf(1f) }

                // Maps a pointer position (relative to the grid) to the uri of the
                // tile under it, using the live layout info of visible items.
                // Returns null if the finger is over a gap or outside any tile.
                fun uriAtOffset(offset: Offset): String? {
                    val info = gridState.layoutInfo
                    val item = info.visibleItemsInfo.firstOrNull { itemInfo ->
                        val x = offset.x
                        val y = offset.y
                        x >= itemInfo.offset.x &&
                        x <= itemInfo.offset.x + itemInfo.size.width &&
                        y >= itemInfo.offset.y &&
                        y <= itemInfo.offset.y + itemInfo.size.height
                    } ?: return null
                    return currentUris.getOrNull(item.index)
                }

                LazyVerticalGrid(
                    state = gridState,
                    columns = GridCells.Fixed(cols),
                    modifier = Modifier
                        .fillMaxSize()
                        // Pinch-to-zoom column density. Active ONLY in normal mode —
                        // disabled in select mode so it can never compete with the
                        // drag-select gesture (they are mutually exclusive by mode,
                        // exactly like tap vs long-press-drag). Two-finger gesture, so
                        // it also separates cleanly from one-finger tap/long-press.
                        .pointerInput(currentSelectMode) {
                            if (currentSelectMode) return@pointerInput
                            awaitEachGesture {
                                // Wait for the first finger down (don't consume — one finger
                                // must still scroll normally).
                                awaitFirstDown(requireUnconsumed = false)
                                var previousSpacing = 0f
                                do {
                                    val event = awaitPointerEvent()
                                    val pressed = event.changes.filter { it.pressed }
                                    if (pressed.size >= 2) {
                                        // TWO fingers: this is a zoom. Consume every change so
                                        // the LazyVerticalGrid's scroll never sees these events
                                        // and cannot fight the pinch.
                                        val p0 = pressed[0].position
                                        val p1 = pressed[1].position
                                        val spacing = kotlin.math.hypot(
                                            (p0.x - p1.x), (p0.y - p1.y)
                                        )
                                        if (previousSpacing > 0f && spacing > 0f) {
                                            // Fingers spreading (spacing grows) -> fewer columns.
                                            val ratio = spacing / previousSpacing
                                            pinchScale = (pinchScale / ratio).coerceIn(0.45f, 2.75f)
                                            val target = (defaultCols * pinchScale)
                                                .toInt()
                                                .coerceIn(1, 6)
                                            if (target != (pinchCols ?: defaultCols)) {
                                                pinchCols = target
                                            }
                                        }
                                        previousSpacing = spacing
                                        // Consume so scroll is suppressed while 2 fingers are down.
                                        event.changes.forEach { it.consume() }
                                    } else {
                                        // Fewer than 2 fingers: reset spacing baseline and DON'T
                                        // consume — one-finger scroll works untouched.
                                        previousSpacing = 0f
                                    }
                                } while (event.changes.any { it.pressed })
                            }
                        }
                        // Drag-select gesture lives on the grid container so it can
                        // hit-test across ALL visible tiles (Compose equivalent of
                        // RecyclerView.findChildViewUnder). Only active in select mode;
                        // additive-only (never deselects); visible tiles only (no
                        // auto-scroll) — matches Browse exactly.
                        .pointerInput(currentSelectMode) {
                            if (!currentSelectMode) return@pointerInput
                            detectDragGesturesAfterLongPress(
                                onDragStart = { startOffset ->
                                    uriAtOffset(startOffset)?.let { uri ->
                                        if (!selectedUris.contains(uri)) {
                                            selectedUris.add(uri)
                                            // Outbound-only count for the JS header. Deliberately
                                            // NOT onSelectionChange — that round-trips through
                                            // setSelectedUrisFromJS and would clear the list
                                            // mid-drag. This event carries only a number and the
                                            // JS side must never write it back into selectedUris.
                                            onDragSelectProgress(mapOf("count" to selectedUris.size.toDouble()))
                                        }
                                    }
                                },
                                onDrag = { change, _ ->
                                    uriAtOffset(change.position)?.let { uri ->
                                        if (!selectedUris.contains(uri)) {
                                            selectedUris.add(uri)
                                            onDragSelectProgress(mapOf("count" to selectedUris.size.toDouble()))
                                        }
                                    }
                                },
                                onDragEnd = {
                                    onDragSelectEnd(mapOf("uris" to selectedUris.toList()))
                                }
                            )
                        },
                    contentPadding = PaddingValues(2.dp),
                    horizontalArrangement = Arrangement.spacedBy(2.dp),
                    verticalArrangement = Arrangement.spacedBy(2.dp)
                ) {
                    itemsIndexed(
                        items = currentUris,
                        key = { _, uri -> uri }
                    ) { index, uri ->
                        val isSelected = currentSelected.contains(uri)
                        val isOpening = currentOpeningUri == uri

                        val parsedUri = remember(uri) {
                            android.net.Uri.parse(uri)
                        }

                        Box(
                            modifier = Modifier
                                .aspectRatio(1f)
                                // Placeholder background: shows instantly while the thumbnail
                                // decodes, so rapid scrolling never reveals empty gaps — the
                                // image paints over this and crossfades in from it (Samsung-
                                // style). Uses the user's theme surface color (passed from JS)
                                // so it matches whichever of the 8 palettes is active.
                                .background(placeholderBg)
                                .then(
                                    if (isSelected) Modifier
                                        .padding(3.dp)
                                        .background(Color(0xFF185FA5))
                                    else Modifier
                                )
                                .pointerInput(uri, currentSelectMode) {
                                    detectTapGestures(
                                        onTap = {
                                            if (currentSelectMode) {
                                                if (selectedUris.contains(uri)) selectedUris.remove(uri)
                                                else selectedUris.add(uri)
                                                onSelectionChange(mapOf("selectedUris" to selectedUris.toList()))
                                            }
                                            onItemPress(mapOf("uri" to uri, "index" to index))
                                        },
                                        // Only watch long-press when NOT in select mode. In select
                                        // mode the grid-level detectDragGesturesAfterLongPress owns
                                        // the long-press; registering it here too makes both detectors
                                        // compete for the same pointer, which kills the drag after
                                        // onDragStart (no onDrag/onDragEnd ever arrive).
                                        onLongPress = if (currentSelectMode) null else {
                                            { onItemLongPress(mapOf("uri" to uri, "index" to index)) }
                                        }
                                    )
                                }
                        ) {
                            GlideImage(
                                model = parsedUri,
                                contentDescription = null,
                                contentScale = ContentScale.Crop,
                                // Fade the thumbnail in as it loads instead of a hard pop.
                                // NOTE: .dontAnimate() was removed from the builder below —
                                // it suppressed all transitions, so leaving it in would
                                // silently cancel this crossfade. Cached tiles (already in
                                // Glide's memory/disk cache) still appear effectively
                                // instantly; the fade is only perceptible on a genuine decode.
                                transition = CrossFade,
                                modifier = Modifier.fillMaxSize()
                            ) {
                                val decodePx = when {
                                    cols <= 1 -> 512
                                    cols == 2 -> 320
                                    cols <= 4 -> 200
                                    else -> 128
                                }
                                it.override(decodePx, decodePx)
                                .centerCrop()
                                .format(DecodeFormat.PREFER_RGB_565)
                                .diskCacheStrategy(DiskCacheStrategy.RESOURCE)
                              }

                            if (isSelected) {
                                Box(
                                    modifier = Modifier
                                        .fillMaxSize()
                                        .background(Color(0x4D185FA5))
                                )
                                Icon(
                                    imageVector = Icons.Filled.CheckCircle,
                                    contentDescription = null,
                                    tint = Color.White,
                                    modifier = Modifier
                                        .size(24.dp)
                                        .align(Alignment.TopEnd)
                                        .padding(4.dp)
                                )
                            }

                            if (currentCategory == "videos" && !currentSelectMode) {
                                if (isOpening) {
                                    CircularProgressIndicator(
                                        modifier = Modifier
                                            .size(20.dp)
                                            .align(Alignment.BottomEnd)
                                            .padding(4.dp),
                                        color = Color.White,
                                        strokeWidth = 2.dp
                                    )
                                } else {
                                    Icon(
                                        imageVector = Icons.Filled.PlayArrow,
                                        contentDescription = null,
                                        tint = Color.White,
                                        modifier = Modifier
                                            .size(16.dp)
                                            .align(Alignment.BottomEnd)
                                            .padding(4.dp)
                                    )
                                }
                            }
                        }
                    }
                }

                // ---- Fast-scroll scrubber (position-only) ----
                // Additive overlay on the right edge. Reads gridState for position,
                // calls scrollToItem to jump. Does NOT touch the grid's gesture or
                // Glide code. Auto-hides when idle; appears while scrolling or dragging.
                val totalItems = currentUris.size
                val coroutineScope = rememberCoroutineScope()
                var isDraggingScrubber by remember { mutableStateOf(false) }

                // Only show the scrubber when there's enough content to be worth it
                // and the grid is actually scrollable.
                val scrubberWorthShowing = totalItems > 30

                // Show while the user is actively scrolling OR dragging the scrubber.
                val isScrolling = gridState.isScrollInProgress
                val scrubberVisible = scrubberWorthShowing && (isScrolling || isDraggingScrubber)

                if (scrubberWorthShowing) {
                    val density = androidx.compose.ui.platform.LocalDensity.current
                    val trackHeightPx = with(density) { maxHeight.toPx() }

                    // Progress 0f..1f based on first visible item index over total.
                    val firstVisible = gridState.firstVisibleItemIndex
                    val progress = if (totalItems <= 1) 0f
                        else (firstVisible.toFloat() / (totalItems - 1).toFloat()).coerceIn(0f, 1f)

                    val thumbHeightDp: Dp = 48.dp
                    val thumbHeightPx = with(density) { thumbHeightDp.toPx() }
                    // Vertical offset of the thumb within the track.
                    val maxThumbTravel = (trackHeightPx - thumbHeightPx).coerceAtLeast(0f)
                    val thumbTopPx = progress * maxThumbTravel

                    if (scrubberVisible) {
                        Box(
                            modifier = Modifier
                                .align(Alignment.TopEnd)
                                .offset { androidx.compose.ui.unit.IntOffset(0, thumbTopPx.toInt()) }
                                .padding(end = 4.dp)
                                .size(width = 40.dp, height = thumbHeightDp)
                                .background(
                                    color = Color(0xCC185FA5),
                                    shape = RoundedCornerShape(topStart = 24.dp, bottomStart = 24.dp)
                                )
                                .pointerInput(totalItems, maxThumbTravel) {
                                    detectVerticalDragGestures(
                                        onDragStart = { isDraggingScrubber = true },
                                        onDragEnd = { isDraggingScrubber = false },
                                        onDragCancel = { isDraggingScrubber = false },
                                        onVerticalDrag = { change, _ ->
                                            // Map the finger's absolute Y within the track to a
                                            // target index. Using change.position.y (relative to
                                            // this thumb) plus the thumb's current top gives the
                                            // absolute track position.
                                            val absoluteY = (thumbTopPx + change.position.y)
                                                .coerceIn(0f, trackHeightPx)
                                            val frac = (absoluteY / trackHeightPx).coerceIn(0f, 1f)
                                            val target = (frac * (totalItems - 1)).toInt()
                                                .coerceIn(0, totalItems - 1)
                                            coroutineScope.launch {
                                                gridState.scrollToItem(target)
                                            }
                                        }
                                    )
                                },
                            contentAlignment = Alignment.Center
                        ) {
                            // Position bubble: "current / total"
                            val currentPos = (firstVisible + 1).coerceIn(1, totalItems)
                            Text(
                                text = "$currentPos",
                                color = Color.White,
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                }

                // ---- Date bubble ----
                // Centered-top overlay. Month+year of the top-visible item, shown only
                // while scrolling AND only when sorted by date. Native-driven: reads
                // gridState + dates passed once from JS. No JS work during scroll.
                val isDateSort = currentSortMode == "date_desc" || currentSortMode == "date_asc"
                if (isDateSort && currentDates.isNotEmpty() && gridState.isScrollInProgress) {
                    val topIndex = gridState.firstVisibleItemIndex
                    val epoch = currentDates.getOrNull(topIndex)
                    if (epoch != null && epoch > 0L) {
                        val label = remember(epoch) {
                            java.text.SimpleDateFormat("MMM yyyy", java.util.Locale.getDefault())
                                .format(java.util.Date(epoch))
                        }
                        Box(
                            modifier = Modifier
                                .align(Alignment.TopCenter)
                                .padding(top = 8.dp)
                                .background(Color(0xCC185FA5), RoundedCornerShape(16.dp))
                                .padding(horizontal = 14.dp, vertical = 6.dp)
                        ) {
                            Text(label, color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        }
    }

    init {
        addView(composeView, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        hasBeenAttached = true
        // Upgrade composeView to lifecycle-aware strategy now that we have a window
        val lifecycle = composeView.findViewTreeLifecycleOwner()?.lifecycle
        if (lifecycle != null) {
            composeView.setViewCompositionStrategy(
                ViewCompositionStrategy.DisposeOnLifecycleDestroyed(lifecycle)
            )
        }
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        // Guard: if Fabric measures before first window attachment, composeView
        // has no recomposer yet — skip to avoid IllegalStateException on Android 16
        if (!isAttachedToWindow && !hasBeenAttached) {
            setMeasuredDimension(
                android.view.View.MeasureSpec.getSize(widthMeasureSpec),
                android.view.View.MeasureSpec.getSize(heightMeasureSpec)
            )
            return
        }
        super.onMeasure(widthMeasureSpec, heightMeasureSpec)
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        // trimMemory on detach — releases Glide bitmaps back to pool immediately.
        // Do NOT call disposeComposition() — lifecycle strategy owns disposal.
        try {
            com.bumptech.glide.Glide
                .get(context)
                .trimMemory(android.content.ComponentCallbacks2.TRIM_MEMORY_UI_HIDDEN)
        } catch (e: Exception) {}
    }
}
