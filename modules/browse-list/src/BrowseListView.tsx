import { requireNativeView } from 'expo';
import * as React from 'react';

import { BrowseListViewProps } from './BrowseList.types';

const NativeView: React.ComponentType<BrowseListViewProps> =
  requireNativeView('BrowseList');

export default function BrowseListView(props: BrowseListViewProps) {
  return <NativeView {...props} />;
}
