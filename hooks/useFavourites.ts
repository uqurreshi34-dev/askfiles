import { useState, useEffect, useCallback } from 'react';
import { File } from 'expo-file-system';
import { getFavourites as getFavouritesNative, setFavourites as setFavouritesNative } from '@/modules/storage-stats';

export interface FavouriteItem {
  name: string;
  uri: string;
  addedAt: number;
}

let listeners: (() => void)[] = [];
let cache: FavouriteItem[] | null = null;

function load(): FavouriteItem[] {
  if (cache) return cache;
  try {
    const raw = getFavouritesNative();
    cache = raw ? JSON.parse(raw) : [];
  } catch {
    cache = [];
  }
  return cache!;
}

function save(items: FavouriteItem[]) {
  cache = items;
  setFavouritesNative(JSON.stringify(items));
  listeners.forEach(l => l());
}

export async function addFavourite(item: Omit<FavouriteItem, 'addedAt'>) {
  const items = load();
  if (items.find(f => f.uri === item.uri)) return;
  save([{ ...item, addedAt: Date.now() }, ...items]);
}

export async function removeFavourite(uri: string) {
  const items = load();
  save(items.filter(f => f.uri !== uri));
}

// Called after a successful rename/move so the favourite follows the file
// to its new location instead of going stale and being silently dropped by
// cleanupBrokenFavourites the next time it runs.
export async function updateFavouritePath(oldUri: string, newUri: string, newName: string) {
  const items = load();
  const idx = items.findIndex(f => f.uri === oldUri);
  if (idx === -1) return;
  const updated = [...items];
  updated[idx] = { ...updated[idx], uri: newUri, name: newName };
  save(updated);
}

export async function cleanupBrokenFavourites() {
  const items = load();
  const valid: FavouriteItem[] = [];
  for (const item of items) {
    try {
      if (item.uri.startsWith('content://')) {
        valid.push(item);
      } else {
        const file = new File(item.uri);
        if (file.exists) valid.push(item);
      }
    } catch {
      valid.push(item);
    }
  }
  if (valid.length !== items.length) save(valid);
}

export async function isFavourite(uri: string): Promise<boolean> {
  const items = load();
  return !!items.find(f => f.uri === uri);
}

export function useFavourites() {
  const [favourites, setFavourites] = useState<FavouriteItem[]>(cache ?? load());

  const refresh = useCallback(() => {
    setFavourites([...load()]);
  }, []);

  useEffect(() => {
    refresh();
    listeners.push(refresh);
    return () => { listeners = listeners.filter(l => l !== refresh); };
  }, [refresh]);

  return { favourites, count: favourites.length };
}
