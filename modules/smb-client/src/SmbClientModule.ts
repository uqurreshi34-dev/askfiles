import { NativeModule, requireNativeModule } from 'expo';

declare class SmbClientModule extends NativeModule<{}> {
  setValueAsync(value: string): Promise<void>;
}

export default requireNativeModule<SmbClientModule>('SmbClient');
