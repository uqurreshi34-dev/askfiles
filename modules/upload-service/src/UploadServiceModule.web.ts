import { registerWebModule, NativeModule } from 'expo';

import { ChangeEventPayload } from './UploadService.types';

type UploadServiceModuleEvents = {
  onChange: (params: ChangeEventPayload) => void;
}

class UploadServiceModule extends NativeModule<UploadServiceModuleEvents> {
  PI = Math.PI;
  async setValueAsync(value: string): Promise<void> {
    this.emit('onChange', { value });
  }
  hello() {
    return 'Hello world! 👋';
  }
};

export default registerWebModule(UploadServiceModule, 'UploadServiceModule');
