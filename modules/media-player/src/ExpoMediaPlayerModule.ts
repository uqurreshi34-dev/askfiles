import { NativeModule, requireNativeModule } from 'expo';

declare class ExpoMediaPlayerModule extends NativeModule<{}> {}

export default requireNativeModule<ExpoMediaPlayerModule>('ExpoMediaPlayer');
