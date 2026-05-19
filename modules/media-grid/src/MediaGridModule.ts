import { NativeModule, requireNativeModule } from 'expo';

declare class MediaGridModule extends NativeModule<Record<string, never>> {}

export default requireNativeModule<MediaGridModule>('MediaGrid');
