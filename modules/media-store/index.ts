import { requireNativeModule } from 'expo-modules-core';

const MediaStore = requireNativeModule('MediaStore');

export interface MediaFile {
  name: string;
  uri: string;
  size: number;
}

export interface LargestFile {
  name: string;
  size: number;
  folder: string;
  uri: string;
}

export interface SensitiveFile {
  name: string;
  size: number;
  uri: string;
}

export interface FileEntry {
  name: string;
  size: number;
  uri: string;
}

export async function queryDocuments(): Promise<MediaFile[]> {
  return MediaStore.queryDocuments();
}

export async function queryDownloads(): Promise<MediaFile[]> {
  return MediaStore.queryDownloads();
}

export async function queryImageSize(): Promise<number> {
  return MediaStore.queryImageSize();
}

export async function queryVideoSize(): Promise<number> {
  return MediaStore.queryVideoSize();
}

export async function queryFolderSize(folderPath: string): Promise<number> {
  return MediaStore.queryFolderSize(folderPath);
}

export async function queryLargestFiles(
  folderPath: string,
  mimePrefix: string,
  limit: number
): Promise<LargestFile[]> {
  return MediaStore.queryLargestFiles(folderPath, mimePrefix, limit);
}

export async function querySensitiveFiles(keywords: string[]): Promise<SensitiveFile[]> {
  return MediaStore.querySensitiveFiles(keywords);
}

export async function queryAllFiles(): Promise<FileEntry[]> {
  return MediaStore.queryAllFiles();
}

export async function searchFiles(query: string): Promise<{
  name: string;
  uri: string;
  isDirectory: boolean;
  mimeType: string;
}[]> {
  return MediaStore.searchFiles(query);
}

export async function queryDocumentsByMime(mimeTypes: string[]): Promise<MediaFile[]> {
  return MediaStore.queryDocumentsByMime(mimeTypes);
}
