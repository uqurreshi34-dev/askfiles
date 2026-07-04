import { NativeModule, requireNativeModule } from 'expo';

import { FileStatsModuleEvents } from './FileStats.types';

declare class FileStatsModule extends NativeModule<FileStatsModuleEvents> {
  PI: number;
  hello(): string;
  setValueAsync(value: string): Promise<void>;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<FileStatsModule>('FileStats');
