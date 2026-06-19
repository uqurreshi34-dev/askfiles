import { requireNativeView } from 'expo';
import * as React from 'react';
import { DonutViewProps } from './StorageStats.types';

const NativeDonutView: React.ComponentType<DonutViewProps> =
  requireNativeView('StorageStats');

export function DonutView(props: DonutViewProps) {
  return <NativeDonutView {...props} />;
}
