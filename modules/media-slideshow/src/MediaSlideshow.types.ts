import type { StyleProp, ViewStyle } from 'react-native';

export type MediaSlideshowProps = {
  uris: string[];
  currentIndex: number;
  onImagePress: (event: { nativeEvent: { index: number } }) => void;
  style?: StyleProp<ViewStyle>;
};
