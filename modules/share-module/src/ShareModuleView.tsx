import { requireNativeView } from 'expo';
import * as React from 'react';

import { ShareModuleViewProps } from './ShareModule.types';

const NativeView: React.ComponentType<ShareModuleViewProps> =
  requireNativeView('ShareModule');

export default function ShareModuleView(props: ShareModuleViewProps) {
  return <NativeView {...props} />;
}
