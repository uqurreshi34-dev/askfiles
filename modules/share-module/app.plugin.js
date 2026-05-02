const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withShareModule(config) {
  return withAndroidManifest(config, async (config) => {
    const manifest = config.modResults;
    const app = manifest.manifest.application[0];

    if (!app.provider) app.provider = [];

    const providerExists = app.provider.some(
      (p) => p.$['android:authorities'] === `${config.android.package}.provider`
    );

    if (!providerExists) {
      app.provider.push({
        $: {
          'android:name': 'androidx.core.content.FileProvider',
          'android:authorities': `${config.android.package}.provider`,
          'android:exported': 'false',
          'android:grantUriPermissions': 'true',
        },
        'meta-data': [
          {
            $: {
              'android:name': 'android.support.FILE_PROVIDER_PATHS',
              'android:resource': '@xml/file_provider_paths',
            },
          },
        ],
      });
    }

    return config;
  });
};
