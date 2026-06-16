import { ViewStyle } from 'react-native';

export interface MediaPlayerProps {
  uri: string;
  paused?: boolean;
  onTap?: (event: any) => void;
  onComplete?: (event: any) => void;
  style?: ViewStyle;
}
