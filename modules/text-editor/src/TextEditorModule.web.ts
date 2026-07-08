import { registerWebModule, NativeModule } from 'expo';

import { TextEditorModuleEvents } from './TextEditor.types';

class TextEditorModule extends NativeModule<TextEditorModuleEvents> {
  PI = Math.PI;
  async setValueAsync(value: string): Promise<void> {
    this.emit('onChange', { value });
  }
  hello() {
    return 'Hello world! 👋';
  }
}

export default registerWebModule(TextEditorModule, 'TextEditorModule');
