package expo.modules.mediaviewer

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class MediaViewerModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("MediaViewer")

    View(MediaViewerView::class) {
      Prop("uri") { view: MediaViewerView, uri: String ->
        view.setUri(uri)
      }
      Events("onTap", "onSwipeNext", "onSwipePrevious")
    }
  }
}
