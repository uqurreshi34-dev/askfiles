package expo.modules.mediaplayer

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ExpoMediaPlayerModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("MediaPlayer")

    View(ExpoMediaPlayerView::class) {
      Prop("uri") { view: ExpoMediaPlayerView, uri: String ->
        view.setUri(uri)
      }
      Prop("paused") { view: ExpoMediaPlayerView, paused: Boolean ->
        view.setPaused(paused)
      }
      Events("onTap", "onComplete", "onError")
    }
  }
}
