package expo.modules.filestats

import android.content.Context
import android.content.SharedPreferences
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject

class FileStatsModule : Module() {

  private val prefs: SharedPreferences by lazy {
    appContext.reactContext!!.getSharedPreferences("askfiles_file_stats", Context.MODE_PRIVATE)
  }

  override fun definition() = ModuleDefinition {
    Name("FileStats")

    // Called every time a file is opened — fire and forget from JS
    AsyncFunction("recordOpen") { uri: String ->
      val existing = prefs.getString(uri, null)
      val count: Int
      val firstOpened: Long
      val now = System.currentTimeMillis()

      if (existing != null) {
        val obj = JSONObject(existing)
        count = obj.getInt("count") + 1
        firstOpened = obj.getLong("firstOpened")
      } else {
        count = 1
        firstOpened = now
      }

      val obj = JSONObject()
      obj.put("count", count)
      obj.put("firstOpened", firstOpened)
      obj.put("lastOpened", now)

      prefs.edit().putString(uri, obj.toString()).apply()
    }

    // Synchronous read — returns map with count, firstOpened, lastOpened
    // Returns null if file has never been opened
    Function("getStats") { uri: String ->
      val raw = prefs.getString(uri, null) ?: return@Function null
      val obj = JSONObject(raw)
      mapOf(
        "count" to obj.getInt("count"),
        "firstOpened" to obj.getLong("firstOpened"),
        "lastOpened" to obj.getLong("lastOpened")
      )
    }

    // Called when a file is deleted/moved — clean up its stats
    AsyncFunction("removeStats") { uri: String ->
      prefs.edit().remove(uri).apply()
    }
  }
}
