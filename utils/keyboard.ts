import { Keyboard } from 'react-native';

/**
 * Resolves once the keyboard is fully closed (straight away if it is not
 * open). Sheets opened while it was still sliding away measured themselves
 * against the shrunken screen and, in landscape, could not scroll to their
 * last options. The timer is a backstop in case the hide event never comes.
 */
export function keyboardClosed(): Promise<void> {
  return new Promise(resolve => {
    if (!Keyboard.isVisible()) {
      resolve();
      return;
    }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      sub.remove();
      clearTimeout(timer);
      resolve();
    };
    const sub = Keyboard.addListener('keyboardDidHide', finish);
    const timer = setTimeout(finish, 500);
    Keyboard.dismiss();
  });
}
