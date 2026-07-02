import { ViewStyle } from 'react-native';

export interface MediaViewerProps {
  uri: string;
  onTap?: () => void;
  style?: ViewStyle;
  onSwipeNext?: () => void;
  onSwipePrevious?: () => void;
}
