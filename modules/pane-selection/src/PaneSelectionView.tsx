import { requireNativeView } from 'expo';
import * as React from 'react';

import { PaneSelectionViewProps } from './PaneSelection.types';

const NativeView: React.ComponentType<PaneSelectionViewProps> =
  requireNativeView('PaneSelection');

export default function PaneSelectionView(props: PaneSelectionViewProps) {
  return <NativeView {...props} />;
}
