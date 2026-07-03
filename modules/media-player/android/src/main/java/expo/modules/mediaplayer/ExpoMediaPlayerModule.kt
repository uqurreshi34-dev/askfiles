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
      Prop("speed") { view: ExpoMediaPlayerView, speed: Float ->
        view.setSpeed(speed)
      }
      Prop("seekTo") { view: ExpoMediaPlayerView, position: Int? ->
        position?.let { view.seekTo(it) }
      }
      Events("onTap", "onComplete", "onError", "onPlayingStateChange", "onProgress", "onSeek")
    }
  }
}
