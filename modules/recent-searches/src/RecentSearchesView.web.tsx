import * as React from 'react';

import { RecentSearchesViewProps } from './RecentSearches.types';

export default function RecentSearchesView(props: RecentSearchesViewProps) {
  return (
    <div>
      <iframe
        style={{ flex: 1 }}
        src={props.url}
        onLoad={() => props.onLoad({ nativeEvent: { url: props.url } })}
      />
    </div>
  );
}
