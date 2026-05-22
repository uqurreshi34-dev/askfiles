import * as React from 'react';

import { MediaStoreViewProps } from './MediaStore.types';

export default function MediaStoreView(props: MediaStoreViewProps) {
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
