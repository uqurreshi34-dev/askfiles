import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import StorageWidgetModule from '@/modules/storage-widget';

const RECENTS_KEY = 'askfiles_recents';
const MAX_RECENTS = 20;

export interface RecentFile {
  name: string;
  uri: string;
  openedAt: number;
}

async function syncWidget(recents: RecentFile[]): Promise<void> {
  try {
    await StorageWidgetModule.saveRecentsForWidget(JSON.stringify(recents.slice(0, 4)));
  } catch {}
}

export async function addRecent(file: RecentFile): Promise<void> {
  try {
    const decodedFile = {
      ...file,
      uri: decodeURIComponent(file.uri),
      name: decodeURIComponent(file.name),
    };
    const raw = await AsyncStorage.getItem(RECENTS_KEY);
    const existing: RecentFile[] = raw ? JSON.parse(raw) : [];
    const filtered = existing.filter(f => f.uri !== decodedFile.uri);
    const updated = [decodedFile, ...filtered].slice(0, MAX_RECENTS);
    await AsyncStorage.setItem(RECENTS_KEY, JSON.stringify(updated));
    await syncWidget(updated);
  } catch {}
}

export async function removeRecent(uri: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(RECENTS_KEY);
    const existing: RecentFile[] = raw ? JSON.parse(raw) : [];
    const updated = existing.filter(f => f.uri !== uri);
    await AsyncStorage.setItem(RECENTS_KEY, JSON.stringify(updated));
    await syncWidget(updated);
  } catch {}
}

export async function clearRecents(): Promise<void> {
  try {
    await AsyncStorage.setItem(RECENTS_KEY, JSON.stringify([]));
    await syncWidget([]);
  } catch {}
}

export function useRecents() {
  const [recents, setRecents] = useState<RecentFile[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(RECENTS_KEY);
      const parsed: RecentFile[] = raw ? JSON.parse(raw) : [];
      const valid: RecentFile[] = [];
      const seenNames = new Set<string>();
      for (const file of parsed) {
        try {
          const f = new FileSystem.File(file.uri);
          if (f.exists && !seenNames.has(file.name.toLowerCase())) {
            valid.push(file);
            seenNames.add(file.name.toLowerCase());
          }
        } catch {}
      }
      if (valid.length !== parsed.length) {
        await AsyncStorage.setItem(RECENTS_KEY, JSON.stringify(valid));
      }
      setRecents(valid);
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

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

export function getDateGroup(timestamp: number): string {
  const now = new Date();
  const date = new Date(timestamp);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 86400000;
  const weekStart = todayStart - 6 * 86400000;
  if (timestamp >= todayStart) return 'Today';
  if (timestamp >= yesterdayStart) return 'Yesterday';
  if (timestamp >= weekStart) return 'This week';
  return 'Older';
}
