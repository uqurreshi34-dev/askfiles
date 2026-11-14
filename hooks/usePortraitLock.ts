import { useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';

/**
 * Keeps a PIN keypad screen in portrait while it is on screen.
 *
 * One shared count instead of each screen locking and unlocking on its own.
 * When one PIN screen opens another (Vault keypad -> Set PIN, and back), the
 * screen leaving released its lock after the new one had taken it, so the
 * keypad could rotate. Rotation is only unlocked when no PIN screen is
 * showing at all.
 */
let holders = 0;

export function usePortraitLock(active = true) {
  useFocusEffect(
    useCallback(() => {
      if (!active) return;
      holders += 1;
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
      return () => {
        holders = Math.max(0, holders - 1);
        if (holders === 0) ScreenOrientation.unlockAsync().catch(() => {});
      };
    }, [active])
  );
}
