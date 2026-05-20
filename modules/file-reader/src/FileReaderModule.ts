import { NativeModule, requireNativeModule } from 'expo';

import { FileReaderModuleEvents } from './FileReader.types';

declare class FileReaderModule extends NativeModule<FileReaderModuleEvents> {
  PI: number;
  hello(): string;
  setValueAsync(value: string): Promise<void>;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<FileReaderModule>('FileReader');
