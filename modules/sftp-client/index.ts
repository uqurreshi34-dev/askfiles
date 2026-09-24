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

// connect() rejects with one of these codes when the server's key is not yet trusted.
// Nothing, including the password, has been sent to the server at that point.
export const HOST_KEY_UNKNOWN = 'ERR_SFTP_HOST_KEY_UNKNOWN';
export const HOST_KEY_CHANGED = 'ERR_SFTP_HOST_KEY_CHANGED';

export interface PendingHostKey {
  host: string;
  port: number;
  type: string;
  fingerprint: string;
  changed: boolean;
}

// The key the last refused connection presented, for the user to accept or refuse.
export function pendingHostKey(): Promise<PendingHostKey | null> {
  return SftpClient.pendingHostKey();
}

// Trust the key the user was shown. Resolves false if it no longer matches what the
// server presented, or could not be saved.
export function trustHostKey(host: string, port: number, fingerprint: string): Promise<boolean> {
  return SftpClient.trustHostKey(host, port, fingerprint);
}

export function addTransferProgressListener(callback: (event: { percent: number }) => void) {
    return SftpClient.addListener('onTransferProgress', callback);
  }
