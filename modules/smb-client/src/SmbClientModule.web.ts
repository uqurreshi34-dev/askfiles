import { registerWebModule, NativeModule } from 'expo';

// SmbClientModule is not available on the web platform.
class SmbClientModule extends NativeModule<{}> {}

export default registerWebModule(SmbClientModule, 'SmbClientModule');
