const { withMainActivity } = require('@expo/config-plugins');

module.exports = function withSmoothRotation(config) {
  return withMainActivity(config, (mod) => {
    let contents = mod.modResults.contents;

    // Avoid duplicate insertion
    if (contents.includes('onConfigurationChanged')) {
      return mod;
    }

    // Ensure we're working with Kotlin
    if (mod.modResults.language !== 'kt') {
      console.warn('MainActivity is not Kotlin. Skipping smooth rotation injection.');
      return mod;
    }

    // Find insertion point
    const anchor = 'override fun invokeDefaultOnBackPressed()';
    if (!contents.includes(anchor)) {
      console.warn(`Anchor "${anchor}" not found in MainActivity.kt`);
      return mod;
    }

    // Method to insert
    const insertion = `
    override fun onConfigurationChanged(newConfig: android.content.res.Configuration) {
        super.onConfigurationChanged(newConfig)
        val rotation = windowManager.defaultDisplay.rotation
        val params = window.attributes
        window.attributes = params
    }
    `;

    // Insert before the anchor method
    contents = contents.replace(anchor, insertion + '\n    ' + anchor);

    mod.modResults.contents = contents;
    return mod;
  });
};
