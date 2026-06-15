import { MediaViewerViewProps } from './MediaViewer.types';

// MediaViewerView is not available on the web platform.
export default function MediaViewerView(_props: MediaViewerViewProps) {
  throw new Error('MediaViewerView is not available on the web platform.');
}
