import { requireNativeModule } from 'expo-modules-core';

const FtpServer = requireNativeModule('FtpServer');

export interface FtpShareInfo {
  address: string;
  port: number;
  username: string;
  password: string;
}

// startServer rejects with this code when the phone is not on Wi-Fi or its own hotspot.
export const FTP_NO_WIFI = 'ERR_FTP_NO_WIFI';

export function startServer(port: number, rootPath: string): Promise<FtpShareInfo> {
  return FtpServer.startServer(port, rootPath);
}

export function stopServer(): Promise<string> {
  return FtpServer.stopServer();
}

export function isRunning(): Promise<boolean> {
  return FtpServer.isRunning();
}

export function getServerAddress(): Promise<string> {
  return FtpServer.getServerAddress();
}

// Replace the saved password; a running share switches to it at once.
export function newPassword(): Promise<string> {
  return FtpServer.newPassword();
}
