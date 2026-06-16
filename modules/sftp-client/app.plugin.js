const { withAppBuildGradle } = require('@expo/config-plugins');

module.exports = function withSftpClient(config) {
  return withAppBuildGradle(config, (mod) => {
    if (!mod.modResults.contents.includes('META-INF/versions/9/OSGI-INF/MANIFEST.MF')) {
      mod.modResults.contents = mod.modResults.contents.replace(
        /android\s*\{/,
        `android {\n    packaging {\n        resources {\n            excludes += ['META-INF/versions/9/OSGI-INF/MANIFEST.MF']\n        }\n    }`
      );
    }
    return mod;
  });
};
