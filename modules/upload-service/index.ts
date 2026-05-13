import { requireNativeModule } from 'expo-modules-core';

const UploadService = requireNativeModule('UploadService');

export function startUploadService(message: string): void {
  UploadService.startService(message);
}

export function updateUploadService(message: string): void {
  UploadService.updateService(message);
}

export function stopUploadService(): void {
  UploadService.stopService();
}
