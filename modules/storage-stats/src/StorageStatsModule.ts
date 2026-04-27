import { NativeModule, requireNativeModule } from 'expo';

import { StorageStatsModuleEvents } from './StorageStats.types';

declare class StorageStatsModule extends NativeModule<StorageStatsModuleEvents> {
  PI: number;
  hello(): string;
  setValueAsync(value: string): Promise<void>;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<StorageStatsModule>('StorageStats');
