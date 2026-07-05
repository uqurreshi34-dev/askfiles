import * as React from 'react';

import { PaneSelectionViewProps } from './PaneSelection.types';

export default function PaneSelectionView(props: PaneSelectionViewProps) {
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
