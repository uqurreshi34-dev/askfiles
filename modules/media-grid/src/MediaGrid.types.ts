import type { StyleProp, ViewStyle } from 'react-native';

export type MediaGridProps = {
  uris: string[];
  numColumns?: number;
  selectMode: boolean;
  category: 'images' | 'videos';
  openingUri: string;
  selectedUris?: string[];
  onItemPress: (event: { nativeEvent: { uri: string; index: number } }) => void;
  onItemLongPress: (event: { nativeEvent: { uri: string; index: number } }) => void;
  onSelectionChange: (event: { nativeEvent: { selectedUris: string[] } }) => void;
  style?: StyleProp<ViewStyle>;
};
