import { registerWebModule, NativeModule } from 'expo';

// PdfCreatorModule is not available on the web platform.
class PdfCreatorModule extends NativeModule<{}> {}

export default registerWebModule(PdfCreatorModule, 'PdfCreatorModule');
