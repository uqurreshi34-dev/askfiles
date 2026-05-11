import { registerWebModule, NativeModule } from 'expo';

import { ChangeEventPayload } from './FileWatcher.types';

type FileWatcherModuleEvents = {
  onChange: (params: ChangeEventPayload) => void;
}

class FileWatcherModule extends NativeModule<FileWatcherModuleEvents> {
  PI = Math.PI;
  async setValueAsync(value: string): Promise<void> {
    this.emit('onChange', { value });
  }
  hello() {
    return 'Hello world! 👋';
  }
};

export default registerWebModule(FileWatcherModule, 'FileWatcherModule');
