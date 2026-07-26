import { registerWebModule, NativeModule } from 'expo';

import { ChangeEventPayload } from './MediaGrid.types';

type MediaGridModuleEvents = {
  onChange: (params: ChangeEventPayload) => void;
}

class MediaGridModule extends NativeModule<MediaGridModuleEvents> {
  PI = Math.PI;
  async setValueAsync(value: string): Promise<void> {
    this.emit('onChange', { value });
  }
  hello() {
    return 'Hello world! 👋';
  }
};

export default registerWebModule(MediaGridModule, 'MediaGridModule');
