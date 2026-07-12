import { requireNativeView } from 'expo';
import * as React from 'react';

import { ImageHashViewProps } from './ImageHash.types';

const NativeView: React.ComponentType<ImageHashViewProps> =
  requireNativeView('ImageHash');

export default function ImageHashView(props: ImageHashViewProps) {
  return <NativeView {...props} />;
}
