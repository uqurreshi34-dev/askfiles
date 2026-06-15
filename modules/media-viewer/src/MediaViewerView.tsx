import { requireNativeView } from 'expo';
import { StyleProp, ViewStyle } from 'react-native';

interface MediaViewerViewProps {
  uri: string;
  onTap?: (event: any) => void;
  style?: StyleProp<ViewStyle>;
}

const NativeMediaViewerView = requireNativeView<MediaViewerViewProps>('MediaViewer');
export default NativeMediaViewerView;
