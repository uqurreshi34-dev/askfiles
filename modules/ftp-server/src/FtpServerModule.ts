import { NativeModule, requireNativeModule } from 'expo';

declare class FtpServerModule extends NativeModule<{}> {
  setValueAsync(value: string): Promise<void>;
}

export default requireNativeModule<FtpServerModule>('FtpServer');
