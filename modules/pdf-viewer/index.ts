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

export function getPendingIntentType(): { type: 'pdf' | 'csv' | 'text'; uri: string } | null {
    const { requireNativeModule } = require('expo-modules-core');
    const PdfViewer = requireNativeModule('PdfViewer');
    return PdfViewer.getPendingIntentType();
  }
  
  export function clearPendingIntent(): void {
    const { requireNativeModule } = require('expo-modules-core');
    const PdfViewer = requireNativeModule('PdfViewer');
    PdfViewer.clearPendingIntent();
  }
