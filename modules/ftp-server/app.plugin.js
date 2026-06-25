const { withAppBuildGradle, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

function withMetaInfFix(config) {
  return withAppBuildGradle(config, (mod) => {
    if (!mod.modResults.contents.includes('META-INF/DEPENDENCIES')) {
      mod.modResults.contents = mod.modResults.contents.replace(
        /android\s*\{/,
        `android {\n    packaging {\n        resources {\n            excludes += ['META-INF/DEPENDENCIES', 'META-INF/LICENSE', 'META-INF/NOTICE', 'META-INF/versions/9/OSGI-INF/MANIFEST.MF']\n        }\n    }`
      );
    }
    return mod;
  });
}

function withShortcutIcon(config) {
  return withDangerousMod(config, [
    'android',
    (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      const src = path.join(projectRoot, 'modules', 'ftp-server', 'android-assets', 'drawable', 'shortcut_ftp.xml');
      const dstDir = path.join(projectRoot, 'android', 'app', 'src', 'main', 'res', 'drawable');
      const dst = path.join(dstDir, 'shortcut_ftp.xml');
      if (fs.existsSync(src)) {
        fs.mkdirSync(dstDir, { recursive: true });
        fs.copyFileSync(src, dst);
      }
      return cfg;
    },
  ]);
}

module.exports = function withFtpServer(config) {
  config = withMetaInfFix(config);
  config = withShortcutIcon(config);
  return config;
};
