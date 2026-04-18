import { useState, useCallback } from 'react';
import * as FileSystem from 'expo-file-system';

export interface SearchResult {
  name: string;
  uri: string;
  isDirectory: boolean;
}

const SEARCH_DIRS = [
  'file:///storage/emulated/0/Download/',
  'file:///storage/emulated/0/Documents/',
  'file:///storage/emulated/0/Pictures/',
  'file:///storage/emulated/0/Movies/',
  'file:///storage/emulated/0/Music/',
  'file:///storage/emulated/0/DCIM/',
  'file:///storage/emulated/0/Recordings/',
];

async function searchDir(path: string, query: string, results: SearchResult[]): Promise<void> {
  try {
    const dir = new FileSystem.Directory(path);
    const contents = dir.list();
    for (const item of contents) {
      const name = item instanceof FileSystem.File
        ? item.name
        : item.uri.split('/').filter(Boolean).pop() ?? '';
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
      for (const dir of SEARCH_DIRS) {
        await searchDir(dir, query, found);
      }
      setResults(found);
    } finally {
      setSearching(false);
    }
  }, []);

  return { results, searching, search };
}
