const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

function withFileProviderPaths(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const xmlDir = path.join(config.modRequest.platformProjectRoot, 'app/src/main/res/xml');
      if (!fs.existsSync(xmlDir)) fs.mkdirSync(xmlDir, { recursive: true });
      const src = path.join(__dirname, 'android-assets', 'file_provider_paths.xml');
      const dest = path.join(xmlDir, 'file_provider_paths.xml');
      fs.copyFileSync(src, dest);
      return config;
    },
  ]);
}

function withFileProviderManifest(config) {
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
        'meta-data': [{
          $: {
            'android:name': 'android.support.FILE_PROVIDER_PATHS',
            'android:resource': '@xml/file_provider_paths',
          },
        }],
      });
    }
    return config;
  });
}

module.exports = function withShareModule(config) {
  config = withFileProviderPaths(config);
  config = withFileProviderManifest(config);
  return config;
};
