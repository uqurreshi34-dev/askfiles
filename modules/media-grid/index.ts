export { default as MediaGridView } from './src/MediaGridView';
export type { MediaGridProps } from './src/MediaGrid.types';
import { requireNativeModule } from 'expo-modules-core';
const MediaGrid = requireNativeModule('MediaGrid');
export async function getVideoThumbnail(uri: string): Promise<string | null> {
  return MediaGrid.getVideoThumbnail(uri);
}
