// Note: Google Play may warn about BOOT_COMPLETED for dataSync foreground services.
// This app does NOT use BOOT_COMPLETED — service is only started by user-initiated backup.
// Warning is a false positive from Google's static analyser.

const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withUploadService(config) {
  return withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults;
    const application = manifest.manifest.application[0];

    if (!application.service) application.service = [];

    const alreadyAdded = application.service.some(
      s => s.$?.['android:name'] === '.uploadservice.UploadForegroundService'
    );

    if (!alreadyAdded) {
      application.service.push({
        $: {
          'android:name': 'expo.modules.uploadservice.UploadForegroundService',
          'android:foregroundServiceType': 'dataSync',
          'android:exported': 'false',
        },
      });
    }

    // Add FOREGROUND_SERVICE permission if not present
    if (!manifest.manifest['uses-permission']) {
      manifest.manifest['uses-permission'] = [];
    }
    const hasPermission = manifest.manifest['uses-permission'].some(
      p => p.$?.['android:name'] === 'android.permission.FOREGROUND_SERVICE'
    );
    if (!hasPermission) {
      manifest.manifest['uses-permission'].push({
        $: { 'android:name': 'android.permission.FOREGROUND_SERVICE' },
      });
    }

    const hasDataSync = manifest.manifest['uses-permission'].some(
      p => p.$?.['android:name'] === 'android.permission.FOREGROUND_SERVICE_DATA_SYNC'
    );
    if (!hasDataSync) {
      manifest.manifest['uses-permission'].push({
        $: { 'android:name': 'android.permission.FOREGROUND_SERVICE_DATA_SYNC' },
      });
    }

    return mod;
  });
};
