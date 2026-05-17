import * as React from 'react';

import { DocIndexerViewProps } from './DocIndexer.types';

export default function DocIndexerView(props: DocIndexerViewProps) {
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
