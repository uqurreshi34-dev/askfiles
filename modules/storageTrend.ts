/**
 * What has changed in storage since you last looked.
 *
 * Every screen in AskFiles shows a snapshot: how much is used now, which
 * folder is biggest now. None of them shows a *change*, so "why is my
 * phone filling up" has no answer anywhere in the app.
 *
 * Borrowed from JARVIS's watcher, which had the same problem in reverse:
 * it held its price marks in memory, so a restart reset the baseline and
 * it could never report a move that happened while it was closed. Writing
 * the mark to disk was the whole fix. Same here -- one snapshot a day,
 * kept on disk, and the comparison is against the last day you opened the
 * app rather than the last time, which would nearly always be minutes ago
 * and a delta of zero.
 *
 * Bytes, not formatted strings: useStorage has the raw numbers before it
 * formats them, and parsing "18.2 GB" back would lose 100 MB of precision
 * against a 500 MB threshold.
 */

import RNFS from 'react-native-fs';

export type StorageSnapshot = {
  /** Epoch milliseconds, at capture. */
  at: number;
  usedBytes: number;
  /** Bytes per category, keyed as useStorage keys them. */
  folders: Record<string, number>;
  /** Bucket shape this was written with. Absent means pre-versioning. */
  v?: number;
};

export type StorageChange = {
  /** When the earlier snapshot was taken. */
  since: number;
  /** Positive when storage grew. */
  deltaBytes: number;
  /** Categories that grew, biggest first. */
  risers: { key: string; deltaBytes: number }[];
  /** The finished sentence, or null when the change is not worth saying. */
  sentence: string | null;
};

/**
 * A month of daily snapshots is about 4 KB, and nobody wants a trend
 * older than that.
 */
export const MAX_SNAPSHOTS = 30;


/**
 * Bumped whenever the bucket definitions change. Snapshots written under
 * an older shape still give a correct usedBytes delta, but their per-bucket
 * figures mean something different, so they are not subtracted.
 */
export const SNAPSHOT_VERSION = 2;

/**
 * Below this, a change is cache churn, thumbnails and log files rather
 * than anything the user did. Saying "up 40 MB" every day would teach
 * people to ignore the line.
 */
export const MIN_REPORTABLE_BYTES = 500 * 1024 * 1024;

const SNAPSHOT_PATH = `${RNFS.DocumentDirectoryPath}/askfiles-storage-trend.json`;

/** Display names for the exclusive breakdown's keys. */
const LABELS: Record<string, string> = {
  '/storage/emulated/0/DCIM/': 'Camera',
  '/storage/emulated/0/Download/': 'Downloads',
  '/storage/emulated/0/Music/': 'Music',
  images: 'Images',
  videos: 'Videos',
  audio: 'Audio',
  documents: 'Documents',
  other: 'other files',
};

let cache: StorageSnapshot[] | null = null;
let loading: Promise<StorageSnapshot[]> | null = null;

function startOfDay(at: number): number {
  const d = new Date(at);
  d.setHours(0, 0, 0, 0);

  return d.getTime();
}

async function loadOnce(): Promise<StorageSnapshot[]> {
  if (cache) return cache;

  if (!loading) {
    loading = (async () => {
      try {
        if (!(await RNFS.exists(SNAPSHOT_PATH))) return [];

        const parsed = JSON.parse(await RNFS.readFile(SNAPSHOT_PATH, 'utf8')) as unknown;

        if (!Array.isArray(parsed)) return [];

        return parsed.filter(
          (item): item is StorageSnapshot =>
            Boolean(item) &&
            typeof item === 'object' &&
            typeof (item as StorageSnapshot).at === 'number' &&
            typeof (item as StorageSnapshot).usedBytes === 'number',
        );
      } catch (error) {
        console.warn('[AskFiles] could not read storage trend:', error);
        return [];
      }
    })();
  }

  cache = await loading;
  loading = null;

  return cache;
}

/**
 * Record today's figures, if today has not been recorded yet.
 *
 * Called from useStorage once its numbers are ready. Cheap and idempotent:
 * on the second and later opens of the same day it does nothing at all.
 * Returns true when a snapshot was actually written.
 */
export async function recordSnapshot(
  usedBytes: number,
  folders: Record<string, number>,
): Promise<boolean> {
  try {
    if (!usedBytes || usedBytes < 0) return false;

    const snapshots = await loadOnce();
    const today = startOfDay(Date.now());

    // One a day. More often and "since" would mean "since you opened the
    // app twenty minutes ago", which is always a delta of nothing.
    if (snapshots.some(item => startOfDay(item.at) === today)) return false;

    snapshots.push({ at: Date.now(), usedBytes, folders: { ...folders }, v: SNAPSHOT_VERSION });

    if (snapshots.length > MAX_SNAPSHOTS) {
      snapshots.splice(0, snapshots.length - MAX_SNAPSHOTS);
    }

    await RNFS.writeFile(SNAPSHOT_PATH, JSON.stringify(snapshots), 'utf8');

    return true;
  } catch (error) {
    console.warn('[AskFiles] could not record storage trend:', error);
    return false;
  }
}


/**
 * Whether today's snapshot is already on disk. Lets the caller skip the
 * breakdown scan on every load but the first of the day.
 */
export async function hasSnapshotForToday(): Promise<boolean> {
  const snapshots = await loadOnce();
  const today = startOfDay(Date.now());

  return snapshots.some(item => startOfDay(item.at) === today);
}

function readable(bytes: number): string {
  const abs = Math.abs(bytes);

  if (abs >= 1024 ** 3) return `${(abs / 1024 ** 3).toFixed(1)} GB`;
  if (abs >= 1024 ** 2) return `${Math.round(abs / 1024 ** 2)} MB`;

  return `${Math.round(abs / 1024)} KB`;
}

/** "Tuesday" within the last week, otherwise "19 September". */
function whenLabel(at: number): string {
  const days = Math.round((startOfDay(Date.now()) - startOfDay(at)) / 86400000);

  if (days <= 1) return 'yesterday';
  if (days < 7) return new Date(at).toLocaleDateString(undefined, { weekday: 'long' });

  return new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'long' });
}

function label(key: string): string {
  return LABELS[key] || key;
}

/**
 * How storage has changed since the last day the app was opened.
 *
 * Returns null when there is nothing to compare against yet -- a first
 * run, or a second open on the same day.
 */
export async function storageChange(
  usedBytes: number,
  folders: Record<string, number>,
): Promise<StorageChange | null> {
  const snapshots = await loadOnce();

  if (!snapshots.length || !usedBytes) return null;

  const today = startOfDay(Date.now());

  // The most recent snapshot from an EARLIER day. Comparing against one
  // taken this morning would report a few minutes of change.
  let previous: StorageSnapshot | null = null;

  for (let i = snapshots.length - 1; i >= 0; i--) {
    if (startOfDay(snapshots[i].at) < today) {
      previous = snapshots[i];
      break;
    }
  }

  if (!previous) return null;

  const deltaBytes = usedBytes - previous.usedBytes;

  // An older snapshot's buckets overlapped each other, so subtracting them
  // would name a single camera import twice. The headline delta is still
  // sound -- usedBytes means the same thing under any shape -- so only the
  // attribution is dropped.
  const comparable = previous.v === SNAPSHOT_VERSION;

  const risers = comparable
    ? Object.keys(folders)
        .map(key => ({ key, deltaBytes: (folders[key] || 0) - (previous.folders[key] || 0) }))
        .filter(item => item.deltaBytes > 0)
        .sort((a, b) => b.deltaBytes - a.deltaBytes)
    : [];

  const change: StorageChange = {
    since: previous.at,
    deltaBytes,
    risers,
    sentence: null,
  };

  if (Math.abs(deltaBytes) < MIN_REPORTABLE_BYTES) return change;

  const when = whenLabel(previous.at);

  if (deltaBytes < 0) {
    change.sentence = `Storage is down ${readable(deltaBytes)} since ${when}.`;

    return change;
  }

  let sentence = `Storage is up ${readable(deltaBytes)} since ${when}.`;

  if (risers.length) {
    // Everything within 5% of the biggest counts as tied. Two categories
    // that grew by 1.20 GB and 1.19 GB have no meaningful winner, and
    // naming one of them would be arbitrary.
    const top = risers[0].deltaBytes;
    const tied = risers.filter(item => item.deltaBytes >= top * 0.95);

    if (tied.length === 1) {
      sentence += ` ${readable(top)} of that is ${label(tied[0].key)}.`;
    } else {
      const names = tied.map(item => `${label(item.key)} (${readable(item.deltaBytes)})`);

      sentence +=
        ` Most of that is ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}.`;
    }
  }

  change.sentence = sentence;

  return change;
}

export async function clearStorageTrend(): Promise<void> {
  cache = [];

  try {
    if (await RNFS.exists(SNAPSHOT_PATH)) await RNFS.unlink(SNAPSHOT_PATH);
  } catch (error) {
    console.warn('[AskFiles] could not clear storage trend:', error);
  }
}
