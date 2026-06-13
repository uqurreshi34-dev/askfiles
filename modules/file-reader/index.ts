import { requireNativeModule } from 'expo-modules-core';

const FileReader = requireNativeModule('FileReader');

export async function readDirectory(path: string, includeHidden: boolean = false): Promise<{ name: string; uri: string; isDirectory: boolean; size: number; date: number }[]> {
  return FileReader.readDirectory(path, includeHidden);
}

export const countFolder = async (path: string, includeHidden: boolean = false): Promise<number> =>
  FileReader.countFolder(path, includeHidden);

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

export async function deleteDirectory(path: string): Promise<boolean> {
  return FileReader.deleteDirectory(path);
}

export async function statFiles(paths: string[]): Promise<number[]> {
  return FileReader.statFiles(paths);
}

export async function createDirectory(path: string): Promise<string> {
  return FileReader.createDirectory(path);
}

export async function writeTextFile(path: string, content: string): Promise<string> {
  return FileReader.writeTextFile(path, content);
}
