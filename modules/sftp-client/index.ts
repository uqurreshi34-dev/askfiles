import { NativeModule, requireNativeModule } from 'expo';

const SftpClient = requireNativeModule('SftpClient');

export function connect(host: string, port: number, username: string, password: string): Promise<string> {
  return SftpClient.connect(host, port, username, password);
}

export function listDirectory(path: string): Promise<{ name: string; isDirectory: boolean; size: number; modifiedTime: number }[]> {
  return SftpClient.listDirectory(path);
}

export function downloadFile(remotePath: string, localPath: string): Promise<string> {
  return SftpClient.downloadFile(remotePath, localPath);
}

export function uploadFile(localPath: string, remotePath: string): Promise<string> {
  return SftpClient.uploadFile(localPath, remotePath);
}

export function disconnect(): Promise<string> {
  return SftpClient.disconnect();
}

export function addTransferProgressListener(callback: (event: { percent: number }) => void) {
    return SftpClient.addListener('onTransferProgress', callback);
  }
