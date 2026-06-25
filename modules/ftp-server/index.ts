import { requireNativeModule } from 'expo-modules-core';

const FtpServer = requireNativeModule('FtpServer');

export function startServer(port: number, rootPath: string): Promise<string> {
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
