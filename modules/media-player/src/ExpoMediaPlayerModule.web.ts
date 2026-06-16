import { registerWebModule, NativeModule } from 'expo';

// ExpoMediaPlayerModule is not available on the web platform.
class ExpoMediaPlayerModule extends NativeModule<{}> {}

export default registerWebModule(ExpoMediaPlayerModule, 'ExpoMediaPlayerModule');
