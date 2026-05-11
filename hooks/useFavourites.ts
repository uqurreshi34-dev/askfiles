import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { File } from 'expo-file-system';

export interface FavouriteItem {
  name: string;
  uri: string;
  addedAt: number;
}

const KEY = 'askfiles_favourites';

let listeners: (() => void)[] = [];
let cache: FavouriteItem[] | null = null;

async function load(): Promise<FavouriteItem[]> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    cache = raw ? JSON.parse(raw) : [];
  } catch {
    cache = [];
  }
  return cache!;
}

async function save(items: FavouriteItem[]) {
  cache = items;
  await AsyncStorage.setItem(KEY, JSON.stringify(items));
  listeners.forEach(l => l());
}

export async function addFavourite(item: Omit<FavouriteItem, 'addedAt'>) {
  const items = await load();
  if (items.find(f => f.uri === item.uri)) return;
  await save([{ ...item, addedAt: Date.now() }, ...items]);
}

export async function removeFavourite(uri: string) {
  const items = await load();
  await save(items.filter(f => f.uri !== uri));
}

export async function cleanupBrokenFavourites() {
  const items = await load();
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
  if (valid.length !== items.length) await save(valid);
}

export async function isFavourite(uri: string): Promise<boolean> {
  const items = await load();
  return !!items.find(f => f.uri === uri);
}

export function useFavourites() {
  const [favourites, setFavourites] = useState<FavouriteItem[]>(cache ?? []);

  const refresh = useCallback(async () => {
    const items = await load();
    setFavourites([...items]);
  }, []);

  useEffect(() => {
    refresh();
    listeners.push(refresh);
    return () => { listeners = listeners.filter(l => l !== refresh); };
  }, [refresh]);

  return { favourites, count: favourites.length };
}
