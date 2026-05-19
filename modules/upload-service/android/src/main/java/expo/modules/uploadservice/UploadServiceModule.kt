package expo.modules.uploadservice

import android.content.Intent
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class UploadServiceModule : Module() {
    override fun definition() = ModuleDefinition {
        Name("UploadService")

        Function("startService") { message: String ->
            val context = appContext.reactContext
            if (context != null) {
                val intent = Intent(context, UploadForegroundService::class.java).apply {
                    action = UploadForegroundService.ACTION_START
                    putExtra(UploadForegroundService.EXTRA_MESSAGE, message)
                }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(intent)
                } else {
                    context.startService(intent)
                }
            }
        }

        Function("updateService") { message: String ->
            val context = appContext.reactContext
            if (context != null) {
                val intent = Intent(context, UploadForegroundService::class.java).apply {
                    action = UploadForegroundService.ACTION_UPDATE
                    putExtra(UploadForegroundService.EXTRA_MESSAGE, message)
                }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(intent)
                } else {
                    context.startService(intent)
                }
            }
        }

        Function("stopService") { ->
            val context = appContext.reactContext
            if (context != null) {
                val intent = Intent(context, UploadForegroundService::class.java).apply {
                    action = UploadForegroundService.ACTION_STOP
                }
                context.startService(intent)
            }
            Unit
        }
    }
}
