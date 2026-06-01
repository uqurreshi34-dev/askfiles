import { registerWebModule, NativeModule } from 'expo';

// ScanModule is not available on the web platform.
class ScanModule extends NativeModule<{}> {}

export default registerWebModule(ScanModule, 'ScanModule');
