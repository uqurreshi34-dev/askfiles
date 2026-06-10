const { withProjectBuildGradle, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

function withBouncyCastleFix(config) {
  return withProjectBuildGradle(config, (mod) => {
    let contents = mod.modResults.contents;

    if (!contents.includes('mavenCentral()')) {
      contents = contents.replace(
        /google\(\)/,
        'google()\n        mavenCentral()'
      );
    }

    if (!contents.includes('bcprov-jdk15to18')) {
      contents = contents.replace(
        /allprojects\s*\{/,
        `allprojects {\n    configurations.all {\n        exclude group: 'org.bouncycastle', module: 'bcprov-jdk15to18'\n    }`
      );
    }

    mod.modResults.contents = contents;
    return mod;
  });
}

function withShortcutIcon(config) {
  return withDangerousMod(config, [
    'android',
    (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      const src = path.join(projectRoot, 'modules', 'smb-client', 'android-assets', 'drawable', 'shortcut_network.xml');
      const dstDir = path.join(projectRoot, 'android', 'app', 'src', 'main', 'res', 'drawable');
      const dst = path.join(dstDir, 'shortcut_network.xml');
      if (fs.existsSync(src)) {
        fs.mkdirSync(dstDir, { recursive: true });
        fs.copyFileSync(src, dst);
      }
      return cfg;
    },
  ]);
}

module.exports = function withSmbClient(config) {
  config = withBouncyCastleFix(config);
  config = withShortcutIcon(config);
  return config;
};
