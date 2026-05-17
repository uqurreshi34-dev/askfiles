import { requireNativeView } from 'expo';
import * as React from 'react';

import { DocIndexerViewProps } from './DocIndexer.types';

const NativeView: React.ComponentType<DocIndexerViewProps> =
  requireNativeView('DocIndexer');

export default function DocIndexerView(props: DocIndexerViewProps) {
  return <NativeView {...props} />;
}
