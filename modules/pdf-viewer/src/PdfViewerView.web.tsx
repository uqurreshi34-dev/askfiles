import * as React from 'react';

import { PdfViewerViewProps } from './PdfViewer.types';

export default function PdfViewerView(props: PdfViewerViewProps) {
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
