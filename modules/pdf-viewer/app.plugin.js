const { withMainActivity, withAndroidManifest } = require("@expo/config-plugins");

module.exports = function withPdfViewer(config) {
  config = withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    const application = manifest.manifest.application?.[0];
    if (application) {
      application.activity = application.activity || [];
      const activity = application.activity[0];
      activity["$"] = activity["$"] || {};
      activity["$"]["android:launchMode"] = "singleTask";
      activity["intent-filter"] = activity["intent-filter"] || [];
      const hasPdfFilter = activity["intent-filter"].some(
        (f) => f.action?.some((a) => a["$"]["android:name"] === "android.intent.action.VIEW")
      );
      if (!hasPdfFilter) {
        activity["intent-filter"].push({
          action: [{ $: { "android:name": "android.intent.action.VIEW" } }],
          category: [{ $: { "android:name": "android.intent.category.DEFAULT" } }],
          data: [{ $: { "android:mimeType": "application/pdf" } }],
        });
      }
    }
    return config;
  });

  config = withMainActivity(config, (config) => {
    let src = config.modResults.contents;

    // Remove ALL old onNewIntent injections
    src = src.replace(/\s*override fun onNewIntent\(intent: Intent\)[\s\S]*?\n  \}\n/g, "\n");

    // Remove ALL old handler function injections
    src = src.replace(/\s*private fun handlePdfIntent[\s\S]*?\n  \}\n/g, "\n");
    src = src.replace(/\s*private fun handleCsvIntent[\s\S]*?\n  \}\n/g, "\n");
    src = src.replace(/\s*private fun handleTextIntent[\s\S]*?\n  \}\n/g, "\n");

    // Remove onCreate handler calls if already present
    src = src.replace(/\n    handlePdfIntent\(intent\)\n    handleCsvIntent\(intent\)\n    handleTextIntent\(intent\)/g, "");

    // Add import if missing
    if (!src.includes("import android.content.Intent")) {
      src = src.replace(/^package .*$/m, (m) => `${m}\n\nimport android.content.Intent`);
    }

    // Inject onCreate calls after super.onCreate(null)
    src = src.replace(
      /super\.onCreate\(null\)\n/,
      `super.onCreate(null)\n    handlePdfIntent(intent)\n    handleCsvIntent(intent)\n    handleTextIntent(intent)\n`
    );

    // Inject onNewIntent before invokeDefaultOnBackPressed
    const onNewIntent = `
  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    handlePdfIntent(intent)
    handleCsvIntent(intent)
    handleTextIntent(intent)
  }

`;
    src = src.replace(/(\s+override fun invokeDefaultOnBackPressed)/, `${onNewIntent}$1`);

    // Inject handler functions before closing brace
    const handlers = `
  private fun handlePdfIntent(intent: Intent?) {
    if (intent?.action == Intent.ACTION_VIEW) {
      val uri = intent?.data ?: return
      val mimeType = intent.type ?: contentResolver.getType(uri) ?: ""
      if (mimeType.contains("pdf") || uri.toString().endsWith(".pdf", ignoreCase = true)) {
        try { grantUriPermission(packageName, uri, android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION) } catch (e: Exception) {}
        getSharedPreferences("askfiles_prefs", android.content.Context.MODE_PRIVATE).edit().putString("pending_pdf_uri", uri.toString()).apply()
      }
    }
  }

  private fun handleCsvIntent(intent: Intent?) {
    if (intent?.action == Intent.ACTION_VIEW) {
      val uri = intent?.data ?: return
      val mimeType = intent.type ?: contentResolver.getType(uri) ?: ""
      if (mimeType.contains("csv") || uri.toString().endsWith(".csv", ignoreCase = true)) {
        try { grantUriPermission(packageName, uri, android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION) } catch (e: Exception) {}
        val displayName = uri.lastPathSegment?.substringAfterLast('/')?.substringAfterLast('%') ?: "file.csv"
        getSharedPreferences("askfiles_prefs", android.content.Context.MODE_PRIVATE).edit().putString("pending_csv_uri", uri.toString()).putString("pending_csv_name", displayName).apply()
      }
    }
  }

  private fun handleTextIntent(intent: Intent?) {
    if (intent?.action == Intent.ACTION_VIEW) {
      val uri = intent?.data ?: return
      val mimeType = intent.type ?: contentResolver.getType(uri) ?: ""
      if (mimeType.contains("text/plain") || uri.toString().endsWith(".txt", ignoreCase = true)) {
        try { grantUriPermission(packageName, uri, android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION) } catch (e: Exception) {}
        getSharedPreferences("askfiles_prefs", android.content.Context.MODE_PRIVATE).edit().putString("pending_text_uri", uri.toString()).apply()
      }
    }
  }
`;
    src = src.replace(/\n}\s*$/, `\n${handlers}\n}`);

    config.modResults.contents = src;
    return config;
  });

  return config;
};
