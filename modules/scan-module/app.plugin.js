const { withMainActivity, withAndroidManifest } = require('@expo/config-plugins');

// Step 1: Add CAMERA permission to AndroidManifest
function withCameraPermission(config) {
  return withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;
    if (!manifest['uses-permission']) manifest['uses-permission'] = [];

    const alreadyAdded = manifest['uses-permission'].some(
      (p) => p.$?.['android:name'] === 'android.permission.CAMERA'
    );

    if (!alreadyAdded) {
      manifest['uses-permission'].push({
        $: { 'android:name': 'android.permission.CAMERA' },
      });
    }

    return mod;
  });
}

// Step 2: Patch MainActivity.kt to register ActivityResultLauncher for ML Kit scanner
function withScannerActivity(config) {
  return withMainActivity(config, (mod) => {
    let contents = mod.modResults.contents;

    if (mod.modResults.language !== 'kt') {
      console.warn('MainActivity is not Kotlin. Skipping scan-module injection.');
      return mod;
    }

    // Avoid duplicate insertion
    if (contents.includes('ScanModule.scanLauncher')) {
      return mod;
    }

    // Add imports after the last existing import
    const importAnchor = 'import expo.modules.ReactActivityDelegateWrapper';
    if (!contents.includes(importAnchor)) {
      console.warn('scan-module: import anchor not found in MainActivity.kt');
      return mod;
    }

    const imports = `
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.result.IntentSenderRequest
import expo.modules.scanmodule.ScanModule`;

    contents = contents.replace(importAnchor, importAnchor + imports);

    // Register launcher in onCreate, after super.onCreate(null)
    const onCreateAnchor = 'super.onCreate(null)';
    if (!contents.includes(onCreateAnchor)) {
      console.warn('scan-module: onCreate anchor not found in MainActivity.kt');
      return mod;
    }

    const launcherRegistration = `

    // Register ML Kit Document Scanner result launcher
    ScanModule.scanLauncher = registerForActivityResult(
      ActivityResultContracts.StartIntentSenderForResult()
    ) { result ->
      ScanModule.handleActivityResult(result)
    }`;

    contents = contents.replace(
      onCreateAnchor,
      onCreateAnchor + launcherRegistration
    );

    mod.modResults.contents = contents;
    return mod;
  });
}

module.exports = function withScanModule(config) {
  config = withCameraPermission(config);
  config = withScannerActivity(config);
  return config;
};
