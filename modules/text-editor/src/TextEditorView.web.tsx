import * as React from 'react';

import { TextEditorViewProps } from './TextEditor.types';

export default function TextEditorView(props: TextEditorViewProps) {
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
