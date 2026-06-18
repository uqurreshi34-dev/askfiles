import { registerWebModule, NativeModule } from 'expo';

// FileConverterModule is not available on the web platform.
class FileConverterModule extends NativeModule<{}> {}

export default registerWebModule(FileConverterModule, 'FileConverterModule');
