import { NativeModule, requireNativeModule } from 'expo';

import { FileWatcherModuleEvents } from './FileWatcher.types';

declare class FileWatcherModule extends NativeModule<FileWatcherModuleEvents> {}

// This call loads the native module object from the JSI.
export default requireNativeModule<FileWatcherModule>('FileWatcher');
