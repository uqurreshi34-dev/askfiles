import { requireNativeView } from 'expo';
import * as React from 'react';

import { MediaStoreViewProps } from './MediaStore.types';

const NativeView: React.ComponentType<MediaStoreViewProps> =
  requireNativeView('MediaStore');

export default function MediaStoreView(props: MediaStoreViewProps) {
  return <NativeView {...props} />;
}
