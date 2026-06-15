import { registerWebModule, NativeModule } from 'expo';

// MediaViewerModule is not available on the web platform.
class MediaViewerModule extends NativeModule<{}> {}

export default registerWebModule(MediaViewerModule, 'MediaViewerModule');
