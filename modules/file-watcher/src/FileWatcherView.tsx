import { requireNativeView } from 'expo';
import * as React from 'react';

import { FileWatcherViewProps } from './FileWatcher.types';

const NativeView: React.ComponentType<FileWatcherViewProps> =
  requireNativeView('FileWatcher');

export default function FileWatcherView(props: FileWatcherViewProps) {
  return <NativeView {...props} />;
}
