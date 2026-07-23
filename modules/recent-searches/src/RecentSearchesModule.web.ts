import { registerWebModule, NativeModule } from 'expo';

import { RecentSearchesModuleEvents } from './RecentSearches.types';

class RecentSearchesModule extends NativeModule<RecentSearchesModuleEvents> {
  PI = Math.PI;
  async setValueAsync(value: string): Promise<void> {
    this.emit('onChange', { value });
  }
  hello() {
    return 'Hello world! 👋';
  }
}

export default registerWebModule(RecentSearchesModule, 'RecentSearchesModule');
