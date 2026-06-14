import { registerWebModule, NativeModule } from 'expo';

// MediaSlideshowModule is not available on the web platform.
class MediaSlideshowModule extends NativeModule<{}> {}

export default registerWebModule(MediaSlideshowModule, 'MediaSlideshowModule');
