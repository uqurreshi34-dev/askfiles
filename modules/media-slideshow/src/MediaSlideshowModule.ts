import { NativeModule, requireNativeModule } from 'expo';

declare class MediaSlideshowModule extends NativeModule<{}> {}

export default requireNativeModule<MediaSlideshowModule>('MediaSlideshow');
