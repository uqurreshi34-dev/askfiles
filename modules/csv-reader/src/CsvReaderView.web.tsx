import * as React from 'react';

import { CsvReaderViewProps } from './CsvReader.types';

export default function CsvReaderView(props: CsvReaderViewProps) {
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
