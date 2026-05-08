import type { StyleProp, ViewStyle } from 'react-native';

export type MediaGridProps = {
  uris: string[];
  numColumns: number;
  selectedUris: string[];
  selectMode: boolean;
  category: 'images' | 'videos';
  openingUri: string;
  onItemPress: (event: { nativeEvent: { uri: string; index: number } }) => void;
  onItemLongPress: (event: { nativeEvent: { uri: string; index: number } }) => void;
  style?: StyleProp<ViewStyle>;
};
