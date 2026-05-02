import { requireNativeModule } from 'expo';

declare class ShareModuleType {
  shareFiles(paths: string[], mimeType: string): Promise<void>;
}

const ShareModule = requireNativeModule<ShareModuleType>('ShareModule');

export async function shareFiles(paths: string[], mimeType: string = '*/*'): Promise<void> {
  return ShareModule.shareFiles(paths, mimeType);
}
