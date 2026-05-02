package com.askfiles.mobile.sharemodule

import android.content.Intent
import android.net.Uri
import androidx.core.content.FileProvider
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

class ShareModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ShareModule")

    AsyncFunction("shareFiles") { paths: List<String>, mimeType: String ->
      val activity = appContext.activityProvider?.currentActivity
        ?: throw Exception("No activity available")

      val contentUris = ArrayList<Uri>()
      for (path in paths) {
        val file = File(path)
        val uri = FileProvider.getUriForFile(
          appContext.reactContext!!,
          "${appContext.reactContext!!.packageName}.provider",
          file
        )
        contentUris.add(uri)
      }

      val intent = if (contentUris.size == 1) {
        Intent(Intent.ACTION_SEND).apply {
          type = mimeType
          putExtra(Intent.EXTRA_STREAM, contentUris[0])
          addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
      } else {
        Intent(Intent.ACTION_SEND_MULTIPLE).apply {
          type = "*/*"
          putParcelableArrayListExtra(Intent.EXTRA_STREAM, contentUris)
          addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
      }

      val chooser = Intent.createChooser(intent, "Share files")
      chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      activity.startActivity(chooser)
    }
  }
}
