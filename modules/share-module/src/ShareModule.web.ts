import { registerWebModule, NativeModule } from 'expo';

import { ChangeEventPayload } from './ShareModule.types';

type ShareModuleEvents = {
  onChange: (params: ChangeEventPayload) => void;
}

class ShareModule extends NativeModule<ShareModuleEvents> {
  PI = Math.PI;
  async setValueAsync(value: string): Promise<void> {
    this.emit('onChange', { value });
  }
  hello() {
    return 'Hello world! 👋';
  }
};

export default registerWebModule(ShareModule, 'ShareModule');
