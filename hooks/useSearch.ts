import { useState, useCallback } from 'react';
import { searchFiles } from 'media-store';

export interface SearchResult {
  name: string;
  uri: string;
  isDirectory: boolean;
  mimeType?: string;
}

export function useSearch() {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const search = useCallback(async (query: string, category: string = '') => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const found = await searchFiles(query.trim(), category);
      setResults(found);
    } catch {
      setResults([]);
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
