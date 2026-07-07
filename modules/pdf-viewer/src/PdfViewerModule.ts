import { NativeModule, requireNativeModule } from 'expo';

import { PdfViewerModuleEvents } from './PdfViewer.types';

declare class PdfViewerModule extends NativeModule<PdfViewerModuleEvents> {
  PI: number;
  hello(): string;
  setValueAsync(value: string): Promise<void>;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<PdfViewerModule>('PdfViewer');
