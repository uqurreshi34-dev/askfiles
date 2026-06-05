import { NativeModule, requireNativeModule } from 'expo';

declare class PdfCreatorModule extends NativeModule<{}> {
  setValueAsync(value: string): Promise<void>;
}

export default requireNativeModule<PdfCreatorModule>('PdfCreator');
