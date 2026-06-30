import { requireNativeModule } from 'expo-modules-core';

const WebDavClient = requireNativeModule('WebDavClient');

export async function connect(url: string, username: string, password: string): Promise<string> {
  return WebDavClient.connect(url, username, password);
}

export async function listDirectory(path: string): Promise<{ name: string; isDirectory: boolean; size: number; modifiedTime: number }[]> {
  return WebDavClient.listDirectory(path);
}

export async function downloadFile(remotePath: string, localPath: string): Promise<string> {
  return WebDavClient.downloadFile(remotePath, localPath);
}

export async function uploadFile(localPath: string, remotePath: string): Promise<string> {
  return WebDavClient.uploadFile(localPath, remotePath);
}

export async function createDirectory(path: string): Promise<string> {
  return WebDavClient.createDirectory(path);
}

export async function deleteFile(path: string): Promise<string> {
  return WebDavClient.deleteFile(path);
}

export async function moveFile(src: string, dst: string): Promise<string> {
  return WebDavClient.moveFile(src, dst);
}

export async function disconnect(): Promise<string> {
  return WebDavClient.disconnect();
}
