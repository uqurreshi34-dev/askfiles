import { requireNativeModule } from 'expo-modules-core';

const StorageStats = requireNativeModule('StorageStats');

export function getStorageStats(): Promise<{ total: number; free: number }> {
  return StorageStats.getStorageStats();
}

export function isStorageManager(): Promise<boolean> {
    return StorageStats.isStorageManager();
  }

export function isAppLockEnabledSync(): boolean {
  return StorageStats.isAppLockEnabledSync();
}

export function setAppLockEnabledSync(enabled: boolean): void {
  StorageStats.setAppLockEnabledSync(enabled);
}
