import { NativeModule, requireNativeModule } from 'expo';

import { StorageWidgetModuleEvents } from './StorageWidget.types';

declare class StorageWidgetModule extends NativeModule<StorageWidgetModuleEvents> {
  PI: number;
  hello(): string;
  setValueAsync(value: string): Promise<void>;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<StorageWidgetModule>('StorageWidget');
