import { registerWebModule, NativeModule } from 'expo';

import { CsvReaderModuleEvents } from './CsvReader.types';

class CsvReaderModule extends NativeModule<CsvReaderModuleEvents> {
  PI = Math.PI;
  async setValueAsync(value: string): Promise<void> {
    this.emit('onChange', { value });
  }
  hello() {
    return 'Hello world! 👋';
  }
}

export default registerWebModule(CsvReaderModule, 'CsvReaderModule');
