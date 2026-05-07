import { requireNativeModule } from 'expo-modules-core';

declare class StorageStatsModuleType {
  getStorageStats(): Promise<{ total: number; used: number; free: number }>;
  isStorageManager(): Promise<boolean>;
  isAppLockEnabledSync(): boolean;
  setAppLockEnabledSync(enabled: boolean): void;
}

const StorageStats = requireNativeModule<StorageStatsModuleType>('StorageStats');
export default StorageStats;
