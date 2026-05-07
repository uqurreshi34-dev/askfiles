import * as SecureStore from 'expo-secure-store';
import { isAppLockEnabledSync, setAppLockEnabledSync } from '@/modules/storage-stats';

const PIN_KEY = 'askfiles-pin';

export async function savePin(pin: string): Promise<void> {
  await SecureStore.setItemAsync(PIN_KEY, pin);
}

export async function getPin(): Promise<string | null> {
  return await SecureStore.getItemAsync(PIN_KEY);
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
  return !!pin;
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
