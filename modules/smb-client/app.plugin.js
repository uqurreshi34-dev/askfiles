const { withProjectBuildGradle } = require('@expo/config-plugins');

module.exports = function withSmbClient(config) {
  return withProjectBuildGradle(config, (mod) => {
    let contents = mod.modResults.contents;

    // Add mavenCentral() if not present
    if (!contents.includes('mavenCentral()')) {
      contents = contents.replace(
        /google\(\)/,
        'google()\n        mavenCentral()'
      );
    }

    // Add global BouncyCastle conflict resolution if not present
    if (!contents.includes('bcprov-jdk15to18')) {
      contents = contents.replace(
        /allprojects\s*\{/,
        `allprojects {
    configurations.all {
        exclude group: 'org.bouncycastle', module: 'bcprov-jdk15to18'
    }`
      );
    }

    mod.modResults.contents = contents;
    return mod;
  });
};
