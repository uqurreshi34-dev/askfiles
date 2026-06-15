import { NativeModule, requireNativeModule } from 'expo';

declare class MediaViewerModule extends NativeModule<{}> {}

export default requireNativeModule<MediaViewerModule>('MediaViewer');
