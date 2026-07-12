import * as React from 'react';

import { ImageHashViewProps } from './ImageHash.types';

export default function ImageHashView(props: ImageHashViewProps) {
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
