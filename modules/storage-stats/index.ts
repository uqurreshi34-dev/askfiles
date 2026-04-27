import StorageStatsModule from './src/StorageStatsModule';

export function getStorageStats(): Promise<{ total: number; free: number }> {
  return StorageStatsModule.getStorageStats();
}
