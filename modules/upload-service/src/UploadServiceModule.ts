import { NativeModule, requireNativeModule } from 'expo';

import { UploadServiceModuleEvents } from './UploadService.types';

declare class UploadServiceModule extends NativeModule<UploadServiceModuleEvents> {
  PI: number;
  hello(): string;
  setValueAsync(value: string): Promise<void>;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<UploadServiceModule>('UploadService');
