/**
 * The Cleaner's last scan, shared between the summary screen and a group's
 * file list, so opening a group does not scan the phone again. Group screens
 * remove files from here as they are cleaned, so the summary stays honest
 * without a rescan.
 */
import { scanCleanup, CleanupGroup, CleanupGroupId } from '@/modules/media-store';

let groups: CleanupGroup[] | null = null;
const listeners = new Set<() => void>();

function emit() { listeners.forEach(l => l()); }

export function cleanerGroups(): CleanupGroup[] | null { return groups; }

export function cleanerGroup(id: CleanupGroupId): CleanupGroup | undefined {
  return groups?.find(g => g.id === id);
}

export async function runCleanerScan(): Promise<CleanupGroup[]> {
  const result = await scanCleanup();
  groups = result.filter(g => g.count > 0).sort((a, b) => b.bytes - a.bytes);
  emit();
  return groups;
}

/** Drop files that were cleaned, keeping each group's totals right. */
export function removeCleanedFiles(id: CleanupGroupId, uris: Set<string>) {
  if (!groups) return;
  groups = groups
    .map(g => {
      if (g.id !== id) return g;
      const gone = g.files.filter(f => uris.has(f.uri));
      return {
        ...g,
        files: g.files.filter(f => !uris.has(f.uri)),
        count: g.count - gone.length,
        bytes: g.bytes - gone.reduce((sum, f) => sum + f.size, 0),
      };
    })
    .filter(g => g.count > 0);
  emit();
}

export function subscribeCleaner(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
