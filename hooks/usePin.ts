import * as SecureStore from 'expo-secure-store';
import { isAppLockEnabledSync, setAppLockEnabledSync } from '@/modules/storage-stats';
import * as Crypto from 'expo-crypto';

const PIN_KEY = 'askfiles-pin';

async function hashPin(pin: string, salt: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, salt + pin);
}

export async function savePin(pin: string): Promise<void> {
  const saltBytes = await Crypto.getRandomBytesAsync(16);
  const salt = Array.from(saltBytes).map(b => b.toString(16).padStart(2, '0')).join('');
  const hash = await hashPin(pin, salt);
  await SecureStore.setItemAsync(PIN_KEY, `v2:${salt}:${hash}`);
}

export async function verifyPin(input: string): Promise<boolean> {
  const stored = await SecureStore.getItemAsync(PIN_KEY);
  return stored === input;
}

export async function deletePin(): Promise<void> {
  await SecureStore.deleteItemAsync(PIN_KEY);
}

export async function isPinSet(): Promise<boolean> {
  const pin = await SecureStore.getItemAsync(PIN_KEY);
  const appLockEnabled = isAppLockEnabled();
  return !!pin && appLockEnabled;
}

export async function enableAppLock(): Promise<void> {
  await SecureStore.setItemAsync('askfiles-app-lock-enabled', 'true');
  setAppLockEnabledSync(true);
}

export async function disableAppLock(): Promise<void> {
  await SecureStore.setItemAsync('askfiles-app-lock-enabled', 'false');
  setAppLockEnabledSync(false);
}

export function isAppLockEnabled(): boolean {
  return isAppLockEnabledSync();
}
