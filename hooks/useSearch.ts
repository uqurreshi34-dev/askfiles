import { useState, useCallback } from 'react';
import * as FileSystem from 'expo-file-system';
import RNFS from 'react-native-fs';

export interface SearchResult {
  name: string;
  uri: string;
  isDirectory: boolean;
}

const STANDARD_DIRS = [
  'Download', 'Documents', 'Pictures', 'Movies', 'Music', 'DCIM', 'Recordings',
];

const EXTRA_DIRS = [
  'file:///storage/emulated/0/Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Images/',
  'file:///storage/emulated/0/Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Video/',
  'file:///storage/emulated/0/Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Documents/',
];

async function getSearchDirs(): Promise<string[]> {
  const ROOT = '/storage/emulated/0/';
  const dirs: string[] = STANDARD_DIRS.map(d => `file://${ROOT}${d}/`);
  try {
    const rootItems = await RNFS.readDir(ROOT);
    for (const item of rootItems) {
      if (!item.isDirectory()) continue;
      const name = item.name;
      if (name.startsWith('.')) continue;
      if (name === 'Android') continue; // handled separately via EXTRA_DIRS
      if (STANDARD_DIRS.includes(name)) continue; // already included
      dirs.push(`file://${ROOT}${name}/`);
    }
  } catch {}
  return [...dirs, ...EXTRA_DIRS];
}

async function searchDir(path: string, query: string, results: SearchResult[]): Promise<void> {
  try {
    const dir = new FileSystem.Directory(path);
    const contents = dir.list();
    for (const item of contents) {
      const rawName = item instanceof FileSystem.File
        ? item.name
        : item.uri.split('/').filter(Boolean).pop() ?? '';
      const name = (() => { try { return decodeURIComponent(rawName); } catch { return rawName; } })();
      if (name.startsWith('.')) continue;
      if (name.toLowerCase().includes(query.toLowerCase())) {
        results.push({
          name,
          uri: item.uri,
          isDirectory: item instanceof FileSystem.Directory,
        });
      }
      if (item instanceof FileSystem.Directory && results.length < 100) {
        await searchDir(item.uri, query, results);
      }
    }
  } catch {
    // skip inaccessible dirs
  }
}

export function useSearch() {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const search = useCallback(async (query: string) => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const found: SearchResult[] = [];
      const searchDirs = await getSearchDirs();
      // Check if any root folder name matches the query
      for (const dir of searchDirs) {
        const rawFolder = dir.replace(/\/$/, '').split('/').pop() ?? '';
        const folderName = (() => { try { return decodeURIComponent(rawFolder); } catch { return rawFolder; } })();
        if (folderName.toLowerCase().includes(query.toLowerCase())) {
          found.push({ name: folderName, uri: dir, isDirectory: true });
        }
      }
      for (const dir of searchDirs) {
        await searchDir(dir, query, found);
      }
      setResults(found);
    } finally {
      setSearching(false);
    }
  }, []);

  const removeResult = useCallback((uri: string) => {
    setResults(prev => prev.filter(r => r.uri !== uri));
  }, []);

  const removeResultsByName = useCallback((name: string) => {
    setResults(prev => prev.filter(r => r.name !== name));
  }, []);

  return { results, setResults, searching, search, removeResult, removeResultsByName };
}
