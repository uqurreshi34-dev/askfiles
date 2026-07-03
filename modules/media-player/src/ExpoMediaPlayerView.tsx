import { requireNativeView } from 'expo';
import { StyleProp, ViewStyle } from 'react-native';

interface MediaPlayerViewProps {
  uri: string;
  paused?: boolean;
  onTap?: (event: any) => void;
  onComplete?: (event: any) => void;
  style?: StyleProp<ViewStyle>;
  speed?: number;
  onPlayingStateChange?: (event: { nativeEvent: { isPlaying: boolean } }) => void;
  onProgress?: (event: { nativeEvent: { position: number; duration: number } }) => void;
  onSeek?: (event: { nativeEvent: { position: number; duration: number } }) => void;
  seekTo?: number;
}

const NativeMediaPlayerView = requireNativeView<MediaPlayerViewProps>('MediaPlayer');
export default NativeMediaPlayerView;
