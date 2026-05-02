import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';

const RECENTS_KEY = 'askfiles_recents';
const MAX_RECENTS = 10;

export interface RecentFile {
  name: string;
  uri: string;
  openedAt: number;
}

export async function addRecent(file: RecentFile): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(RECENTS_KEY);
    const existing: RecentFile[] = raw ? JSON.parse(raw) : [];
    const filtered = existing.filter(f => f.uri !== file.uri);
    const updated = [file, ...filtered].slice(0, MAX_RECENTS);
    await AsyncStorage.setItem(RECENTS_KEY, JSON.stringify(updated));
  } catch (e) {
  }
}

export function useRecents() {
  const [recents, setRecents] = useState<RecentFile[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(RECENTS_KEY);
      const parsed: RecentFile[] = raw ? JSON.parse(raw) : [];

      // Remove ghost entries (files that no longer exist at their URI)
      const valid: RecentFile[] = [];
      const seenNames = new Set<string>();
      for (const file of parsed) {
        try {
          const f = new FileSystem.File(file.uri);
          if (f.exists && !seenNames.has(file.name.toLowerCase())) {
            valid.push(file);
            seenNames.add(file.name.toLowerCase());
          }
        } catch {
          // skip inaccessible files
        }
      }

      // Persist cleaned list back to storage
      if (valid.length !== parsed.length) {
        await AsyncStorage.setItem(RECENTS_KEY, JSON.stringify(valid));
      }

      setRecents(valid);
    } catch (e) {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { recents, loading, reload: load };
}

export function timeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  if (hours < 24) return `${hours} hr ago`;
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
}
