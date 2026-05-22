import { registerWebModule, NativeModule } from 'expo';

import { MediaStoreModuleEvents } from './MediaStore.types';

class MediaStoreModule extends NativeModule<MediaStoreModuleEvents> {
  PI = Math.PI;
  async setValueAsync(value: string): Promise<void> {
    this.emit('onChange', { value });
  }
  hello() {
    return 'Hello world! 👋';
  }
}

export default registerWebModule(MediaStoreModule, 'MediaStoreModule');
