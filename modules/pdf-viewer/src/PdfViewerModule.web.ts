import { registerWebModule, NativeModule } from 'expo';

import { PdfViewerModuleEvents } from './PdfViewer.types';

class PdfViewerModule extends NativeModule<PdfViewerModuleEvents> {
  PI = Math.PI;
  async setValueAsync(value: string): Promise<void> {
    this.emit('onChange', { value });
  }
  hello() {
    return 'Hello world! 👋';
  }
}

export default registerWebModule(PdfViewerModule, 'PdfViewerModule');
