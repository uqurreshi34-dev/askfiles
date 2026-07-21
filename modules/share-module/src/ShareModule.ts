import { requireNativeModule } from 'expo';

declare class ShareModuleType {
  shareFiles(paths: string[], mimeType: string): Promise<void>;
  openFile(filePath: string, mimeType: string): Promise<void>;
  scanFile(filePath: string): Promise<void>;
  printImage(filePath: string): Promise<void>;
  printPdf(filePath: string): Promise<void>;
  copyImageToClipboard(filePath: string, mimeType: string): Promise<void>;
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

export async function printImage(filePath: string): Promise<void> {
  return ShareModule.printImage(filePath);
}

export async function printPdf(filePath: string): Promise<void> {
  return ShareModule.printPdf(filePath);
}

export async function copyImageToClipboard(filePath: string, mimeType: string = 'image/*'): Promise<void> {
  return ShareModule.copyImageToClipboard(filePath, mimeType);
}
