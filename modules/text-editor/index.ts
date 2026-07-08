import { requireNativeModule } from 'expo-modules-core';

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
