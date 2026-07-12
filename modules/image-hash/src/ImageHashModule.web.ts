import { registerWebModule, NativeModule } from 'expo';

import { ImageHashModuleEvents } from './ImageHash.types';

class ImageHashModule extends NativeModule<ImageHashModuleEvents> {
  PI = Math.PI;
  async setValueAsync(value: string): Promise<void> {
    this.emit('onChange', { value });
  }
  hello() {
    return 'Hello world! 👋';
  }
}

export default registerWebModule(ImageHashModule, 'ImageHashModule');
