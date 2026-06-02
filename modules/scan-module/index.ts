import { requireNativeModule } from 'expo-modules-core';

const ScanModule = requireNativeModule('ScanModule');

/**
 * Launch ML Kit Document Scanner.
 * Returns array of content:// URIs for scanned pages.
 * Throws SCAN_CANCELLED if user cancels.
 */
export function scanDocument(): Promise<string[]> {
  return ScanModule.scanDocument();
}

/**
 * Save scanned page URIs to the Scans folder as JPG files.
 * Returns array of absolute file paths that were saved.
 */
export function saveScanPages(uris: string[], folderPath: string): Promise<string[]> {
  return ScanModule.saveScanPages(uris, folderPath);
}

export function saveScanAsPdf(uris: string[], folderPath: string): Promise<string> {
  return ScanModule.saveScanAsPdf(uris, folderPath);
}

/**
 * Run OCR on saved scan JPG files.
 * Returns map of { filePath: extractedText }
 * Runs on background thread — call after showing "Saved" alert.
 */
export function ocrScanPages(paths: string[]): Promise<Record<string, string>> {
  return ScanModule.ocrScanPages(paths);
}
