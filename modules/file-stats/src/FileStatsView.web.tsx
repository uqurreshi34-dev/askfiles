import * as React from 'react';

import { FileStatsViewProps } from './FileStats.types';

export default function FileStatsView(props: FileStatsViewProps) {
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
