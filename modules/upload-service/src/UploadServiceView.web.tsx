import * as React from 'react';

import { UploadServiceViewProps } from './UploadService.types';

export default function UploadServiceView(props: UploadServiceViewProps) {
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
