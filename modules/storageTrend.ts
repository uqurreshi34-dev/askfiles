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
 *
 * It used to name the folder responsible, and that is gone, because the
 * claim could not be made honestly from what is on disk. Two reasons, and
 * the second is the fatal one:
 *
 *   The headline is live and the folder figures were not. Folder sizes
 *   were captured once, the first time the app opened that day. Anything
 *   moved afterwards showed up in the headline and could not show up in
 *   the attribution, so copying a gigabyte into a folder moved the total
 *   and left that folder unmentioned.
 *
 *   "1.7 GB of that is Alpha" says the 1.7 sits inside the total. Only
 *   folders that grew were counted, so when something else shrank -- a
 *   cache clearing, usually -- the named figure could exceed the total it
 *   claimed to be part of. No threshold fixes that; the sentence asserts
 *   a containment the data does not have.
 *
 * Measuring both halves at the same instant would need a full MediaStore
 * pass every time the line is drawn, which is the cost this file was
 * written to avoid. So the headline stays -- one system number minus one
 * stored number, true whenever it is asked -- and the attribution goes.
 */

import RNFS from 'react-native-fs';

export type StorageSnapshot = {
  /** Epoch milliseconds, at capture. */
  at: number;
  usedBytes: number;
};

export type StorageChange = {
  /** When the earlier snapshot was taken. */
  since: number;
  /** Positive when storage grew. */
  deltaBytes: number;
  /** The finished sentence, or null when the change is not worth saying. */
  sentence: string | null;
};

/**
 * A month of daily snapshots is about 4 KB, and nobody wants a trend
 * older than that.
 */
export const MAX_SNAPSHOTS = 30;


/**
 * Below this, a change is cache churn, thumbnails and log files rather
 * than anything the user did. Saying "up 40 MB" every day would teach
 * people to ignore the line.
 */
export const MIN_REPORTABLE_BYTES = 500 * 1024 * 1024;

const SNAPSHOT_PATH = `${RNFS.DocumentDirectoryPath}/askfiles-storage-trend.json`;

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
export async function recordSnapshot(usedBytes: number): Promise<boolean> {
  try {
    if (!usedBytes || usedBytes < 0) return false;

    const snapshots = await loadOnce();
    const today = startOfDay(Date.now());

    // One a day. More often and "since" would mean "since you opened the
    // app twenty minutes ago", which is always a delta of nothing.
    if (snapshots.some(item => startOfDay(item.at) === today)) return false;

    snapshots.push({ at: Date.now(), usedBytes });

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

/**
 * How storage has changed since the last day the app was opened.
 *
 * Returns null when there is nothing to compare against yet -- a first
 * run, or a second open on the same day.
 *
 * One subtraction, both sides in the same unit: the live usedBytes now,
 * against the usedBytes stored on an earlier day. There is nothing here
 * that can be measured at two different moments, which is what went
 * wrong when this also tried to name a folder.
 */
export async function storageChange(usedBytes: number): Promise<StorageChange | null> {
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

  // Live, so the headline is true as of this moment rather than as of
  // whenever the app was first opened today.
  const deltaBytes = usedBytes - previous.usedBytes;

  const change: StorageChange = {
    since: previous.at,
    deltaBytes,
    sentence: null,
  };

  if (Math.abs(deltaBytes) < MIN_REPORTABLE_BYTES) return change;

  const when = whenLabel(previous.at);

  if (deltaBytes < 0) {
    change.sentence = `Storage is down ${readable(deltaBytes)} since ${when}.`;

    return change;
  }

  change.sentence = `Storage is up ${readable(deltaBytes)} since ${when}.`;

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
