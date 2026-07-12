import { requireNativeViewManager } from 'expo-modules-core';
import { ViewStyle } from 'react-native';

export interface PdfViewerProps {
  uri: string;
  page: number;
  onPageCount?: (event: { nativeEvent: { count: number } }) => void;
  style?: ViewStyle;
}

export const PdfView = requireNativeViewManager('PdfViewer') as any;

export async function resolveContentUri(uri: string): Promise<{ path: string; name: string } | null> {
  const { requireNativeModule } = require('expo-modules-core');
  const PdfViewer = requireNativeModule('PdfViewer');
  return PdfViewer.resolveContentUri(uri);
}

  export async function renderThumbnail(filePath: string, pageIndex: number): Promise<string | null> {
    const { requireNativeModule } = require('expo-modules-core');
    const PdfViewer = requireNativeModule('PdfViewer');
    return PdfViewer.renderThumbnail(filePath, pageIndex);
  }
