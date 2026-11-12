const { withMainActivity } = require('@expo/config-plugins');

// Keeps the newest deep link (askfiles://callback?code=...) as MainActivity's
// intent. If Android rebuilt the app while the user was signing in to OneDrive
// or Dropbox, the link arrives before JavaScript is listening; storing it here
// lets the app read it once it starts, so the sign-in can finish.
const METHOD = `
  override fun onNewIntent(intent: android.content.Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
  }
`;

function addOnNewIntent(contents) {
  if (contents.includes('setIntent(intent)')) return contents; // already added
  const anchor = 'override fun getMainComponentName(): String = "main"';
  if (!contents.includes(anchor)) {
    console.warn('withLatestIntent: anchor not found in MainActivity.kt');
    return contents;
  }
  return contents.replace(anchor, anchor + '\n' + METHOD);
}

module.exports = function withLatestIntent(config) {
  return withMainActivity(config, (mod) => {
    if (mod.modResults.language !== 'kt') {
      console.warn('withLatestIntent: MainActivity is not Kotlin. Skipping.');
      return mod;
    }
    mod.modResults.contents = addOnNewIntent(mod.modResults.contents);
    return mod;
  });
};
module.exports.addOnNewIntent = addOnNewIntent;
