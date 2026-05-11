import { requireNativeModule, EventEmitter } from 'expo-modules-core';

const FileWatcher = requireNativeModule('FileWatcher');
const emitter = new EventEmitter(FileWatcher as any);

export type FileChangeEvent = {
  path: string;
  file: string;
  event: 'CREATE' | 'DELETE' | 'MODIFY' | 'UNKNOWN';
};

export function startWatching(path: string): void {
  FileWatcher.startWatching(path);
}

export function stopWatching(path: string): void {
  FileWatcher.stopWatching(path);
}

export function stopAll(): void {
  FileWatcher.stopAll();
}

export async function startMediaStoreObserver(): Promise<void> {
    await FileWatcher.startMediaStoreObserver();
  }
  
  export async function stopMediaStoreObserver(): Promise<void> {
    await FileWatcher.stopMediaStoreObserver();
  }
  
  export function addMediaStoreChangeListener(
    listener: (event: { uri: string }) => void
  ): { remove: () => void } {
    const sub = (emitter as any).addListener('onMediaStoreChange', listener);
    return sub;
  }

export function addFileChangeListener(
    listener: (event: FileChangeEvent) => void
  ): { remove: () => void } {
    const sub = (emitter as any).addListener('onFileChange', listener);
    return sub;
  }
