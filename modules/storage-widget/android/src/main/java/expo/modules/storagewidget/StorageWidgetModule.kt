package expo.modules.storagewidget

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.net.URL

class StorageWidgetModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("StorageWidget")

    Constant("PI") {
      Math.PI
    }

    Events("onChange")

    Function("hello") {
      "Hello world! 👋"
    }

    AsyncFunction("setValueAsync") { value: String ->
      sendEvent("onChange", mapOf("value" to value))
    }

    AsyncFunction("saveRecentsForWidget") { recentsJson: String ->
      val context = appContext.reactContext ?: return@AsyncFunction
      val appCtx = context.applicationContext

      // Save to SharedPreferences
      val prefs = appCtx.getSharedPreferences("askfiles_widget", android.content.Context.MODE_PRIVATE)
      prefs.edit().putString("recents", recentsJson).apply()

      // Send broadcast to widget receiver
      val intent = android.content.Intent("com.askfiles.mobile.UPDATE_WIDGET")
      intent.component = android.content.ComponentName(appCtx, "com.askfiles.mobile.StorageWidget")
      appCtx.sendBroadcast(intent)
    }

    View(StorageWidgetView::class) {
      Prop("url") { view: StorageWidgetView, url: URL ->
        view.webView.loadUrl(url.toString())
      }
      Events("onLoad")
    }
  }
}
