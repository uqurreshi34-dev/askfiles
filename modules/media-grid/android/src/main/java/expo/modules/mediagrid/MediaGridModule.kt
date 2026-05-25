package expo.modules.mediagrid


import android.graphics.Bitmap
import android.media.ThumbnailUtils
import android.os.Build
import android.provider.MediaStore
import android.util.Base64
import java.io.ByteArrayOutputStream
import java.io.File
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class MediaGridModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("MediaGrid")

      AsyncFunction("getVideoThumbnail") { uri: String ->
      val path = try {
        java.net.URLDecoder.decode(uri.removePrefix("file://"), "UTF-8")
      } catch (e: Exception) {
        uri.removePrefix("file://")
      }
 
      val bitmap: Bitmap? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        ThumbnailUtils.createVideoThumbnail(File(path), android.util.Size(512, 512), null)
      } else {
        @Suppress("DEPRECATION")
        ThumbnailUtils.createVideoThumbnail(path, MediaStore.Images.Thumbnails.MINI_KIND)
      }
 
      if (bitmap == null) return@AsyncFunction null
 
      val stream = ByteArrayOutputStream()
      bitmap.compress(Bitmap.CompressFormat.JPEG, 85, stream)
      val base64 = Base64.encodeToString(stream.toByteArray(), Base64.NO_WRAP)
      bitmap.recycle()
      "data:image/jpeg;base64,$base64"
    }

    View(MediaGridView::class) {
      // Array of file URIs to display
      Prop("uris") { view: MediaGridView, uris: List<String> ->
        view.setUris(uris)
      }

      // Whether select mode is active
      Prop("selectMode") { view: MediaGridView, selectMode: Boolean ->
        view.setSelectMode(selectMode)
      }

      // Category: "images" or "videos"
      Prop("category") { view: MediaGridView, category: String ->
        view.setCategory(category)
      }

      // URI that is currently opening (shows spinner)
      Prop("openingUri") { view: MediaGridView, openingUri: String ->
        view.setOpeningUri(openingUri)
      }

      // Events back to JS
      Events("onItemPress", "onItemLongPress", "onSelectionChange")
    }
  }
}
