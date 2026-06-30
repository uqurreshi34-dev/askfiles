import { NativeModule, requireNativeModule } from 'expo';

declare class ArchiveExtractorModule extends NativeModule<{}> {
  setValueAsync(value: string): Promise<void>;
}

export default requireNativeModule<ArchiveExtractorModule>('ArchiveExtractor');
