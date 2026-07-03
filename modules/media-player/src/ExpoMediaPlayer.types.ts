import { ViewStyle } from 'react-native';

export interface MediaPlayerProps {
  uri: string;
  paused?: boolean;
  onTap?: (event: any) => void;
  onComplete?: (event: any) => void;
  style?: ViewStyle;
  speed?: number;
  onPlayingStateChange?: (event: { nativeEvent: { isPlaying: boolean } }) => void;
  onProgress?: (event: { nativeEvent: { position: number; duration: number } }) => void;
  onSeek?: (event: { nativeEvent: { position: number; duration: number } }) => void;
  seekTo?: number;
}
