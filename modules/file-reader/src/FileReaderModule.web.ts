import { registerWebModule, NativeModule } from 'expo';

import { ChangeEventPayload } from './FileReader.types';

type FileReaderModuleEvents = {
  onChange: (params: ChangeEventPayload) => void;
}

class FileReaderModule extends NativeModule<FileReaderModuleEvents> {
  PI = Math.PI;
  async setValueAsync(value: string): Promise<void> {
    this.emit('onChange', { value });
  }
  hello() {
    return 'Hello world! 👋';
  }
};

export default registerWebModule(FileReaderModule, 'FileReaderModule');
