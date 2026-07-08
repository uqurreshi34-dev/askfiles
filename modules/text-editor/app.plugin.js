const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withTextEditor(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    const application = manifest.manifest.application[0];
    const activity = application.activity.find(
      (a) => a.$['android:name'] === '.MainActivity'
    );

    if (!activity) return config;
    if (!activity['intent-filter']) activity['intent-filter'] = [];

    const alreadyAdded = activity['intent-filter'].some((f) =>
      f?.data?.some((d) => d?.$?.['android:mimeType'] === 'text/plain')
    );

    if (!alreadyAdded) {
      activity['intent-filter'].push({
        action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
        category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
        data: [{ $: { 'android:mimeType': 'text/plain' } }],
      });
    }

    return config;
  });
};
