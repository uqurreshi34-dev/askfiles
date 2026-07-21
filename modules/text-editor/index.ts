import { requireNativeModule } from 'expo-modules-core';
import { requireNativeViewManager } from 'expo-modules-core';
import * as React from 'react';

const TextEditor = requireNativeModule('TextEditor');

export async function readTextFile(path: string): Promise<string> {
  return TextEditor.readTextFile(path);
}

export async function writeTextFile(path: string, content: string): Promise<boolean> {
  return TextEditor.writeTextFile(path, content);
}

export async function resolveContentUri(uri: string): Promise<{ path: string; name: string } | null> {
  return TextEditor.resolveContentUri(uri);
}

export async function writeContentUri(uri: string, content: string): Promise<boolean> {
    return TextEditor.writeContentUri(uri, content);
}

export type TextEditorViewProps = {
  value?: string;
  placeholder?: string;
  color?: string;
  placeholderColor?: string;
  onTextChange?: (event: { nativeEvent: { value: string } }) => void;
  style?: any;
};

const NativeView: React.ComponentType<TextEditorViewProps> =
  requireNativeViewManager('TextEditor');

export function TextEditorView(props: TextEditorViewProps) {
  return React.createElement(NativeView, props);
}
