import { registerWebModule, NativeModule } from 'expo';

import { FileStatsModuleEvents } from './FileStats.types';

class FileStatsModule extends NativeModule<FileStatsModuleEvents> {
  PI = Math.PI;
  async setValueAsync(value: string): Promise<void> {
    this.emit('onChange', { value });
  }
  hello() {
    return 'Hello world! 👋';
  }
}

export default registerWebModule(FileStatsModule, 'FileStatsModule');
