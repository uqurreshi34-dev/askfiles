package expo.modules.mediaplayer

import android.content.Context
import android.graphics.SurfaceTexture
import android.media.AudioManager
import android.media.MediaPlayer
import android.net.Uri
import android.view.Gravity
import android.view.Surface
import android.view.TextureView
import android.widget.FrameLayout
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView

class ExpoMediaPlayerView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {

    private val onTap by EventDispatcher()
    private val onComplete by EventDispatcher()
    private val onError by EventDispatcher()
    private val onPlayingStateChange by EventDispatcher()

    private var currentUri: String? = null
    private var pendingPaused: Boolean = false
    private var mediaPlayer: MediaPlayer? = null
    private var surfaceTexture: SurfaceTexture? = null
    private var videoWidth = 0
    private var videoHeight = 0

    @Suppress("DEPRECATION")
    private val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    private val audioFocusListener = AudioManager.OnAudioFocusChangeListener { focusChange ->
        when (focusChange) {
            AudioManager.AUDIOFOCUS_LOSS,
            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> {
                mediaPlayer?.let { if (it.isPlaying) it.pause() }
            }
            AudioManager.AUDIOFOCUS_GAIN -> {
                // Don't auto-resume — let user tap to play again
            }
        }
    }

    private val lifecycleCallbacks = object : android.app.Application.ActivityLifecycleCallbacks {
        override fun onActivityPaused(activity: android.app.Activity) {
            mediaPlayer?.let { 
                if (it.isPlaying) { 
                    it.pause()
                    onPlayingStateChange(mapOf("isPlaying" to false))
                } 
            }
        }
        override fun onActivityResumed(activity: android.app.Activity) {}
        override fun onActivityCreated(activity: android.app.Activity, bundle: android.os.Bundle?) {}
        override fun onActivityStarted(activity: android.app.Activity) {}
        override fun onActivityStopped(activity: android.app.Activity) {}
        override fun onActivitySaveInstanceState(activity: android.app.Activity, bundle: android.os.Bundle) {}
        override fun onActivityDestroyed(activity: android.app.Activity) {}
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        appContext.activityProvider?.currentActivity?.application
            ?.registerActivityLifecycleCallbacks(lifecycleCallbacks)
    }

    private inner class AspectTextureView(context: Context) : TextureView(context) {
        override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
            if (videoWidth > 0 && videoHeight > 0) {
                val vw = MeasureSpec.getSize(widthMeasureSpec)
                val vh = MeasureSpec.getSize(heightMeasureSpec)
                val scale = minOf(vw.toFloat() / videoWidth, vh.toFloat() / videoHeight)
                setMeasuredDimension(
                    (videoWidth * scale).toInt(),
                    (videoHeight * scale).toInt()
                )
            } else {
                super.onMeasure(widthMeasureSpec, heightMeasureSpec)
            }
        }
    }

    private val textureView = AspectTextureView(context)
    private val container = FrameLayout(context).apply {
        setBackgroundColor(android.graphics.Color.BLACK)
    }

    init {
        textureView.surfaceTextureListener = object : TextureView.SurfaceTextureListener {
            override fun onSurfaceTextureAvailable(surface: SurfaceTexture, width: Int, height: Int) {
                surfaceTexture = surface
                currentUri?.let { loadVideo(it) }
            }
            override fun onSurfaceTextureSizeChanged(surface: SurfaceTexture, width: Int, height: Int) {
                textureView.requestLayout()
            }
            override fun onSurfaceTextureDestroyed(surface: SurfaceTexture): Boolean {
                releasePlayer()
                surfaceTexture = null
                return true
            }
            override fun onSurfaceTextureUpdated(surface: SurfaceTexture) {}
        }
        textureView.setOnClickListener { onTap(mapOf<String, Any>()) }

        val lp = FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.WRAP_CONTENT,
            FrameLayout.LayoutParams.WRAP_CONTENT
        ).apply { gravity = Gravity.CENTER }

        container.addView(textureView, lp)
        setBackgroundColor(android.graphics.Color.BLACK)
        addView(container, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
    }

    fun setUri(uri: String) {
        if (uri == currentUri) return
        currentUri = uri
        surfaceTexture?.let { loadVideo(uri) }
    }

    private fun loadVideo(uri: String) {
        releasePlayer()

        @Suppress("DEPRECATION")
        audioManager.requestAudioFocus(
            audioFocusListener,
            AudioManager.STREAM_MUSIC,
            AudioManager.AUDIOFOCUS_GAIN
        )

        val decoded = try {
            java.net.URLDecoder.decode(uri.removePrefix("file://"), "UTF-8")
        } catch (e: Exception) {
            uri.removePrefix("file://")
        }

        val mp = MediaPlayer()
        val surface = Surface(surfaceTexture)
        mp.setSurface(surface)
        surface.release()
        mp.setDataSource(context, Uri.parse("file://$decoded"))
        mp.setOnPreparedListener { player ->
            player.isLooping = false
            videoWidth = player.videoWidth
            videoHeight = player.videoHeight
            textureView.requestLayout()
            if (!pendingPaused) { player.start(); onPlayingStateChange(mapOf("isPlaying" to true, "duration" to player.duration)) }
        }
        mp.setOnCompletionListener {
            releaseAudioFocus()
            onComplete(mapOf<String, Any>())
        }
        mp.setOnErrorListener { _, what, extra ->
            releaseAudioFocus()
            onError(mapOf("what" to what, "extra" to extra))
            true
        }
        mp.prepareAsync()
        mediaPlayer = mp
    }

    fun setPaused(paused: Boolean) {
        pendingPaused = paused
        val mp = mediaPlayer ?: return
        if (paused) {
            if (mp.isPlaying) { mp.pause(); onPlayingStateChange(mapOf("isPlaying" to false, "duration" to mp.duration)) }
        } else {
            if (!mp.isPlaying) { mp.start(); onPlayingStateChange(mapOf("isPlaying" to true)) }
        }
    }

    fun setSpeed(speed: Float) {
        val mp = mediaPlayer ?: return
        try {
            val params = mp.playbackParams
            params.speed = speed
            mp.playbackParams = params
        } catch (e: Exception) {}
    }

    private fun releasePlayer() {
        mediaPlayer?.let {
            try {
                if (it.isPlaying) it.stop()
                it.reset()
                it.release()
            } catch (e: Exception) {}
        }
        mediaPlayer = null
    }

    @Suppress("DEPRECATION")
    private fun releaseAudioFocus() {
        audioManager.abandonAudioFocus(audioFocusListener)
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        appContext.activityProvider?.currentActivity?.application
            ?.unregisterActivityLifecycleCallbacks(lifecycleCallbacks)
        releasePlayer()
        releaseAudioFocus()
        currentUri = null
    }
}
