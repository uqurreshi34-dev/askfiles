import { requireNativeView } from 'expo';
import * as React from 'react';

import { RecentSearchesViewProps } from './RecentSearches.types';

const NativeView: React.ComponentType<RecentSearchesViewProps> =
  requireNativeView('RecentSearches');

export default function RecentSearchesView(props: RecentSearchesViewProps) {
  return <NativeView {...props} />;
}
