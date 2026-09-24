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
  callback: (event: { percent: number; bytesCopied: number; totalBytes: number; currentFile?: string; filesCopied?: number; totalFiles?: number }) => void
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

export interface WifiShareInfo {
  url: string;       // the page, for typing into a browser
  loginUrl: string;  // the page with the password included, for the QR code
  address: string;
  port: number;
  password: string;
}

// startWifiServer rejects with this code when the phone is not on Wi-Fi or its own hotspot.
export const WIFI_NO_NETWORK = 'ERR_WIFI_NO_NETWORK';

export function startWifiServer(rootPath: string): Promise<WifiShareInfo> {
  return FileReader.startWifiServer(rootPath);
}

// Replace the saved password. Signs out every browser and cancels shared links at once.
export function newWifiPassword(): Promise<string> {
  return FileReader.newWifiPassword();
}

// A download link for this one file only, valid for an hour. Starts WiFi Transfer if needed.
export function shareFileViaWifi(path: string): Promise<string> {
  return FileReader.shareFileViaWifi(path);
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

export function getShowHidden(): boolean {
  return FileReader.getShowHidden();
}

export function setShowHidden(value: boolean): void {
  FileReader.setShowHidden(value);
}

export function batchRename(
  items: { src: string; dst: string }[]
): Promise<{ src: string; dst: string; success: boolean; error?: string }[]> {
  return FileReader.batchRename(items);
}

export function copyFolderRecursive(srcPath: string, destPath: string): Promise<string> {
  return FileReader.copyFolderRecursive(srcPath, destPath);
}

export function moveFolderRecursive(srcPath: string, destPath: string): Promise<string> {
  return FileReader.moveFolderRecursive(srcPath, destPath);
}

export async function checkDuplicates(paths: string[]): Promise<string[]> {
  try {
    return await FileReader.checkDuplicates(paths) ?? [];
  } catch {
    return [];
  }
}

export function getMostUsedEnabled(): boolean {
  return FileReader.getMostUsedEnabled();
}

export function setMostUsedEnabled(value: boolean): void {
  FileReader.setMostUsedEnabled(value);
}

export async function readTextPreview(path: string): Promise<string | null> {
  return FileReader.readTextPreview(path);
}

export async function readDocxPreview(path: string): Promise<string | null> {
  return FileReader.readDocxPreview(path);
}
