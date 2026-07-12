const { withAndroidManifest } = require("@expo/config-plugins");

module.exports = function withPdfViewer(config) {
  config = withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    const application = manifest.manifest.application?.[0];
    if (application) {
      application.activity = application.activity || [];
      const activity = application.activity[0];
      activity["$"] = activity["$"] || {};
      activity["$"]["android:launchMode"] = "singleTask";
    }
    return config;
  });

  return config;
};
