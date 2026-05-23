import { requireNativeModule } from 'expo-modules-core';

const MediaStore = requireNativeModule('MediaStore');

export interface MediaFile {
  name: string;
  uri: string;
  size: number;
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
