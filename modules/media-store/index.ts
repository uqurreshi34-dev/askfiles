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

export interface MediaInfo {
  width?: number;
  height?: number;
  duration?: string;
  durationMs?: number;
  mimeType?: string;
  size: number;
  dateTaken?: string;
  camera?: string;
  iso?: string;
  aperture?: string;
  shutter?: string;
  latitude?: number;
  longitude?: number;
  videoDate?: string
}

export interface FolderGroup {
  folderPath: string;
  folderName: string;
  previewUri: string;
  count: number;
  uris: string[];
}

export async function queryImageFolders(sortKey: string = 'name_asc'): Promise<FolderGroup[]> {
  return MediaStore.queryImageFolders(sortKey);
}

export async function queryVideoFolders(sortKey: string = 'name_asc'): Promise<FolderGroup[]> {
  return MediaStore.queryVideoFolders(sortKey);
}

export async function queryDocumentFolders(mimeTypes: string[] = [], sortKey: string = 'name_asc'): Promise<FolderGroup[]> {
  return MediaStore.queryDocumentFolders(mimeTypes, sortKey);
}

export async function queryDocuments(sortKey: string = 'name_asc'): Promise<MediaFile[]> {
  return MediaStore.queryDocuments(sortKey);
}

export async function queryDownloads(sortKey: string = 'name_asc'): Promise<MediaFile[]> {
  return MediaStore.queryDownloads(sortKey);
}

export async function queryDocumentsByMimeWithFolders(
  mimeTypes: string[] = [],
  sortKey: string = 'name_asc'
): Promise<{ files: MediaFile[]; folders: FolderGroup[] }> {
  return MediaStore.queryDocumentsByMimeWithFolders(mimeTypes, sortKey);
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

export async function searchFiles(query: string, category: string = ''): Promise<{
  name: string;
  uri: string;
  isDirectory: boolean;
  mimeType: string;
}[]> {
  return MediaStore.searchFiles(query, category);
}

export const queryImages = async (sortKey: string = 'date_desc'): Promise<{ name: string; uri: string; date: number; size: number }[]> =>
  MediaStore.queryImages(sortKey);

export const queryVideos = async (sortKey: string = 'date_desc'): Promise<{ name: string; uri: string; date: number; size: number }[]> =>
  MediaStore.queryVideos(sortKey);

export async function getMediaInfo(filePath: string): Promise<MediaInfo> {
  return MediaStore.getMediaInfo(filePath);
}
