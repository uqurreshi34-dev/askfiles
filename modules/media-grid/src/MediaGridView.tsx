import { requireNativeViewManager } from 'expo-modules-core';
import * as React from 'react';
import { StyleSheet, View } from 'react-native';
import type { MediaGridProps } from './MediaGrid.types';

const NativeView: React.ComponentType<MediaGridProps> =
  requireNativeViewManager('MediaGrid');

export default function MediaGridView(props: MediaGridProps) {
  return (
    <View style={[{ flex: 1 }, props.style]}>
      <NativeView
        {...props}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}
