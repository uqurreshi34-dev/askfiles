import { requireNativeView } from 'expo';
import * as React from 'react';

import { PdfViewerViewProps } from './PdfViewer.types';

const NativeView: React.ComponentType<PdfViewerViewProps> =
  requireNativeView('PdfViewer');

export default function PdfViewerView(props: PdfViewerViewProps) {
  return <NativeView {...props} />;
}
