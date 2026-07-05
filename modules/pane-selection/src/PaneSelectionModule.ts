import { NativeModule, requireNativeModule } from 'expo';

import { PaneSelectionModuleEvents } from './PaneSelection.types';

declare class PaneSelectionModule extends NativeModule<PaneSelectionModuleEvents> {
  PI: number;
  hello(): string;
  setValueAsync(value: string): Promise<void>;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<PaneSelectionModule>('PaneSelection');
