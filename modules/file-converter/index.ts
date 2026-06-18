import { requireNativeModule } from 'expo';

const FileConverter = requireNativeModule('FileConverter');

/**
 * Convert an image from one format to another.
 * @param inputPath  Absolute path to source file (no file:// prefix)
 * @param outputPath Absolute path for output file (no file:// prefix)
 * @param format     Output format: 'JPG', 'PNG', or 'WEBP'
 * @param quality    Compression quality 1-100 (ignored for PNG — lossless)
 * @returns          Output path on success
 */
export function convertImage(
  inputPath: string,
  outputPath: string,
  format: 'JPG' | 'PNG' | 'WEBP',
  quality: number = 90
): Promise<string> {
  return FileConverter.convertImage(inputPath, outputPath, format, quality);
}

/**
 * Returns list of supported input formats on this device.
 * HEIC/HEIF only supported on Android 10+.
 */
export function getSupportedInputFormats(): string[] {
  return FileConverter.getSupportedInputFormats();
}
