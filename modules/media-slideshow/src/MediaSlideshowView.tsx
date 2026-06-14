import { requireNativeViewManager } from 'expo-modules-core';
import * as React from 'react';
import { StyleSheet, View } from 'react-native';
import type { MediaSlideshowProps } from './MediaSlideshow.types';

const NativeView: React.ComponentType<MediaSlideshowProps> =
  requireNativeViewManager('MediaSlideshow');

export default function MediaSlideshowView(props: MediaSlideshowProps) {
  return (
    <View style={[{ flex: 1 }, props.style]}>
      <NativeView
        {...props}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}
