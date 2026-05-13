import * as React from 'react';

import { UploadManagerViewProps } from './UploadManager.types';

export default function UploadManagerView(props: UploadManagerViewProps) {
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
