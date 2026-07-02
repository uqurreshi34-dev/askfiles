import { useState, useEffect, useCallback } from 'react';
import { getFileTags as getFileTagsNative, setFileTags as setFileTagsNative } from '@/modules/storage-stats';
import RNFS from 'react-native-fs';
import { toPath } from '@/utils/files';

export interface FileTagEntry {
  uri: string;
  name: string;
  tagIds: string[];
}

let listeners: (() => void)[] = [];
let cache: FileTagEntry[] | null = null;
export function invalidateCache() {
  cache = null;
  listeners.forEach(l => l());
}

function load(): FileTagEntry[] {
  if (cache) return cache;
  try {
    const raw = getFileTagsNative();
    cache = raw ? JSON.parse(raw) : [];
  } catch {
    cache = [];
  }
  return cache!;
}

function save(items: FileTagEntry[]) {
  cache = items;
  setFileTagsNative(JSON.stringify(items));
  listeners.forEach(l => l());
}

// Adds tagId to uri's entry, creating the entry if it doesn't exist yet.
// Safe to call repeatedly - won't duplicate an already-applied tag.
export async function addTagToFile(uri: string, name: string, tagId: string) {
  const items = load();
  const idx = items.findIndex(f => f.uri === uri);
  if (idx === -1) {
    save([...items, { uri, name, tagIds: [tagId] }]);
    return;
  }
  if (items[idx].tagIds.includes(tagId)) return;
  const updated = [...items];
  updated[idx] = { ...updated[idx], tagIds: [...updated[idx].tagIds, tagId] };
    save(updated);
}

// Removes tagId from uri's entry. If that was the file's last tag, the
// entry itself is dropped rather than left behind as an empty tagIds: [] row.
export async function removeTagFromFile(uri: string, tagId: string) {
  const items = load();
  const idx = items.findIndex(f => f.uri === uri);
  if (idx === -1) return;
  const remainingTagIds = items[idx].tagIds.filter(id => id !== tagId);
  if (remainingTagIds.length === 0) {
    save(items.filter(f => f.uri !== uri));
    return;
  }
  const updated = [...items];
  updated[idx] = { ...updated[idx], tagIds: remainingTagIds };
  save(updated);
}

// Called when a tag definition is deleted entirely - strips that tag id
// from every file that had it, so no file is left referencing a tag that
// no longer exists.
export async function removeTagFromAllFiles(tagId: string) {
  const items = load();
  const updated = items
    .map(f => ({ ...f, tagIds: f.tagIds.filter(id => id !== tagId) }))
    .filter(f => f.tagIds.length > 0);
  save(updated);
}

// Called after a successful rename/move so tag assignments follow the file
// to its new uri instead of silently orphaning - same gap this fixes for
// favourites via updateFavouritePath.
export async function updateFileTagsPath(oldUri: string, newUri: string, newName: string) {
  const items = load();
  const idx = items.findIndex(f => f.uri === oldUri);
  if (idx === -1) return;
  const updated = [...items];
  updated[idx] = { ...updated[idx], uri: newUri, name: newName };
  save(updated);
}

export async function getTagsForFile(uri: string): Promise<string[]> {
    // Always reload from native storage to avoid stale cache after writes
    cache = null;
    const items = load();
    return items.find(f => f.uri === uri)?.tagIds ?? [];
  }

export async function getFilesForTag(tagId: string): Promise<FileTagEntry[]> {
  const items = load();
  return items.filter(f => f.tagIds.includes(tagId));
}

export function useFileTags() {
  const [fileTags, setFileTags] = useState<FileTagEntry[]>(cache ?? load());

  const refresh = useCallback(() => {
    setFileTags([...load()]);
  }, []);

  useEffect(() => {
    refresh();
    listeners.push(refresh);
    return () => { listeners = listeners.filter(l => l !== refresh); };
  }, [refresh]);

  return { fileTags, count: fileTags.length };
}

export async function cleanupBrokenFileTags(): Promise<void> {
  const items = load();
  if (items.length === 0) return;
  const results = await Promise.all(items.map(f => RNFS.exists(toPath(f.uri))));
  const alive = items.filter((_, i) => results[i]);
  if (alive.length !== items.length) save(alive);
}
