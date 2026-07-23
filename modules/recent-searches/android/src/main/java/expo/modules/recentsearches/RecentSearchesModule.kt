package expo.modules.recentsearches

import android.content.Context
import android.content.SharedPreferences
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONArray
import org.json.JSONObject

class RecentSearchesModule : Module() {

  private val prefs: SharedPreferences by lazy {
    appContext.reactContext!!.getSharedPreferences("askfiles_recent_searches", Context.MODE_PRIVATE)
  }

  private val KEY = "queries"
  private val MAX = 10

  private fun read(): JSONArray {
    val raw = prefs.getString(KEY, null) ?: return JSONArray()
    return try { JSONArray(raw) } catch (_: Exception) { JSONArray() }
  }

  private fun write(arr: JSONArray) {
    prefs.edit().putString(KEY, arr.toString()).apply()
  }

  override fun definition() = ModuleDefinition {
    Name("RecentSearches")

    // Add or bump a query. Case-insensitive dedup, newest first, capped at MAX.
    AsyncFunction("add") { query: String ->
      val trimmed = query.trim()
      if (trimmed.isEmpty()) return@AsyncFunction

      val existing = read()
      val out = JSONArray()

      // new entry first
      out.put(JSONObject().apply {
        put("query", trimmed)
        put("searchedAt", System.currentTimeMillis())
      })

      // then the rest, skipping any case-insensitive match of the new query, capped
      for (i in 0 until existing.length()) {
        if (out.length() >= MAX) break
        val obj = existing.getJSONObject(i)
        val q = obj.optString("query")
        if (q.equals(trimmed, ignoreCase = true)) continue
        out.put(obj)
      }

      write(out)
    }

    // Synchronous read — newest first.
    Function("getAll") {
      val arr = read()
      val result = mutableListOf<Map<String, Any>>()
      for (i in 0 until arr.length()) {
        val obj = arr.getJSONObject(i)
        result.add(mapOf(
          "query" to obj.optString("query"),
          "searchedAt" to obj.optLong("searchedAt")
        ))
      }
      result
    }

    // Remove one query (case-insensitive).
    AsyncFunction("remove") { query: String ->
      val existing = read()
      val out = JSONArray()
      for (i in 0 until existing.length()) {
        val obj = existing.getJSONObject(i)
        if (obj.optString("query").equals(query.trim(), ignoreCase = true)) continue
        out.put(obj)
      }
      write(out)
    }

    AsyncFunction("clear") {
      prefs.edit().remove(KEY).apply()
    }
  }
}
