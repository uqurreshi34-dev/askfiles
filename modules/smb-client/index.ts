import { requireNativeModule } from 'expo-modules-core';

const SmbClient = requireNativeModule('SmbClient');

export async function listShares(ip: string, domain: string, username: string, password: string): Promise<string[]> {
  return SmbClient.listShares(ip, domain, username, password);
}

export async function listDirectory(ip: string, share: string, path: string, domain: string, username: string, password: string): Promise<{ name: string; isDirectory: boolean; size: number }[]> {
  return SmbClient.listDirectory(ip, share, path, domain, username, password);
}

export async function downloadFile(ip: string, share: string, remotePath: string, localPath: string, domain: string, username: string, password: string): Promise<string> {
  return SmbClient.downloadFile(ip, share, remotePath, localPath, domain, username, password);
}

export async function uploadFile(localPath: string, ip: string, share: string, remotePath: string, domain: string, username: string, password: string): Promise<string> {
  return SmbClient.uploadFile(localPath, ip, share, remotePath, domain, username, password);
}

export function addDownloadProgressListener(callback: (event: { percent: number; bytesRead: number; total: number }) => void) {
  return (SmbClient as any).addListener('onDownloadProgress', callback);
}
