import { registerWebModule, NativeModule } from 'expo';

// SftpClientModule is not available on the web platform.
class SftpClientModule extends NativeModule<{}> {}

export default registerWebModule(SftpClientModule, 'SftpClientModule');
