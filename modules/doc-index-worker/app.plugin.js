const { withAndroidManifest, withAppBuildGradle, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// Step 1 — Copy DocIndexWorker.kt and patch MainApplication.kt
function withDocIndexWorkerFiles(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const javaDir = path.join(projectRoot, 'android', 'app', 'src', 'main', 'java', 'com', 'askfiles', 'mobile');
      const src = path.join(projectRoot, 'modules', 'doc-index-worker', 'android-assets', 'DocIndexWorker.kt');
      const dst = path.join(javaDir, 'DocIndexWorker.kt');

      // Copy DocIndexWorker.kt
      console.log('DocIndexWorker src:', src);
      console.log('DocIndexWorker src exists:', fs.existsSync(src));
      console.log('DocIndexWorker dst:', dst);
      if (fs.existsSync(src)) {
        fs.mkdirSync(path.dirname(dst), { recursive: true });
        fs.copyFileSync(src, dst);
        console.log('DocIndexWorker copied successfully');
      } else {
        console.log('DocIndexWorker source NOT FOUND');
      }

      // Patch MainApplication.kt
      const mainAppPath = path.join(javaDir, 'MainApplication.kt');
      if (fs.existsSync(mainAppPath)) {
        let contents = fs.readFileSync(mainAppPath, 'utf8');

        // Add import if not present
        if (!contents.includes('import androidx.work.WorkManager')) {
          contents = contents.replace(
            'import expo.modules.ApplicationLifecycleDispatcher',
            'import androidx.work.WorkManager\nimport expo.modules.ApplicationLifecycleDispatcher'
          );
        }

        // Add schedule call if not present
        if (!contents.includes('DocIndexWorker.schedule(this)')) {
          contents = contents.replace(
            'ApplicationLifecycleDispatcher.onApplicationCreate(this)',
            'ApplicationLifecycleDispatcher.onApplicationCreate(this)\n    DocIndexWorker.schedule(this)'
          );
        }

        fs.writeFileSync(mainAppPath, contents);
      }

      return config;
    },
  ]);
}

// Step 2 — Add WorkManager to build.gradle
function withWorkManagerDependency(config) {
  return withAppBuildGradle(config, (config) => {
    if (!config.modResults.contents.includes('work-runtime-ktx')) {
      config.modResults.contents = config.modResults.contents.replace(
        'implementation("com.facebook.react:hermes-android")',
        'implementation("com.facebook.react:hermes-android")\n    implementation "androidx.work:work-runtime-ktx:2.9.0"'
      );
    }
    return config;
  });
}

function withWorkManagerManifest(config) {
    return withAndroidManifest(config, (config) => {
      const manifest = config.modResults;
      const application = manifest.manifest.application[0];
      
      if (!application.service) {
        application.service = [];
      }
      
      const alreadyAdded = application.service.some(
        (s) => s.$?.['android:name'] === 'androidx.work.impl.foreground.SystemForegroundService'
      );
      
      if (!alreadyAdded) {
        application.service.push({
          $: {
            'android:name': 'androidx.work.impl.foreground.SystemForegroundService',
            'android:foregroundServiceType': 'dataSync',
            'tools:node': 'merge',
          },
        });
      }
      
      return config;
    });
  }

  module.exports = function withDocIndexWorker(config) {
    config = withDocIndexWorkerFiles(config);
    config = withWorkManagerDependency(config);
    config = withWorkManagerManifest(config);
    return config;
  };
