import * as React from 'react';

import { MediaGridViewProps } from './MediaGrid.types';

export default function MediaGridView(props: MediaGridViewProps) {
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
