import { NativeModule, requireNativeModule } from 'expo';

declare class SftpClientModule extends NativeModule<{}> {
  setValueAsync(value: string): Promise<void>;
}

export default requireNativeModule<SftpClientModule>('SftpClient');
