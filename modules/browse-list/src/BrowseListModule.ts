import { NativeModule, requireNativeModule } from 'expo';

import { BrowseListModuleEvents } from './BrowseList.types';

declare class BrowseListModule extends NativeModule<BrowseListModuleEvents> {
  PI: number;
  hello(): string;
  setValueAsync(value: string): Promise<void>;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<BrowseListModule>('BrowseList');
