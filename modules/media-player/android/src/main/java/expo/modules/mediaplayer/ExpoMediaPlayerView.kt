package expo.modules.mediaplayer

import android.content.Context
import android.graphics.SurfaceTexture
import android.media.AudioManager
import android.media.MediaPlayer
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.view.GestureDetector
import android.view.Gravity
import android.view.MotionEvent
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
    private var seeking = false

    private var currentUri: String? = null
    private var pendingPaused: Boolean = false
    private var mediaPlayer: MediaPlayer? = null
    private var surfaceTexture: SurfaceTexture? = null
    private var videoWidth = 0
    private var videoHeight = 0
    private val progressHandler = Handler(Looper.getMainLooper())
    private var progressRunnable: Runnable? = null
    private val onProgress by EventDispatcher()
    private val onSeek by EventDispatcher()
    private val mainHandler = Handler(Looper.getMainLooper())
    // Bumped on every load and release, so a load that finishes after the
    // view has moved on is thrown away instead of playing over the new one.
    private var loadToken = 0

    private val gestureDetector = GestureDetector(context, object : GestureDetector.SimpleOnGestureListener() {
        override fun onSingleTapConfirmed(e: MotionEvent): Boolean {
            onTap(mapOf<String, Any>())
            return true
        }
        override fun onDoubleTap(e: MotionEvent): Boolean {
            val mp = mediaPlayer ?: return true
            val viewWidth = textureView.width
            val seekMs = if (e.x < viewWidth / 2) -10000 else 10000
            val newPos = (mp.currentPosition + seekMs).coerceIn(0, mp.duration)
            seeking = true
            mp.seekTo(newPos)
            // The direction is known here and nowhere else. Without it JS
            // compares position before and after, but it has already
            // updated its own position by then, so every skip looked
            // backwards.
            onSeek(mapOf(
                "position" to newPos,
                "duration" to mp.duration,
                "skip" to if (seekMs < 0) "back" else "forward"
            ))
            return true
        }
    })

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
        textureView.setOnTouchListener { _, event ->
            gestureDetector.onTouchEvent(event)
            true
        }

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

        val texture = surfaceTexture ?: run { releaseAudioFocus(); return }
        val token = ++loadToken

        // Made on the main thread so its callbacks still arrive there, as before.
        val mp = MediaPlayer()
        mp.setOnPreparedListener { player ->
            if (token != loadToken) return@setOnPreparedListener
            player.isLooping = false
            videoWidth = player.videoWidth
            videoHeight = player.videoHeight
            textureView.requestLayout()
            if (!pendingPaused) { player.start(); onPlayingStateChange(mapOf("isPlaying" to true, "duration" to player.duration)) }
        }
        mp.setOnCompletionListener {
            if (token != loadToken) return@setOnCompletionListener
            releaseAudioFocus()
            onComplete(mapOf<String, Any>())
        }
        mp.setOnErrorListener { _, what, extra ->
            if (token != loadToken) return@setOnErrorListener true
            releaseAudioFocus()
            onError(mapOf("what" to what, "extra" to extra))
            true
        }
        mp.setOnSeekCompleteListener { seeking = false }

        // setDataSource waits on the system media service, which can take
        // seconds on a busy phone. Run inside the draw pass it froze the
        // screen, so it runs on the loader thread instead.
        loadExecutor.execute {
            val loaded = try {
                val surface = Surface(texture)
                mp.setSurface(surface)
                surface.release()
                mp.setDataSource(context, Uri.parse("file://$decoded"))
                mp.prepareAsync()
                true
            } catch (e: Exception) {
                false
            }
            mainHandler.post {
                if (token != loadToken) {
                    // New video, surface gone or view detached while this loaded.
                    try { mp.release() } catch (_: Exception) {}
                    return@post
                }
                if (!loaded) {
                    // Missing or unreadable file: setDataSource throws and the error listener never fires.
                    try { mp.release() } catch (_: Exception) {}
                    releaseAudioFocus()
                    onError(mapOf("what" to -1, "extra" to -1))
                    return@post
                }
                mediaPlayer = mp
                startProgressTicker()
            }
        }
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

    private fun startProgressTicker() {
        stopProgressTicker()
        val runnable = object : Runnable {
            override fun run() {
                val mp = mediaPlayer ?: return
                try {
                    if (mp.isPlaying) {
                        if (!seeking) {
                            onProgress(mapOf("position" to mp.currentPosition, "duration" to mp.duration))
                        }
                    }
                } catch (e: Exception) {}
                progressHandler.postDelayed(this, 500)
            }
        }
        progressRunnable = runnable
        progressHandler.post(runnable)
    }

    private fun stopProgressTicker() {
        progressRunnable?.let { progressHandler.removeCallbacks(it) }
        progressRunnable = null
    }

    fun seekTo(positionMs: Int) {
        val mp = mediaPlayer ?: return
        val clamped = positionMs.coerceIn(0, mp.duration)
        seeking = true
        mp.seekTo(clamped)
        onSeek(mapOf("position" to clamped, "duration" to mp.duration))
    }

    private fun releasePlayer() {
        loadToken++
        stopProgressTicker()
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

    companion object {
        // One shared loader thread for every player view; loads stay in order.
        private val loadExecutor = java.util.concurrent.Executors.newSingleThreadExecutor { r ->
            Thread(r, "AskFilesMediaLoader").apply { isDaemon = true }
        }
    }
}
