import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface BookmarkItem {
  name: string;
  path: string;   // full uri, e.g. file:///storage/emulated/0/DCIM
  addedAt: number;
}

const KEY = 'askfiles_bookmarks';

let listeners: (() => void)[] = [];
let cache: BookmarkItem[] | null = null;

async function load(): Promise<BookmarkItem[]> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    cache = raw ? JSON.parse(raw) : [];
  } catch {
    cache = [];
  }
  return cache!;
}

async function save(items: BookmarkItem[]) {
  cache = items;
  await AsyncStorage.setItem(KEY, JSON.stringify(items));
  listeners.forEach(l => l());
}

export async function addBookmark(item: Omit<BookmarkItem, 'addedAt'>) {
  const items = await load();
  if (items.find(b => b.path === item.path)) return;
  await save([...items, { ...item, addedAt: Date.now() }]);
}

export async function removeBookmark(path: string) {
  const items = await load();
  await save(items.filter(b => b.path !== path));
}

export function isBookmarkedSync(path: string): boolean {
  return !!(cache ?? []).find(b => b.path === path);
}

export function useBookmarks() {
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>(cache ?? []);

  const refresh = useCallback(async () => {
    const items = await load();
    setBookmarks([...items]);
  }, []);

  useEffect(() => {
    refresh();
    listeners.push(refresh);
    return () => { listeners = listeners.filter(l => l !== refresh); };
  }, [refresh]);

  return { bookmarks, count: bookmarks.length };
}
