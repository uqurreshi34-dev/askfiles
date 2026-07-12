import { requireNativeModule } from 'expo-modules-core';

const ImageHash = requireNativeModule('ImageHash');

export interface ImageDuplicateFile {
  uri: string;
  path: string;
  name: string;
  size: number;
  dateAdded: number;
}

export interface ImageDuplicateGroup {
  key: string;
  files: ImageDuplicateFile[];
}

export async function scanImageDuplicates(): Promise<ImageDuplicateGroup[]> {
  return ImageHash.scanImageDuplicates();
}
