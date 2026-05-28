import { requireNativeModule } from 'expo-modules-core';

const FileReader = requireNativeModule('FileReader');

export async function readDirectory(path: string): Promise<{ name: string; uri: string; isDirectory: boolean }[]> {
  return FileReader.readDirectory(path);
}

export const countFolder = async (path: string): Promise<number> =>
  FileReader.countFolder(path);

export function copyFileStream(srcUri: string, destPath: string): Promise<string> {
  return FileReader.copyFileStream(srcUri, destPath);
}

export function moveFileStream(srcUri: string, destPath: string): Promise<string> {
  return FileReader.moveFileStream(srcUri, destPath);
}

export function addCopyProgressListener(
  callback: (event: { percent: number; bytesCopied: number; totalBytes: number }) => void
) {
  return FileReader.addListener('onCopyProgress', callback);
}

export function zipFiles(srcPaths: string[], destPath: string): Promise<string> {
  return FileReader.zipFiles(srcPaths, destPath);
}

export function unzipFile(srcPath: string, destDir: string): Promise<string> {
  return FileReader.unzipFile(srcPath, destDir);
}

export function zipFilesWithPassword(srcPaths: string[], destPath: string, password: string): Promise<string> {
  return FileReader.zipFilesWithPassword(srcPaths, destPath, password);
}

export function unzipFileWithPassword(srcPath: string, destDir: string, password: string): Promise<string> {
  return FileReader.unzipFileWithPassword(srcPath, destDir, password);
}

export function startWifiServer(rootPath: string): Promise<string> {
  return FileReader.startWifiServer(rootPath);
}

export function stopWifiServer(): Promise<void> {
  return FileReader.stopWifiServer();
}
