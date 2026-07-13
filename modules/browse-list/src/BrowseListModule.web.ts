import { registerWebModule, NativeModule } from 'expo';

import { BrowseListModuleEvents } from './BrowseList.types';

class BrowseListModule extends NativeModule<BrowseListModuleEvents> {
  PI = Math.PI;
  async setValueAsync(value: string): Promise<void> {
    this.emit('onChange', { value });
  }
  hello() {
    return 'Hello world! 👋';
  }
}

export default registerWebModule(BrowseListModule, 'BrowseListModule');
