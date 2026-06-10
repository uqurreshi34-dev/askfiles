const { withProjectBuildGradle } = require('@expo/config-plugins');

module.exports = function withSmbClient(config) {
  return withProjectBuildGradle(config, (mod) => {
    let contents = mod.modResults.contents;

    // Add mavenCentral if not present
    if (!contents.includes('mavenCentral()')) {
      contents = contents.replace(
        /google\(\)/,
        'google()\n        mavenCentral()'
      );
    }

    // Globally exclude old BouncyCastle to prevent duplicate class conflict
    if (!contents.includes('bcprov-jdk15to18')) {
      contents = contents.replace(
        /allprojects\s*\{/,
        `allprojects {\n    configurations.all {\n        exclude group: 'org.bouncycastle', module: 'bcprov-jdk15to18'\n    }`
      );
    }

    mod.modResults.contents = contents;
    return mod;
  });
};
