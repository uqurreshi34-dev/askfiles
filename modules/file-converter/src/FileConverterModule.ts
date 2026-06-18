import { NativeModule, requireNativeModule } from 'expo';

declare class FileConverterModule extends NativeModule<{}> {
  hello(): string;
  setValueAsync(value: string): Promise<void>;
}

export default requireNativeModule<FileConverterModule>('FileConverter');
