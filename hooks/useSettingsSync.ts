import { getTags, setTags, getFileTags, setFileTags, getFavourites, setFavourites, getPinnedFolders, setPinnedFolders } from '@/modules/storage-stats';

export interface SettingsBundle {
  tags: any[];
  fileTags: any[];
  favourites: any[];
  pinnedFolders: any[];
  exportedAt: string;
}

export function exportSettings(): SettingsBundle {
  const parse = (raw: string) => { try { return JSON.parse(raw); } catch { return []; } };
  return {
    tags: parse(getTags()),
    fileTags: parse(getFileTags()),
    favourites: parse(getFavourites()),
    pinnedFolders: parse(getPinnedFolders()),
    exportedAt: new Date().toISOString(),
  };
}

export function importSettings(cloud: SettingsBundle): void {
  const parse = (raw: string) => { try { return JSON.parse(raw); } catch { return []; } };

  // --- Tags: merge by name, local ID wins on conflict ---
  const localTags: any[] = parse(getTags());
  const mergedTags = [...localTags];
  for (const cloudTag of cloud.tags) {
    const exists = mergedTags.find(t => t.name === cloudTag.name);
    if (!exists) mergedTags.push(cloudTag);
  }
  setTags(JSON.stringify(mergedTags));

  // Build a remap: cloud tag id → local tag id (for file assignments)
  const tagIdRemap: Record<string, string> = {};
  for (const cloudTag of cloud.tags) {
    const local = mergedTags.find(t => t.name === cloudTag.name);
    if (local && local.id !== cloudTag.id) {
      tagIdRemap[cloudTag.id] = local.id;
    }
  }

  // --- File tags: merge by URI, remap tag IDs, union tagIds ---
  const localFileTags: any[] = parse(getFileTags());
  const mergedFileTags = [...localFileTags];
  for (const cloudEntry of cloud.fileTags) {
    const remappedIds = cloudEntry.tagIds.map((id: string) => tagIdRemap[id] ?? id);
    const localEntry = mergedFileTags.find(f => f.uri === cloudEntry.uri);
    if (!localEntry) {
      mergedFileTags.push({ ...cloudEntry, tagIds: remappedIds });
    } else {
      // Union tagIds
      const union = Array.from(new Set([...localEntry.tagIds, ...remappedIds]));
      localEntry.tagIds = union;
    }
  }
  setFileTags(JSON.stringify(mergedFileTags));

  // --- Favourites: union by URI ---
  const localFavs: any[] = parse(getFavourites());
  const cloudFavs: any[] = cloud.favourites ?? [];
  const favMap = new Map(localFavs.map(f => [f.uri, f]));
  for (const fav of cloudFavs) {
    if (!favMap.has(fav.uri)) favMap.set(fav.uri, fav);
  }
  setFavourites(JSON.stringify(Array.from(favMap.values())));

  // --- Pinned folders: union by path ---
  const localPinned: any[] = parse(getPinnedFolders());
  const cloudPinned: any[] = cloud.pinnedFolders ?? [];
  const pinnedMap = new Map(localPinned.map(p => [p.path, p]));
  for (const pin of cloudPinned) {
    if (!pinnedMap.has(pin.path)) pinnedMap.set(pin.path, pin);
  }
  setPinnedFolders(JSON.stringify(Array.from(pinnedMap.values())));

  // Invalidate all caches so next read reloads from SharedPreferences
  const { invalidateCache: invalidateTagsCache } = require('@/hooks/useTags');
  const { invalidateCache: invalidateFileTagsCache } = require('@/hooks/useFileTags');
  const { invalidateCache: invalidateFavsCache } = require('@/hooks/useFavourites');
  if (invalidateTagsCache) invalidateTagsCache();
  if (invalidateFileTagsCache) invalidateFileTagsCache();
  if (invalidateFavsCache) invalidateFavsCache();
}
