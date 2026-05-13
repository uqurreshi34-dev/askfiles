import { requireNativeModule } from 'expo-modules-core';

const UploadManager = requireNativeModule('UploadManager');

export async function uploadToDropbox(
  filePath: string,
  token: string,
  fileName: string
): Promise<string> {
  return UploadManager.uploadToDropbox(filePath, token, fileName);
}

export async function uploadToOneDrive(
  filePath: string,
  token: string,
  fileName: string
): Promise<string> {
  return UploadManager.uploadToOneDrive(filePath, token, fileName);
}

export async function uploadToGoogleDrive(
  filePath: string,
  token: string,
  folderId: string,
  fileName: string,
  existingFileId: string
): Promise<string> {
  return UploadManager.uploadToGoogleDrive(filePath, token, folderId, fileName, existingFileId);
}

export async function downloadFile(
    url: string,
    headers: Record<string, string>,
    destPath: string,
    method: string = 'GET'
  ): Promise<string> {
    return UploadManager.downloadFile(url, headers, destPath, method);
  }
