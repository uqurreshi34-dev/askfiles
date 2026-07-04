import { requireNativeModule } from 'expo-modules-core';

const FileStats = requireNativeModule('FileStats');

export interface FileStatsResult {
  count: number;
  firstOpened: number;
  lastOpened: number;
}

export interface FileStatEntry {
    uri: string;
    count: number;
    firstOpened: number;
    lastOpened: number;
  }

// Fire and forget — call every time a file is opened
export function recordOpen(uri: string): void {
  FileStats.recordOpen(uri).catch(() => {});
}

// Synchronous — safe to call inline when building Info sheet
export function getStats(uri: string): FileStatsResult | null {
  try {
    return FileStats.getStats(uri);
  } catch {
    return null;
  }
}

// Call when file is deleted or moved
export function removeStats(uri: string): void {
  FileStats.removeStats(uri).catch(() => {});
}
  
export function getAllStats(): FileStatEntry[] {
  try {
      return FileStats.getAllStats() ?? [];
  } catch {
      return [];
  }
}

export function getValidStats(): FileStatEntry[] {
  try {
    return FileStats.getValidStats() ?? [];
  } catch {
    return [];
  }
}
