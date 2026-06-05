import { requireNativeModule } from 'expo-modules-core';

const PdfCreator = requireNativeModule('PdfCreator');

export function addPdfProgressListener(
  callback: (event: { current: number; total: number }) => void
) {
  return PdfCreator.addListener('onPageProcessed', callback);
}

export async function createPdfFromImages(imagePaths: string[], outputPath: string): Promise<string> {
  return await PdfCreator.createPdfFromImages(imagePaths, outputPath);
}
