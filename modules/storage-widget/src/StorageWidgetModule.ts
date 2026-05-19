import { NativeModule, requireNativeModule } from 'expo';

import { StorageWidgetModuleEvents } from './StorageWidget.types';

declare class StorageWidgetModule extends NativeModule<StorageWidgetModuleEvents> {
  saveRecentsForWidget(recentsJson: string): Promise<void>;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<StorageWidgetModule>('StorageWidget');
