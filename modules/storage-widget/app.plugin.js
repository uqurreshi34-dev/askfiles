const { withAndroidManifest } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

module.exports = function withStorageWidget(config) {
  return withAndroidManifest(config, async (config) => {
    const projectRoot = config.modRequest.projectRoot;

    const srcDir = path.join(projectRoot, 'modules', 'storage-widget', 'android-assets');
    const resDir = path.join(projectRoot, 'android', 'app', 'src', 'main', 'res');
    const javaDir = path.join(projectRoot, 'android', 'app', 'src', 'main', 'java', 'com', 'askfiles', 'mobile');

    const copies = [
      { src: path.join(srcDir, 'layout', 'storage_widget.xml'), dst: path.join(resDir, 'layout', 'storage_widget.xml') },
      { src: path.join(srcDir, 'drawable', 'widget_background.xml'), dst: path.join(resDir, 'drawable', 'widget_background.xml') },
      { src: path.join(srcDir, 'drawable', 'widget_progress_drawable.xml'), dst: path.join(resDir, 'drawable', 'widget_progress_drawable.xml') },
      { src: path.join(srcDir, 'xml', 'storage_widget_info.xml'), dst: path.join(resDir, 'xml', 'storage_widget_info.xml') },
      { src: path.join(srcDir, 'java', 'StorageWidget.kt'), dst: path.join(javaDir, 'StorageWidget.kt') },
      { src: path.join(srcDir, 'drawable-night', 'widget_background.xml'), dst: path.join(resDir, 'drawable-night', 'widget_background.xml') },
      { src: path.join(srcDir, 'layout-night', 'storage_widget.xml'), dst: path.join(resDir, 'layout-night', 'storage_widget.xml') },
    ];

    for (const { src, dst } of copies) {
      if (fs.existsSync(src)) {
        fs.mkdirSync(path.dirname(dst), { recursive: true });
        fs.copyFileSync(src, dst);
      }
    }

    const manifest = config.modResults;
    const application = manifest.manifest.application[0];

    if (!application.receiver) {
      application.receiver = [];
    }

    const alreadyAdded = application.receiver.some(
      (r) => r.$?.['android:name'] === '.StorageWidget'
    );

    if (!alreadyAdded) {
      application.receiver.push({
        $: {
          'android:name': '.StorageWidget',
          'android:exported': 'true',
          'android:label': 'AskFiles Storage',
        },
        'intent-filter': [
          {
            action: [
              { $: { 'android:name': 'android.appwidget.action.APPWIDGET_UPDATE' } },
              { $: { 'android:name': 'com.askfiles.mobile.UPDATE_WIDGET' } },
            ],
          },
        ],
        'meta-data': [
          {
            $: {
              'android:name': 'android.appwidget.provider',
              'android:resource': '@xml/storage_widget_info',
            },
          },
        ],
      });
    }

    return config;
  });
};
