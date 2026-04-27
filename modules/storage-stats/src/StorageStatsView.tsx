import { requireNativeView } from 'expo';
import * as React from 'react';

import { StorageStatsViewProps } from './StorageStats.types';

const NativeView: React.ComponentType<StorageStatsViewProps> =
  requireNativeView('StorageStats');

export default function StorageStatsView(props: StorageStatsViewProps) {
  return <NativeView {...props} />;
}
