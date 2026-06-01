import { NativeModule, requireNativeModule } from 'expo';

declare class ScanModule extends NativeModule<{}> {
  setValueAsync(value: string): Promise<void>;
}

export default requireNativeModule<ScanModule>('ScanModule');
