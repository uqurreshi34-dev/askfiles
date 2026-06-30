import { registerWebModule, NativeModule } from 'expo';

// ArchiveExtractorModule is not available on the web platform.
class ArchiveExtractorModule extends NativeModule<{}> {}

export default registerWebModule(ArchiveExtractorModule, 'ArchiveExtractorModule');
