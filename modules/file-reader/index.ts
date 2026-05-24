import { requireNativeModule } from 'expo-modules-core';

const FileReaderNative = requireNativeModule('FileReader');

export async function readDirectory(path: string): Promise<{
  name: string;
  uri: string;
  isDirectory: boolean;
}[]> {
  return FileReaderNative.readDirectory(path);
}

export const countFolder = async (path: string): Promise<number> =>
  FileReaderNative.countFolder(path);
