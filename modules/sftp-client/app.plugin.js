const { withAppBuildGradle, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

function withMetaInfFix(config) {
  return withAppBuildGradle(config, (mod) => {
    if (!mod.modResults.contents.includes('META-INF/versions/9/OSGI-INF/MANIFEST.MF')) {
      mod.modResults.contents = mod.modResults.contents.replace(
        /android\s*\{/,
        `android {\n    packaging {\n        resources {\n            excludes += ['META-INF/versions/9/OSGI-INF/MANIFEST.MF']\n        }\n    }`
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
      const dstDir = path.join(projectRoot, 'android', 'app', 'src', 'main', 'res', 'drawable');
      fs.mkdirSync(dstDir, { recursive: true });
      const src = path.join(projectRoot, 'modules', 'sftp-client', 'android-assets', 'drawable', 'shortcut_sftp.xml');
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(dstDir, 'shortcut_sftp.xml'));
      }
      return cfg;
    },
  ]);
}

module.exports = function withSftpClient(config) {
  config = withMetaInfFix(config);
  config = withShortcutIcon(config);
  return config;
};
