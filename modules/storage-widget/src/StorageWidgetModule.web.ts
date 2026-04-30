import { registerWebModule, NativeModule } from 'expo';

import { ChangeEventPayload } from './StorageWidget.types';

type StorageWidgetModuleEvents = {
  onChange: (params: ChangeEventPayload) => void;
}

class StorageWidgetModule extends NativeModule<StorageWidgetModuleEvents> {
  PI = Math.PI;
  async setValueAsync(value: string): Promise<void> {
    this.emit('onChange', { value });
  }
  hello() {
    return 'Hello world! 👋';
  }
};

export default registerWebModule(StorageWidgetModule, 'StorageWidgetModule');
