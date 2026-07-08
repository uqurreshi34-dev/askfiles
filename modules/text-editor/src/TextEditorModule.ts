import { NativeModule, requireNativeModule } from 'expo';

import { TextEditorModuleEvents } from './TextEditor.types';

declare class TextEditorModule extends NativeModule<TextEditorModuleEvents> {
  PI: number;
  hello(): string;
  setValueAsync(value: string): Promise<void>;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<TextEditorModule>('TextEditor');
