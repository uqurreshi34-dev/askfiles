import { NativeModule, requireNativeModule } from 'expo';

import { UploadManagerModuleEvents } from './UploadManager.types';

declare class UploadManagerModule extends NativeModule<UploadManagerModuleEvents> {
  PI: number;
  hello(): string;
  setValueAsync(value: string): Promise<void>;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<UploadManagerModule>('UploadManager');
