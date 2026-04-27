import { requireNativeModule } from 'expo-modules-core';

const StorageStats = requireNativeModule('StorageStats');

export function getStorageStats(): Promise<{ total: number; free: number }> {
  return StorageStats.getStorageStats();
}

export function isStorageManager(): Promise<boolean> {
    return StorageStats.isStorageManager();
  }
