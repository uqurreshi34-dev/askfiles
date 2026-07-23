import { NativeModule, requireNativeModule } from 'expo';

import { RecentSearchesModuleEvents } from './RecentSearches.types';

declare class RecentSearchesModule extends NativeModule<RecentSearchesModuleEvents> {
  PI: number;
  hello(): string;
  setValueAsync(value: string): Promise<void>;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<RecentSearchesModule>('RecentSearches');
