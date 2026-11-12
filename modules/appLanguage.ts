/**
 * The app's language: English, Arabic or Hindi.
 *
 * Starts on the phone's language. Choosing one on onboarding or in Settings
 * saves it, and every screen using useLanguage() switches at once. Screens
 * that are not translated yet simply stay in English.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { I18nManager } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type AppLang = 'en' | 'ar' | 'hi';

const STORAGE_KEY = 'askfiles-language';

/** The language buttons, each written in its own language. */
export const LANGUAGES: readonly { code: AppLang; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'ar', label: 'العربية' },
  { code: 'hi', label: 'हिन्दी' },
];

function isAppLang(v: unknown): v is AppLang {
  return v === 'en' || v === 'ar' || v === 'hi';
}

/** The phone's language as 'ar', 'hi' or 'en' (anything else). */
export function deviceLanguage(): AppLang {
  let tag = '';
  try {
    // Android gives e.g. 'ar_EG' or 'hi_IN'.
    tag = (I18nManager as any).getConstants?.().localeIdentifier ?? '';
  } catch {}
  if (!tag) {
    try { tag = Intl.DateTimeFormat().resolvedOptions().locale ?? ''; } catch {}
  }
  const base = tag.toLowerCase().split(/[-_]/)[0];
  return isAppLang(base) ? base : 'en';
}

let current: AppLang = deviceLanguage();
let chosenThisSession = false;
const listeners = new Set<() => void>();

function notify() { listeners.forEach(l => l()); }

// Read the saved choice as soon as this file loads, so screens rarely
// show the phone's language first and then switch.
AsyncStorage.getItem(STORAGE_KEY)
  .then(saved => {
    // A choice made while this was loading wins over the saved one.
    if (!chosenThisSession && isAppLang(saved) && saved !== current) {
      current = saved;
      notify();
    }
  })
  .catch(() => {});

export function getLanguage(): AppLang { return current; }

/** Switch the whole app's language and remember it. */
export function setLanguage(lang: AppLang): void {
  chosenThisSession = true;
  if (lang !== current) {
    current = lang;
    notify();
  }
  AsyncStorage.setItem(STORAGE_KEY, lang).catch(() => {});
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** The current language; the screen re-renders when it changes. */
export function useLanguage(): AppLang {
  return useSyncExternalStore(subscribe, getLanguage, getLanguage);
}
