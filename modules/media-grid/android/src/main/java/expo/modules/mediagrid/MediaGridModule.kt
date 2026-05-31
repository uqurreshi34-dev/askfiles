package expo.modules.mediagrid

import android.graphics.Bitmap
import android.media.ThumbnailUtils
import android.os.Build
import android.provider.MediaStore
import java.io.File
import java.security.MessageDigest
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class MediaGridModule : Module() {

  private fun md5(input: String): String {
    return MessageDigest.getInstance("MD5")
      .digest(input.toByteArray())
      .joinToString("") { "%02x".format(it) }
  }

  override fun definition() = ModuleDefinition {
    Name("MediaGrid")

    OnCreate {
      // Clean video thumb cache files older than 7 days — runs once per app session
      val cacheDir = appContext.reactContext?.cacheDir ?: return@OnCreate
      val thumbDir = File(cacheDir, "video_thumbs")
      if (thumbDir.exists()) {
        val cutoff = System.currentTimeMillis() - 7 * 24 * 60 * 60 * 1000L
        thumbDir.listFiles()?.forEach { f ->
          if (f.lastModified() < cutoff) f.delete()
        }
      }
    }

    AsyncFunction("getVideoThumbnail") { uri: String ->
      // use Uri.parse instead of URLDecoder — handles paths with + correctly
      val parsedUri = android.net.Uri.parse(uri)
      if (parsedUri.scheme != "file") return@AsyncFunction null
      val path = parsedUri.path ?: return@AsyncFunction null

      val cacheDir = appContext.reactContext?.cacheDir ?: return@AsyncFunction null
      val thumbDir = File(cacheDir, "video_thumbs").also { it.mkdirs() }

      // MD5 instead of hashCode() — stable cache key with negligible collision risk
      val thumbFile = File(thumbDir, "${md5(uri)}.jpg")
      if (thumbFile.exists()) return@AsyncFunction "file://${thumbFile.absolutePath}"

      // explicit try/catch around thumbnail generation — corrupted videos return null cleanly
      val bitmap: Bitmap? = try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
          ThumbnailUtils.createVideoThumbnail(File(path), android.util.Size(128, 128), null)
        } else {
          @Suppress("DEPRECATION")
          ThumbnailUtils.createVideoThumbnail(path, MediaStore.Images.Thumbnails.MINI_KIND)
        }
      } catch (e: Exception) {
        null
      }

      if (bitmap == null) return@AsyncFunction null

      // Write to cache file — Glide loads natively, base64 never enters JS heap
      try {
        thumbFile.outputStream().use { out ->
          bitmap.compress(Bitmap.CompressFormat.JPEG, 80, out)
        }
      } finally {
        bitmap.recycle()
      }
      "file://${thumbFile.absolutePath}"
    }

    View(MediaGridView::class) {
      Prop("uris") { view: MediaGridView, uris: List<String> ->
        view.setUris(uris)
      }

      Prop("selectMode") { view: MediaGridView, selectMode: Boolean ->
        view.setSelectMode(selectMode)
      }

      Prop("category") { view: MediaGridView, category: String ->
        view.setCategory(category)
      }

      Prop("openingUri") { view: MediaGridView, openingUri: String ->
        view.setOpeningUri(openingUri)
      }

      Events("onItemPress", "onItemLongPress", "onSelectionChange")
    }
  }
}
