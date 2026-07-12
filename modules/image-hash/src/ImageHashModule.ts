import { NativeModule, requireNativeModule } from 'expo';

import { ImageHashModuleEvents } from './ImageHash.types';

declare class ImageHashModule extends NativeModule<ImageHashModuleEvents> {
  PI: number;
  hello(): string;
  setValueAsync(value: string): Promise<void>;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<ImageHashModule>('ImageHash');
