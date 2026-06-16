import { ExpoMediaPlayerViewProps } from './ExpoMediaPlayer.types';

// ExpoMediaPlayerView is not available on the web platform.
export default function ExpoMediaPlayerView(_props: ExpoMediaPlayerViewProps) {
  throw new Error('ExpoMediaPlayerView is not available on the web platform.');
}
