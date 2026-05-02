import * as React from 'react';

import { ShareModuleViewProps } from './ShareModule.types';

export default function ShareModuleView(props: ShareModuleViewProps) {
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
