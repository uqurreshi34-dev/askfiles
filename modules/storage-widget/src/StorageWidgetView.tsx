import { requireNativeView } from 'expo';
import * as React from 'react';

import { StorageWidgetViewProps } from './StorageWidget.types';

const NativeView: React.ComponentType<StorageWidgetViewProps> =
  requireNativeView('StorageWidget');

export default function StorageWidgetView(props: StorageWidgetViewProps) {
  return <NativeView {...props} />;
}
