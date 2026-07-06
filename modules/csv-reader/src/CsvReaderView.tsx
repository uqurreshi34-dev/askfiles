import { requireNativeView } from 'expo';
import * as React from 'react';

import { CsvReaderViewProps } from './CsvReader.types';

const NativeView: React.ComponentType<CsvReaderViewProps> =
  requireNativeView('CsvReader');

export default function CsvReaderView(props: CsvReaderViewProps) {
  return <NativeView {...props} />;
}
