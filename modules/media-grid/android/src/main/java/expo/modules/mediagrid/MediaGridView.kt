package expo.modules.mediagrid

import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.AbstractComposeView
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
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

    private val uris = mutableStateListOf<String>()
    private val selectedUris = mutableStateListOf<String>()
    private val selectMode = mutableStateOf(false)
    private val category = mutableStateOf("images")
    private val openingUri = mutableStateOf("")

    fun setUris(newUris: List<String>) {
        if (newUris == uris) return
        uris.clear()
        uris.addAll(newUris)
    }

    fun setSelectMode(newSelectMode: Boolean) {
        selectMode.value = newSelectMode
        if (!newSelectMode) selectedUris.clear()
    }

    fun setCategory(newCategory: String) { category.value = newCategory }
    fun setOpeningUri(newOpeningUri: String) { openingUri.value = newOpeningUri }

    private val composeView = object : AbstractComposeView(context) {
        @OptIn(ExperimentalGlideComposeApi::class)
        @Composable
        override fun Content() {
            // Use state lists directly — no copy allocation on every recomposition
            val currentUris = uris
            val currentSelected = selectedUris
            val currentSelectMode = selectMode.value
            val currentCategory = category.value
            val currentOpeningUri = openingUri.value

            BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
                val thumbDp: Dp = 110.dp
                val cols = maxOf(2, (maxWidth / thumbDp).toInt())

                LazyVerticalGrid(
                    columns = GridCells.Fixed(cols),
                    modifier = Modifier.fillMaxSize(),
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

                        // Parse URI once per item, not every recomposition
                        val parsedUri = remember(uri) {
                            android.net.Uri.parse(uri)
                        }

                        Box(
                            modifier = Modifier
                                .aspectRatio(1f)
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
                                        onLongPress = {
                                            onItemLongPress(mapOf("uri" to uri, "index" to index))
                                        }
                                    )
                                }
                        ) {
                            GlideImage(
                                model = parsedUri,
                                contentDescription = null,
                                contentScale = ContentScale.Crop,
                                modifier = Modifier.fillMaxSize()
                            ) {
                                it.override(128, 128)
                                  .dontAnimate()
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
            }
        }
    }

    init {
        addView(composeView, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        composeView.disposeComposition()
        try {
            com.bumptech.glide.Glide
                .get(context)
                .trimMemory(android.content.ComponentCallbacks2.TRIM_MEMORY_UI_HIDDEN)
        } catch (e: Exception) {}
    }
}
