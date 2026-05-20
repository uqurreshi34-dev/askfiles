import { requireNativeView } from 'expo';
import * as React from 'react';

import { FileReaderViewProps } from './FileReader.types';

const NativeView: React.ComponentType<FileReaderViewProps> =
  requireNativeView('FileReader');

export default function FileReaderView(props: FileReaderViewProps) {
  return <NativeView {...props} />;
}
