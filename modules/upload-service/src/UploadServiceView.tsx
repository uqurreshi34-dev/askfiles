import { requireNativeView } from 'expo';
import * as React from 'react';

import { UploadServiceViewProps } from './UploadService.types';

const NativeView: React.ComponentType<UploadServiceViewProps> =
  requireNativeView('UploadService');

export default function UploadServiceView(props: UploadServiceViewProps) {
  return <NativeView {...props} />;
}
