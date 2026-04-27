import { registerWebModule, NativeModule } from 'expo';

import { ChangeEventPayload } from './StorageStats.types';

type StorageStatsModuleEvents = {
  onChange: (params: ChangeEventPayload) => void;
}

class StorageStatsModule extends NativeModule<StorageStatsModuleEvents> {
  PI = Math.PI;
  async setValueAsync(value: string): Promise<void> {
    this.emit('onChange', { value });
  }
  hello() {
    return 'Hello world! 👋';
  }
};

export default registerWebModule(StorageStatsModule, 'StorageStatsModule');
