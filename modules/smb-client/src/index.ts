import { requireNativeModule } from 'expo-modules-core';

const SmbClient = requireNativeModule('SmbClient');

export async function discoverDevices(): Promise<{ name: string; ip: string }[]> {
  return SmbClient.discoverDevices();
}

export async function listShares(ip: string, username: string, password: string): Promise<string[]> {
  return SmbClient.listShares(ip, username, password);
}

export async function listDirectory(ip: string, share: string, path: string, username: string, password: string): Promise<{ name: string; isDirectory: boolean; size: number }[]> {
  return SmbClient.listDirectory(ip, share, path, username, password);
}

export async function copyFromSmb(ip: string, share: string, remotePath: string, localPath: string, username: string, password: string): Promise<string> {
  return SmbClient.copyFromSmb(ip, share, remotePath, localPath, username, password);
}

export async function copyToSmb(ip: string, share: string, remotePath: string, localPath: string, username: string, password: string): Promise<string> {
  return SmbClient.copyToSmb(ip, share, remotePath, localPath, username, password);
}
