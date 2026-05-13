import { registerWebModule, NativeModule } from 'expo';

import { ChangeEventPayload } from './UploadManager.types';

type UploadManagerModuleEvents = {
  onChange: (params: ChangeEventPayload) => void;
}

class UploadManagerModule extends NativeModule<UploadManagerModuleEvents> {
  PI = Math.PI;
  async setValueAsync(value: string): Promise<void> {
    this.emit('onChange', { value });
  }
  hello() {
    return 'Hello world! 👋';
  }
};

export default registerWebModule(UploadManagerModule, 'UploadManagerModule');
