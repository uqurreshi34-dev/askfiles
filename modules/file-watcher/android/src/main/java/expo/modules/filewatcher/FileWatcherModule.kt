package expo.modules.filewatcher

import android.database.ContentObserver
import android.net.Uri
import android.os.Build
import android.os.FileObserver
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

class FileWatcherModule : Module() {

    private val observers = mutableMapOf<String, FileObserver>()
    private val contentObservers = mutableListOf<ContentObserver>()
    private val handler = Handler(Looper.getMainLooper())

    override fun definition() = ModuleDefinition {
        Name("FileWatcher")

        Events("onFileChange", "onMediaStoreChange")

        Function("startWatching") { path: String ->
            if (observers.containsKey(path)) return@Function

            val mask = FileObserver.CREATE or
                    FileObserver.DELETE or
                    FileObserver.MOVED_FROM or
                    FileObserver.MOVED_TO or
                    FileObserver.CLOSE_WRITE

            val observer = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                object : FileObserver(File(path), mask) {
                    override fun onEvent(event: Int, file: String?) {
                        sendEvent("onFileChange", mapOf(
                            "path" to path,
                            "file" to (file ?: ""),
                            "event" to eventName(event)
                        ))
                    }
                }
            } else {
                @Suppress("DEPRECATION")
                object : FileObserver(path, mask) {
                    override fun onEvent(event: Int, file: String?) {
                        sendEvent("onFileChange", mapOf(
                            "path" to path,
                            "file" to (file ?: ""),
                            "event" to eventName(event)
                        ))
                    }
                }
            }

            observer.startWatching()
            observers[path] = observer
        }

        Function("stopWatching") { path: String ->
            observers[path]?.stopWatching()
            observers.remove(path)
        }

        Function("stopAll") {
            observers.values.forEach { it.stopWatching() }
            observers.clear()
        }

        AsyncFunction("startMediaStoreObserver") {
            val context = appContext.reactContext
            if (context != null) {
                val uris = listOf(
                    MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                    MediaStore.Video.Media.EXTERNAL_CONTENT_URI,
                    MediaStore.Audio.Media.EXTERNAL_CONTENT_URI,
                    MediaStore.Downloads.EXTERNAL_CONTENT_URI,
                )
                for (uri in uris) {
                    val observer = object : ContentObserver(handler) {
                        override fun onChange(selfChange: Boolean, changedUri: Uri?) {
                            sendEvent("onMediaStoreChange", mapOf(
                                "uri" to (changedUri?.toString() ?: uri.toString())
                            ))
                        }
                    }
                    context.contentResolver.registerContentObserver(uri, true, observer)
                    contentObservers.add(observer)
                }
            }
        }

        AsyncFunction("stopMediaStoreObserver") {
            val context = appContext.reactContext
            if (context != null) {
                for (observer in contentObservers) {
                    context.contentResolver.unregisterContentObserver(observer)
                }
                contentObservers.clear()
            }
        }
    }

    private fun eventName(event: Int): String = when (event and FileObserver.ALL_EVENTS) {
        FileObserver.CREATE -> "CREATE"
        FileObserver.DELETE -> "DELETE"
        FileObserver.MOVED_FROM -> "DELETE"
        FileObserver.MOVED_TO -> "CREATE"
        FileObserver.CLOSE_WRITE -> "MODIFY"
        else -> "UNKNOWN"
    }
}
