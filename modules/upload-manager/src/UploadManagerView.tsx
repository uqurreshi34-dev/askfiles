import { requireNativeView } from 'expo';
import * as React from 'react';

import { UploadManagerViewProps } from './UploadManager.types';

const NativeView: React.ComponentType<UploadManagerViewProps> =
  requireNativeView('UploadManager');

export default function UploadManagerView(props: UploadManagerViewProps) {
  return <NativeView {...props} />;
}
