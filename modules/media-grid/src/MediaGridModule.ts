import { NativeModule, requireNativeModule } from 'expo';

import { MediaGridModuleEvents } from './MediaGrid.types';

declare class MediaGridModule extends NativeModule<MediaGridModuleEvents> {
  PI: number;
  hello(): string;
  setValueAsync(value: string): Promise<void>;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<MediaGridModule>('MediaGrid');
