import * as React from 'react';

import { StorageStatsViewProps } from './StorageStats.types';

export default function StorageStatsView(props: StorageStatsViewProps) {
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
