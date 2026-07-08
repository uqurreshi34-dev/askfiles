const { withMainActivity, withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withPdfViewer(config) {
  config = withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    const application = manifest.manifest.application[0];
    const activity = application.activity.find(
      (a) => a.$['android:name'] === '.MainActivity'
    );

    if (!activity) return config;
    if (!activity['intent-filter']) activity['intent-filter'] = [];

    const alreadyAdded = activity['intent-filter'].some((f) =>
      f?.data?.some((d) => d?.$?.['android:mimeType'] === 'application/pdf')
    );

    if (!alreadyAdded) {
      activity['intent-filter'].push({
        action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
        category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
        data: [{ $: { 'android:mimeType': 'application/pdf' } }],
      });
    }

    return config;
  });

  config = withMainActivity(config, (config) => {
    let src = config.modResults.contents;

    // Remove old nullable version if present
    src = src.replace(
      `override fun onNewIntent(intent: Intent?) {
    super.onNewIntent(intent)
    setIntent(intent)
    handlePdfIntent(intent)
  }

  override fun invokeDefaultOnBackPressed()`,
      'override fun invokeDefaultOnBackPressed()'
    );

    // Add correct non-nullable version
    if (!src.includes('onNewIntent')) {
      src = src.replace(
        'override fun invokeDefaultOnBackPressed()',
        `override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    handlePdfIntent(intent)
  }

  override fun invokeDefaultOnBackPressed()`
      );
    }

    config.modResults.contents = src;
    return config;
  });

  return config;
};
