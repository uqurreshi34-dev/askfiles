/**
 * A local record of what happened to the user's files.
 *
 * A file manager's worst moment is "where did that file go?" -- after a
 * bulk organise, a move, or a tap on "keep largest, delete rest". Trash
 * answers it for deletions that went to trash. Nothing answers it for
 * moves, and nothing at all answers it for the hard deletes on the
 * duplicate and similar-image screens, where the file is simply gone.
 *
 * So: one append-only log, capped, on the device. It is a memory, not an
 * audit trail -- the cap matters more than completeness, because an
 * unbounded log on a file manager grows for ever.
 *
 * Three actions, because they mean different things to someone hunting a
 * file:
 *
 *   moved    -- it is somewhere else, go and look
 *   trashed  -- it is in Trash, restore it
 *   deleted  -- it is gone. This log is the only record it existed.
 *
 * Entries are written AFTER the operation succeeds, never before. A move
 * across volumes can fail -- the vault sits in app-private storage, and
 * moving out of it needs copy-then-delete for exactly that reason -- and a
 * log that records attempts rather than outcomes is worse than no log,
 * because it would be trusted.
 *
 * Lives in app-private storage: no permission needed, and it disappears
 * with the app. That does mean it is not backed up and does not survive a
 * new phone, which is the accepted trade for keeping it free for everyone
 * rather than tying it to cloud sync.
 */

import RNFS from 'react-native-fs';

export type ActivityAction = 'moved' | 'copied' | 'trashed' | 'deleted';

/** One file inside a bulk operation. */
export type ActivityItem = {
  name: string;
  from?: string;
  to?: string;
};

export type ActivityEntry = {
  /** Epoch milliseconds. */
  at: number;
  action: ActivityAction;
  /** The file's display name, or the folder's name for a folder move. */
  name: string;
  /** Where it was, as a readable path. Omitted when not known. */
  from?: string;
  /** Where it went. Only meaningful for 'moved'. */
  to?: string;
  /** Files affected, when one entry stands for a bulk action. */
  count?: number;
  /** True when the entry describes a folder rather than a single file. */
  isFolder?: boolean;
  /** Which screen or operation produced it, e.g. "Vault", "Duplicates". */
  source?: string;
  /**
   * The individual files, when this entry stands for a bulk operation.
   *
   * One entry per batch rather than one per file, because a 230-file move
   * written as 230 entries would empty the whole log in a single action.
   * count is always the true total; this list may be shorter.
   */
  items?: ActivityItem[];
};

/**
 * Old entries fall off the end as new ones arrive. 500 is far more than a
 * person will scroll and small enough to read and write in one go.
 */
export const MAX_ENTRIES = 500;

/**
 * How many individual files one batch entry keeps. The count is still
 * exact; beyond this the screen says how many more there were. Stops a
 * ten-thousand-file paste turning the log into a megabyte of JSON.
 */
export const MAX_ITEMS_PER_ENTRY = 200;

const LOG_PATH = `${RNFS.DocumentDirectoryPath}/askfiles-activity.json`;

/** Serialises writes, so two operations finishing together cannot both
 * read the same list and write it back with one entry missing. */
let queue: Promise<unknown> = Promise.resolve();

function readableName(value: string | undefined): string {
  const text = (value || '').trim();

  if (!text) return '';

  // Accept a file:// URI or a plain path; store the plain path.
  const plain = text.startsWith('file://') ? decodeURIComponent(text.slice(7)) : text;

  return plain;
}

/** The folder part of a path, trimmed of the storage root for reading. */
export function readableFolder(pathOrUri: string | undefined): string {
  const plain = readableName(pathOrUri);

  if (!plain) return '';

  const parent = plain.includes('/') ? plain.slice(0, plain.lastIndexOf('/')) : plain;

  if (parent === '/storage/emulated/0' || parent === '/sdcard') {
    return 'Internal storage';
  }

  if (parent.startsWith('/storage/emulated/0/')) {
    return `Internal storage/${parent.slice('/storage/emulated/0/'.length)}`;
  }

  if (parent.startsWith('/sdcard/')) {
    return `Internal storage/${parent.slice('/sdcard/'.length)}`;
  }

  if (parent.startsWith('/storage/')) {
    const rest = parent.slice('/storage/'.length);
    const slash = rest.indexOf('/');

    return slash < 0 ? 'SD card' : `SD card/${rest.slice(slash + 1)}`;
  }

  if (parent.startsWith(RNFS.DocumentDirectoryPath)) return 'Vault';

  return parent;
}

export async function readActivity(): Promise<ActivityEntry[]> {
  try {
    if (!(await RNFS.exists(LOG_PATH))) return [];

    const raw = await RNFS.readFile(LOG_PATH, 'utf8');
    const parsed = JSON.parse(raw) as unknown;

    if (!Array.isArray(parsed)) return [];

    return parsed.filter(
      (entry): entry is ActivityEntry =>
        Boolean(entry) &&
        typeof entry === 'object' &&
        typeof (entry as ActivityEntry).at === 'number' &&
        typeof (entry as ActivityEntry).name === 'string',
    );
  } catch (error) {
    console.warn('[AskFiles] could not read activity log:', error);
    return [];
  }
}

/**
 * Add one entry. Never throws: a failure to log must not fail the file
 * operation that produced it.
 */
export function recordActivity(entry: Omit<ActivityEntry, 'at'>): Promise<void> {
  const next = queue.then(async () => {
    try {
      const name = (entry.name || '').trim();

      if (!name) return;

      const existing = await readActivity();

      existing.push({
        at: Date.now(),
        action: entry.action,
        name,
        ...(entry.from ? { from: entry.from } : {}),
        ...(entry.to ? { to: entry.to } : {}),
        ...(entry.count && entry.count > 1 ? { count: entry.count } : {}),
        ...(entry.isFolder ? { isFolder: true } : {}),
        ...(entry.source ? { source: entry.source } : {}),
        ...(entry.items && entry.items.length
          ? { items: entry.items.slice(0, MAX_ITEMS_PER_ENTRY) }
          : {}),
      });

      // Oldest first in the file, so trimming the front keeps the newest.
      const trimmed =
        existing.length > MAX_ENTRIES ? existing.slice(existing.length - MAX_ENTRIES) : existing;

      await RNFS.writeFile(LOG_PATH, JSON.stringify(trimmed), 'utf8');
    } catch (error) {
      console.warn('[AskFiles] could not record activity:', error);
    }
  });

  // Keep the chain alive even if one write rejects.
  queue = next.catch(() => {});

  return next;
}

export async function clearActivity(): Promise<void> {
  try {
    if (await RNFS.exists(LOG_PATH)) await RNFS.unlink(LOG_PATH);
  } catch (error) {
    console.warn('[AskFiles] could not clear activity log:', error);
  }
}

/** Newest first, which is how the screen wants them. */
export async function recentActivity(limit = MAX_ENTRIES): Promise<ActivityEntry[]> {
  const entries = await readActivity();

  return entries.slice(-limit).reverse();
}

/** The heading line for an entry: what happened, and how much of it. */
export function describeActivity(entry: ActivityEntry): string {
  const total = entry.count && entry.count > 1 ? entry.count : 0;
  const thing = entry.isFolder ? 'folder' : 'file';

  if (entry.action === 'moved' || entry.action === 'copied') {
    const verb = entry.action === 'moved' ? 'Moved' : 'Copied';
    const subject = total
      ? `${verb} ${total} files`
      : `${verb} ${entry.isFolder ? `${thing} ` : ''}${entry.name}`;

    return entry.to ? `${subject} to ${entry.to}` : subject;
  }

  if (entry.action === 'trashed') {
    const subject = total
      ? `Moved ${total} files to Trash`
      : `Moved ${entry.name} to Trash`;

    return entry.from ? `${subject}, from ${entry.from}` : subject;
  }

  const subject = total
    ? `Deleted ${total} files permanently`
    : `Deleted ${entry.name} permanently`;

  return entry.from ? `${subject}, from ${entry.from}` : subject;
}

/**
 * The lines inside a bulk entry, one per file, plus a closing line when
 * more files were affected than the entry kept.
 *
 * Empty for a single-file entry -- describeActivity already said it all,
 * and a block of one is noise.
 */
export function describeActivityItems(entry: ActivityEntry): string[] {
  const items = entry.items || [];

  if (items.length === 0) return [];

  const lines = items.map(item => {
    if (item.from && item.to) return `${item.name}: ${item.from} to ${item.to}`;
    if (item.to) return `${item.name} to ${item.to}`;
    if (item.from) return `${item.name}, from ${item.from}`;

    return item.name;
  });

  const total = entry.count || items.length;

  if (total > items.length) {
    lines.push(`and ${total - items.length} more`);
  }

  return lines;
}
