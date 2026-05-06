package expo.modules.storagewidget

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.net.URL

class StorageWidgetModule : Module() {
  // Each module class must implement the definition function. The definition consists of components
  // that describes the module's functionality and behavior.
  // See https://docs.expo.dev/modules/module-api for more details about available components.
  override fun definition() = ModuleDefinition {
    // Sets the name of the module that JavaScript code will use to refer to the module. Takes a string as an argument.
    // Can be inferred from module's class name, but it's recommended to set it explicitly for clarity.
    // The module will be accessible from `requireNativeModule('StorageWidget')` in JavaScript.
    Name("StorageWidget")

    // Defines constant property on the module.
    Constant("PI") {
      Math.PI
    }

    // Defines event names that the module can send to JavaScript.
    Events("onChange")

    // Defines a JavaScript synchronous function that runs the native code on the JavaScript thread.
    Function("hello") {
      "Hello world! 👋"
    }

    // Defines a JavaScript function that always returns a Promise and whose native code
    // is by default dispatched on the different thread than the JavaScript runtime runs on.
    AsyncFunction("setValueAsync") { value: String ->
      // Send an event to JavaScript.
      sendEvent("onChange", mapOf(
        "value" to value
      ))
    }

    AsyncFunction("saveRecentsForWidget") { recentsJson: String ->
      val context = appContext.reactContext ?: return@AsyncFunction
      val prefs = context.getSharedPreferences("askfiles_widget", android.content.Context.MODE_PRIVATE)
      prefs.edit().putString("recents", recentsJson).apply()

      // Trigger widget update
      val manager = android.appwidget.AppWidgetManager.getInstance(context)
      val ids = manager.getAppWidgetIds(
          android.content.ComponentName(context, "com.askfiles.mobile.StorageWidget")
        )
      if (ids.isNotEmpty()) {
        // Force a broadcast to update all widget instances
        val intent = android.content.Intent(android.appwidget.AppWidgetManager.ACTION_APPWIDGET_UPDATE)
        intent.putExtra(android.appwidget.AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
        intent.setPackage(context.packageName)
        context.sendBroadcast(intent)
      }
    }

    // Enables the module to be used as a native view. Definition components that are accepted as part of
    // the view definition: Prop, Events.
    View(StorageWidgetView::class) {
      // Defines a setter for the `url` prop.
      Prop("url") { view: StorageWidgetView, url: URL ->
        view.webView.loadUrl(url.toString())
      }
      // Defines an event that the view can send to JavaScript.
      Events("onLoad")
    }
  }
}
