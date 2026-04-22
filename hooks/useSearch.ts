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
  'file:///storage/emulated/0/Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Images/',
  'file:///storage/emulated/0/Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Video/',
  'file:///storage/emulated/0/Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Documents/',
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
      // Deduplicate by filename — hardlinked files appear at multiple paths
      const seen = new Set<string>();
      const deduped = found.filter(r => {
        if (seen.has(r.name.toLowerCase())) return false;
        seen.add(r.name.toLowerCase());
        return true;
      });
      setResults(deduped);
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

  return { results, searching, search, removeResult, removeResultsByName };
}
