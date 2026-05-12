const { withMainActivity } = require('@expo/config-plugins');

module.exports = function withSmoothRotation(config) {
  return withMainActivity(config, (mod) => {
    let contents = mod.modResults.contents;

    // Only add if not already present
    if (contents.includes('onConfigurationChanged')) {
      return mod;
    }

    // Add the override before invokeDefaultOnBackPressed
    const anchor = '  override fun invokeDefaultOnBackPressed()';
    const insertion = `  override fun onConfigurationChanged(newConfig: android.content.res.Configuration) {
    super.onConfigurationChanged(newConfig)
    val rotation = windowManager.defaultDisplay.rotation
    val params = window.attributes
    window.attributes = params
  }

  `;

    contents = contents.replace(anchor, insertion + anchor);
    mod.modResults.contents = contents;
    return mod;
  });
};
