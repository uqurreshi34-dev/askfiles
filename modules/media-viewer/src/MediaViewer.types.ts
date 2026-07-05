import { ViewStyle } from 'react-native';

export interface MediaViewerProps {
  uri: string;
  prevUri?: string;
  nextUri?: string;
  onTap?: () => void;
  style?: ViewStyle;
  onSwipeNext?: () => void;
  onSwipePrevious?: () => void;
}
