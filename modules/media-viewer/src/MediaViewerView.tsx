import { requireNativeView } from 'expo';
import { StyleProp, ViewStyle } from 'react-native';

interface MediaViewerViewProps {
  uri: string;
  prevUri?: string;
  nextUri?: string;
  onTap?: (event: any) => void;
  style?: StyleProp<ViewStyle>;
  onSwipeNext?: () => void;
  onSwipePrevious?: () => void;
}

const NativeMediaViewerView = requireNativeView<MediaViewerViewProps>('MediaViewer');
export default NativeMediaViewerView;
