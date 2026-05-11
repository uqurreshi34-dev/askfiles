import * as React from 'react';

import { FileWatcherViewProps } from './FileWatcher.types';

export default function FileWatcherView(props: FileWatcherViewProps) {
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
