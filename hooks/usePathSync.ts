import { updateFavouritePath } from '@/hooks/useFavourites';
import { updateFileTagsPath } from '@/hooks/useFileTags';

// Call this once, right after a rename or move succeeds on disk, from any
// screen (browse.tsx, category.tsx, search.tsx). It updates every piece of
// app state that references a file by path - currently favourites and tags -
// so a renamed/moved file keeps its favourite status and tags instead of
// going stale and being silently dropped or orphaned.
//
// Adding a future path-keyed feature (e.g. notes-on-files, custom sort order)
// means adding one line here, not finding and updating every rename/move
// handler across the app again.
export async function syncPathReferences(oldPath: string, newPath: string, newName: string) {
  await Promise.all([
    updateFavouritePath(oldPath, newPath, newName),
    updateFileTagsPath(oldPath, newPath, newName),
  ]);
}
