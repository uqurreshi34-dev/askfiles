import { requireNativeView } from 'expo';
import * as React from 'react';

import { FileStatsViewProps } from './FileStats.types';

const NativeView: React.ComponentType<FileStatsViewProps> =
  requireNativeView('FileStats');

export default function FileStatsView(props: FileStatsViewProps) {
  return <NativeView {...props} />;
}
