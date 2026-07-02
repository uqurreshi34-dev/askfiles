import { getTags, setTags, getFileTags, setFileTags, getFavourites, setFavourites, getPinnedFolders, setPinnedFolders } from '@/modules/storage-stats';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { THEME_KEY, LIGHT_PALETTE_KEY, DARK_PALETTE_KEY, setThemePreference, setLightPalettePreference, setDarkPalettePreference } from '@/hooks/useTheme';

export interface SettingsBundle {
  tags: any[];
  fileTags: any[];
  favourites: any[];
  pinnedFolders: any[];
  theme: string | null;
  lightPalette: string | null;
  darkPalette: string | null;
  exportedAt: string;
}

export async function exportSettings(): Promise<SettingsBundle> {
  const parse = (raw: string) => { try { return JSON.parse(raw); } catch { return []; } };
  const [theme, lightPalette, darkPalette] = await Promise.all([
    AsyncStorage.getItem(THEME_KEY),
    AsyncStorage.getItem(LIGHT_PALETTE_KEY),
    AsyncStorage.getItem(DARK_PALETTE_KEY),
  ]);
  return {
    tags: parse(getTags()),
    fileTags: parse(getFileTags()),
    favourites: parse(getFavourites()),
    pinnedFolders: parse(getPinnedFolders()),
    theme,
    lightPalette,
    darkPalette,
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

    // --- Theme & palette: cloud wins only if local has never been set ---
  (async () => {
    const existingTheme = await AsyncStorage.getItem(THEME_KEY);
    if (!existingTheme && cloud.theme) await setThemePreference(cloud.theme === 'dark');

    const existingLight = await AsyncStorage.getItem(LIGHT_PALETTE_KEY);
    if (!existingLight && cloud.lightPalette) await setLightPalettePreference(cloud.lightPalette as any);

    const existingDark = await AsyncStorage.getItem(DARK_PALETTE_KEY);
    if (!existingDark && cloud.darkPalette) await setDarkPalettePreference(cloud.darkPalette as any);
  })();

  // Invalidate all caches so next read reloads from SharedPreferences
  const { invalidateCache: invalidateTagsCache } = require('@/hooks/useTags');
  const { invalidateCache: invalidateFileTagsCache } = require('@/hooks/useFileTags');
  const { invalidateCache: invalidateFavsCache } = require('@/hooks/useFavourites');
  if (invalidateTagsCache) invalidateTagsCache();
  if (invalidateFileTagsCache) invalidateFileTagsCache();
  if (invalidateFavsCache) invalidateFavsCache();
}
