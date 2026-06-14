package expo.modules.mediaslideshow

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class MediaSlideshowModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("MediaSlideshow")

    View(MediaSlideshowView::class) {
      Prop("uris") { view: MediaSlideshowView, uris: List<String> ->
        view.setUris(uris)
      }

      Prop("currentIndex") { view: MediaSlideshowView, index: Int ->
        view.setCurrentIndex(index)
      }

      Events("onImagePress")
    }
  }
}
