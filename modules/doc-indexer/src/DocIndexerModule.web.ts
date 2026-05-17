import { registerWebModule, NativeModule } from 'expo';

import { ChangeEventPayload } from './DocIndexer.types';

type DocIndexerModuleEvents = {
  onChange: (params: ChangeEventPayload) => void;
}

class DocIndexerModule extends NativeModule<DocIndexerModuleEvents> {
  PI = Math.PI;
  async setValueAsync(value: string): Promise<void> {
    this.emit('onChange', { value });
  }
  hello() {
    return 'Hello world! 👋';
  }
};

export default registerWebModule(DocIndexerModule, 'DocIndexerModule');
