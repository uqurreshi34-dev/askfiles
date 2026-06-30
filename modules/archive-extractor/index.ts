import { requireNativeModule } from 'expo-modules-core';

const ArchiveExtractor = requireNativeModule('ArchiveExtractor');

export async function extract7z(srcPath: string, destDir: string, password?: string): Promise<string> {
  return ArchiveExtractor.extract7z(srcPath, destDir, password ?? null);
}

export function addExtractProgressListener(callback: (event: { current: number; total: number }) => void) {
  return (ArchiveExtractor as any).addListener('onExtractProgress', callback);
}
