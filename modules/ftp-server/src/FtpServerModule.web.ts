import { registerWebModule, NativeModule } from 'expo';

// FtpServerModule is not available on the web platform.
class FtpServerModule extends NativeModule<{}> {}

export default registerWebModule(FtpServerModule, 'FtpServerModule');
