import { requireNativeView } from 'expo';
import * as React from 'react';

import { TextEditorViewProps } from './TextEditor.types';

const NativeView: React.ComponentType<TextEditorViewProps> =
  requireNativeView('TextEditor');

export default function TextEditorView(props: TextEditorViewProps) {
  return <NativeView {...props} />;
}
