import * as React from 'react';

import { BrowseListViewProps } from './BrowseList.types';

export default function BrowseListView(props: BrowseListViewProps) {
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
