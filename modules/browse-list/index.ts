import { requireNativeViewManager } from 'expo-modules-core';
import { ViewStyle } from 'react-native';

export interface FileItem {
  name: string;
  uri: string;
  isDirectory: boolean;
  size: number;
  date: number;
}

export interface BrowseListProps {
  items: FileItem[];
  folderCounts: Record<string, number>;
  selectedUris: string[];
  selectMode: boolean;
  style?: ViewStyle;
  colors?: {
    textPrimary: string;
    textMuted: string;
    border: string;
    blue: string;
    blueTint: string;
    yellow: string;
    surface: string;
    deleteRed: string;
  };
  onItemTap?: (event: { nativeEvent: { uri: string; name: string; isDirectory: boolean } }) => void;
  onItemLongPress?: (event: { nativeEvent: { uri: string; name: string; isDirectory: boolean } }) => void;
  onItemDotsPress?: (event: { nativeEvent: { uri: string; name: string; isDirectory: boolean } }) => void;
  onBookmarkPress?: (event: { nativeEvent: { uri: string; name: string } }) => void;
  onItemSwipeDelete?: (event: { nativeEvent: { uri: string; name: string; isDirectory: boolean } }) => void;
}

export const BrowseListView = requireNativeViewManager('BrowseList') as any;
