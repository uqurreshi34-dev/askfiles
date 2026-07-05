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
      Prop("prevUri") { view: MediaViewerView, uri: String -> view.setPrevUri(uri) }
      Prop("nextUri") { view: MediaViewerView, uri: String -> view.setNextUri(uri) }
      Events("onTap", "onSwipeNext", "onSwipePrevious")
    }
  }
}
