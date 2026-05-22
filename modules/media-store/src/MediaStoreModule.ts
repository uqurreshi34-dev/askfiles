import { NativeModule, requireNativeModule } from 'expo';

import { MediaStoreModuleEvents } from './MediaStore.types';

declare class MediaStoreModule extends NativeModule<MediaStoreModuleEvents> {
  PI: number;
  hello(): string;
  setValueAsync(value: string): Promise<void>;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<MediaStoreModule>('MediaStore');
