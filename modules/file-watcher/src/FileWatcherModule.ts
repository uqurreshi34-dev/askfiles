import { NativeModule, requireNativeModule } from 'expo';

import { FileWatcherModuleEvents } from './FileWatcher.types';

declare class FileWatcherModule extends NativeModule<FileWatcherModuleEvents> {
  PI: number;
  hello(): string;
  setValueAsync(value: string): Promise<void>;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<FileWatcherModule>('FileWatcher');
