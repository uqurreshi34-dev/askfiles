import * as React from 'react';

import { FileReaderViewProps } from './FileReader.types';

export default function FileReaderView(props: FileReaderViewProps) {
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
