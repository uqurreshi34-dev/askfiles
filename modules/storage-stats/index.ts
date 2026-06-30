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

export async function showBiometricPrompt(title: string, subtitle: string): Promise<'success' | 'cancelled' | 'unavailable' | 'error'> {
  return StorageStats.showBiometricPrompt(title, subtitle);
}

export function getStorageVolumes(): Promise<{ name: string; path: string; type: string }[]> {
  return StorageStats.getStorageVolumes();
}

export function getVolumeStats(path: string): Promise<{ total: number; free: number; used: number; error?: string }> {
  return StorageStats.getVolumeStats(path);
}

export function getPinnedFolders(): string {
  return StorageStats.getPinnedFolders();
}

export function setPinnedFolders(json: string): void {
  StorageStats.setPinnedFolders(json);
}

export function getFavourites(): string {
  return StorageStats.getFavourites();
}
 
export function setFavourites(json: string): void {
  StorageStats.setFavourites(json);
}
 
export function getTags(): string {
  return StorageStats.getTags();
}
 
export function setTags(json: string): void {
  StorageStats.setTags(json);
}
 
export function getFileTags(): string {
  return StorageStats.getFileTags();
}
 
export function setFileTags(json: string): void {
  StorageStats.setFileTags(json);
}

export function getPendingBrowsePath(): string {
  return StorageStats.getPendingBrowsePath();
}
export function setPendingBrowsePath(path: string): void {
  StorageStats.setPendingBrowsePath(path);
}
