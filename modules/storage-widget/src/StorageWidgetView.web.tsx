import * as React from 'react';

import { StorageWidgetViewProps } from './StorageWidget.types';

export default function StorageWidgetView(props: StorageWidgetViewProps) {
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
