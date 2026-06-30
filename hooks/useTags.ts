import { useState, useEffect, useCallback } from 'react';
import { getTags as getTagsNative, setTags as setTagsNative } from '@/modules/storage-stats';

export interface Tag {
  id: string;
  name: string;
  color: string;
  icon: string;
}

let listeners: (() => void)[] = [];
let cache: Tag[] | null = null;

function load(): Tag[] {
  if (cache) return cache;
  try {
    const raw = getTagsNative();
    cache = raw ? JSON.parse(raw) : [];
  } catch {
    cache = [];
  }
  return cache!;
}

function save(items: Tag[]) {
  cache = items;
  setTagsNative(JSON.stringify(items));
  listeners.forEach(l => l());
}

function generateId(): string {
  return `tag_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function addTag(tag: Omit<Tag, 'id'>): Promise<Tag> {
  const items = load();
  const newTag: Tag = { ...tag, id: generateId() };
  save([...items, newTag]);
  return newTag;
}

export async function updateTag(id: string, changes: Partial<Omit<Tag, 'id'>>) {
  const items = load();
  const idx = items.findIndex(t => t.id === id);
  if (idx === -1) return;
  const updated = [...items];
  updated[idx] = { ...updated[idx], ...changes };
  save(updated);
}

// Removing a tag definition does NOT touch file_tags here — callers should
// also strip this tag id from every file_tags entry (see useFileTags.removeTagFromAllFiles)
// to avoid orphaned tag ids lingering on files after the tag itself is gone.
export async function removeTag(id: string) {
  const items = load();
  save(items.filter(t => t.id !== id));
}

export async function getTag(id: string): Promise<Tag | undefined> {
  const items = load();
  return items.find(t => t.id === id);
}

export function useTags() {
  const [tags, setTags] = useState<Tag[]>(cache ?? load());

  const refresh = useCallback(() => {
    setTags([...load()]);
  }, []);

  useEffect(() => {
    refresh();
    listeners.push(refresh);
    return () => { listeners = listeners.filter(l => l !== refresh); };
  }, [refresh]);

  return { tags, count: tags.length };
}
