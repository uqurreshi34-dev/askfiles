import { requireNativeModule } from 'expo';

declare class ShareModuleType {
  shareFiles(paths: string[], mimeType: string): Promise<void>;
  openFile(filePath: string, mimeType: string): Promise<void>;
  scanFile(filePath: string): Promise<void>;
}

const ShareModule = requireNativeModule<ShareModuleType>('ShareModule');

export async function shareFiles(paths: string[], mimeType: string = '*/*'): Promise<void> {
  return ShareModule.shareFiles(paths, mimeType);
}

export async function openFile(filePath: string, mimeType: string): Promise<void> {
  return ShareModule.openFile(filePath, mimeType);
}

export async function scanFile(filePath: string): Promise<void> {
  return ShareModule.scanFile(filePath);
}
