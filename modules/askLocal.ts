/**
 * Answer file questions from data the app already has, with no model.
 *
 * useStorage walks storage and produces exact numbers: counts, folder
 * sizes, largest files, a screenshot total. Until now every question about
 * them was flattened into prose by buildContext, posted to a language
 * model, and read back out -- and the prompt had to argue with the model
 * about arithmetic it should never have been doing:
 *
 *     Screenshots: exactly N files (do not count manually, use this number)
 *     Always use the exact file counts stated in the File counts line
 *     Note: PNG files are image files.
 *
 * Nobody writes those lines until a model has got it wrong. The answer was
 * exact before it left the phone.
 *
 * So: match the question, read the number, say it. Instant, offline, free,
 * and right. Anything this cannot match returns null and goes to the model
 * as before -- "which of these photos is blurry" genuinely needs one.
 *
 * Nothing is cached here. Every call reads the data passed in, so files
 * added since the last question are counted in the next one.
 */

import { EXTENSION_RULES } from '@/modules/organisePlan';
import { formatSize } from '@/utils/files';
import type { ActivityEntry } from '@/modules/activityLog';
import { askText, AskText } from '@/modules/i18n/askText';
import type { AppLang } from '@/modules/appLanguage';

export type NamedFile = { name: string; size: string; folder: string };

export type AskLocalData = {
  storageInfo: {
    totalReadable: string;
    usedReadable: string;
    freeBytes: number;
    usedPercent: number;
  } | null;
  fileCounts: {
    images: number;
    videos: number;
    documents: number;
    downloads: number;
  };
  folderSizes: Record<string, string>;
  mediaContext: {
    recentImages: string[];
    recentVideos: string[];
    screenshotCount: number;
  };
  largestFiles: {
    images: NamedFile[];
    videos: NamedFile[];
    documents: NamedFile[];
    downloads: NamedFile[];
    screenshots?: NamedFile[];
    overall: NamedFile[];
  };
  /**
   * Exact, device-wide extension counts for non-media files, from the full
   * document and download listings. Optional so this module keeps working
   * before the useStorage change lands.
   */
  documentExtensions?: Record<string, number>;
  /**
   * Recent entries from the activity log, newest first.
   *
   * Passed in rather than read here, so this stays a pure function of its
   * inputs and the log's own cache does the I/O once.
   */
  activity?: ActivityEntry[];
  /** The finished trend sentence, or null when there is nothing to say. */
  storageTrend?: string | null;
};

/** How many names MediaLibrary gives us per media type. */
const MEDIA_SAMPLE_SIZE = 500;

function words(text: string): string[] {
  return (text || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function has(list: string[], ...candidates: string[]): boolean {
  return candidates.some(candidate => list.includes(candidate));
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');

  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

/** Extensions belonging to a category, read from the organiser's table. */
function extensionsFor(category: string): string[] {
  return Object.entries(EXTENSION_RULES)
    .filter(([, destination]) => destination === category)
    .map(([extension]) => extension);
}

function tally(names: string[]): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const name of names) {
    const extension = extensionOf(name);

    if (extension) counts[extension] = (counts[extension] || 0) + 1;
  }

  return counts;
}

function listTally(t: AskText, counts: Record<string, number>, limit = 6): string {
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);

  if (sorted.length === 0) return '';

  const shown = sorted.slice(0, limit).map(([extension, n]) => t.tallyItem(n, extension));
  const rest = sorted.length - shown.length;

  const listed = t.join(shown);

  return rest > 0 ? t.plusOthers(listed, rest) : listed;
}

function describeFile(
  t: AskText,
  files: NamedFile[] | undefined,
  label: 'screenshot' | 'image' | 'video' | 'document' | 'download' | 'file',
): string | null {
  const first = files && files[0];

  if (!first) return t.noneOfKind(label);

  // The same file in two folders is two rows of the same size, so the
  // largest can legitimately be in several places at once. Naming only the
  // first hides a duplicate that is costing real space.
  const folders = (files || [])
    .filter(file => file.name === first.name && file.size === first.size)
    .map(file => file.folder)
    .filter((folder, index, all) => all.indexOf(folder) === index);

  if (folders.length === 1) {
    return t.largestOne(label, first.name, first.size, folders[0]);
  }

  return t.largestCopies(label, first.name, first.size, folders.length, t.join(folders));
}

/**
 * Which broad thing a question is about, or null.
 *
 * Deliberately small: these four are what useStorage counts. A question
 * about anything else should reach the model rather than be answered
 * approximately.
 */
function subjectOf(list: string[]): 'images' | 'videos' | 'documents' | 'downloads' | null {
  if (has(list, 'image', 'images', 'photo', 'photos', 'picture', 'pictures')) return 'images';
  if (has(list, 'video', 'videos', 'movie', 'movies', 'clip', 'clips')) return 'videos';
  if (has(list, 'document', 'documents', 'doc', 'docs')) return 'documents';
  if (has(list, 'download', 'downloads')) return 'downloads';

  return null;
}

/**
 * A category from the organiser's own table, so "spreadsheets" here and
 * "Spreadsheets" in the organiser can never drift apart.
 */
function categoryOf(list: string[]): string | null {
  if (has(list, 'spreadsheet', 'spreadsheets', 'excel')) return 'Spreadsheets';
  if (has(list, 'archive', 'archives', 'zip', 'zips')) return 'Archives';
  if (has(list, 'music', 'song', 'songs', 'audio', 'mp3s')) return 'Music';

  return null;
}


type Window = 'today' | 'yesterday' | 'week';

/** Which period a question asks about, or null when it names none. */
function windowAsked(list: string[]): Window | null {
  if (has(list, 'today')) return 'today';
  if (has(list, 'yesterday')) return 'yesterday';
  if (has(list, 'week', 'lately', 'recently')) return 'week';

  return null;
}

function windowStart(window: Window): number {
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);

  if (window === 'today') return midnight.getTime();
  if (window === 'yesterday') return midnight.getTime() - 86400000;

  return midnight.getTime() - 6 * 86400000;
}

/** "Did I delete anything today?" -- trash and permanent kept apart. */
function describeDeletions(t: AskText, entries: ActivityEntry[], window: Window): string {
  const trashed = entries.filter(entry => entry.action === 'trashed').length;
  const deleted = entries.filter(entry => entry.action === 'deleted').length;

  if (!trashed && !deleted) {
    return t.noneDeleted(window);
  }

  const parts: string[] = [];

  // Recoverable and gone for good are different answers to this question,
  // so they are never added together.
  if (trashed) parts.push(t.trashedPart(trashed));
  if (deleted) parts.push(t.deletedPart(deleted));

  return t.yesDeleted(t.join(parts));
}

/** "What did I do today?" */
function describeActions(t: AskText, entries: ActivityEntry[], window: Window): string {
  if (!entries.length) {
    return t.nothingRecorded(window);
  }

  const tally: Record<string, number> = {};

  for (const entry of entries) {
    tally[entry.action] = (tally[entry.action] || 0) + 1;
  }

  const order = ['moved', 'renamed', 'restored', 'trashed', 'deleted'] as const;

  const parts = order
    .filter(action => tally[action])
    .map(action => t.actionPart(action, tally[action]));

  return t.actionsSummary(t.join(parts));
}

export function answerLocally(question: string, data: AskLocalData, lang?: AppLang): string | null {
  // Questions are matched in English; only the answer follows the app's language.
  const t = askText(lang);
  const list = words(question);

  if (list.length === 0) return null;

  // "Should I free up some space?" asks for advice, not a figure. Answered
  // here, it got only how full the phone is; the model can weigh it up.
  if (has(list, 'should')) return null;

  const asksHowMany = has(list, 'many', 'count', 'number') || list[0] === 'count';
  const asksLargest = has(list, 'largest', 'biggest', 'heaviest');
  const asksSpace =
    has(list, 'space', 'storage', 'free', 'full', 'capacity') ||
    (has(list, 'taking', 'takes', 'using', 'uses') && has(list, 'most', 'space'));
  const asksTypes = has(list, 'types', 'type', 'formats', 'format', 'kinds', 'kind');

  // ── Screenshots. Exact, and the one the prompt shouted about. ───────────
  if (asksHowMany && has(list, 'screenshot', 'screenshots')) {
    return t.screenshots(data.mediaContext.screenshotCount);
  }

  // ── Largest single file, overall or by kind. ────────────────────────────
  if (asksLargest) {
    // Before subjectOf, which would resolve "screenshot" to images and
    // answer about the wrong file.
    if (has(list, 'screenshot', 'screenshots')) {
      const shots = data.largestFiles.screenshots;

      if (!shots) return null;

      return describeFile(t, shots, 'screenshot');
    }

    const subject = subjectOf(list);

    if (subject === 'images') return describeFile(t, data.largestFiles.images, 'image');
    if (subject === 'videos') return describeFile(t, data.largestFiles.videos, 'video');
    if (subject === 'documents') return describeFile(t, data.largestFiles.documents, 'document');
    if (subject === 'downloads') return describeFile(t, data.largestFiles.downloads, 'download');

    if (has(list, 'file', 'files', 'thing', 'anything')) {
      const top = data.largestFiles.overall;

      if (top.length === 0) return t.noFiles;

      // "files", plural, wants the list rather than the winner.
      if (has(list, 'files') && !has(list, 'file')) {
        const shown = top
          .slice(0, 5)
          .map((file, index) => t.fileLine(index + 1, file.name, file.size, file.folder));

        return `${t.largestFilesHeader}\n${shown.join('\n')}`;
      }

      return describeFile(t, top, 'file');
    }
  }

  // ── What is taking up the space. ────────────────────────────────────────
  if (asksSpace) {
      // "Why is my phone filling up" is about change, and no screen in the
    // app shows change -- they all show a snapshot. Answer it before the
    // snapshot answers below.
    if (
      data.storageTrend &&
      (has(list, 'grown', 'growing', 'grew', 'filling', 'filled', 'changed', 'more', 'less') ||
        has(list, 'why'))
    ) {
      return data.storageTrend;
    }
    const info = data.storageInfo;

    if (!info) return null;

    if (has(list, 'most') || has(list, 'taking', 'takes', 'using', 'uses')) {
      const folders = Object.entries(data.folderSizes)
        .filter(([name]) => name !== 'other')
        .sort((a, b) => parseSize(b[1]) - parseSize(a[1]))
        .slice(0, 3)
        .map(([name, size]) => t.folderAt(t.folderName(name), size));

      if (folders.length === 0) return null;

      return t.mostSpace(folders);
    }

    // "How much storage do I have left?" asks for what is free, not what is used.
    if (has(list, 'left', 'remaining', 'available')) {
      return t.storageLeft(formatSize(info.freeBytes), info.totalReadable, info.usedReadable, info.usedPercent);
    }

    return t.storageUsed(info.usedReadable, info.totalReadable, info.usedPercent);
  }

  // ── A category from the organiser's table: spreadsheets, archives, music.
  const category = categoryOf(list);

  if (category && (asksHowMany || asksTypes)) {
    const extensions = extensionsFor(category);
    const counts = data.documentExtensions;

    if (!counts) return null;

    const matched: Record<string, number> = {};
    let total = 0;

    for (const extension of extensions) {
      const n = counts[extension] || 0;

      if (n > 0) {
        matched[extension] = n;
        total += n;
      }
    }

    if (total === 0) {
      return t.categoryNone(category);
    }

    return t.categoryCount(total, category, listTally(t, matched));
  }

  // ── Plain counts. ───────────────────────────────────────────────────────
  if (asksHowMany) {
    const subject = subjectOf(list);

    if (subject) {
      return t.countOf(subject, data.fileCounts[subject]);
    }

    if (has(list, 'file', 'files')) {
      const { images, videos, documents, downloads } = data.fileCounts;

      return t.allCounts(images, videos, documents, downloads);
    }
  }

  // ── Format breakdown. Honest about whether it is a count or a sample. ───
  if (asksTypes) {
    const subject = subjectOf(list);

    if (subject === 'images' || subject === 'videos') {
      const names =
        subject === 'images' ? data.mediaContext.recentImages : data.mediaContext.recentVideos;

      if (names.length === 0) return null;

      const total = data.fileCounts[subject];
      const breakdown = listTally(t, tally(names));

      // MediaLibrary gives us the most recent 500 names. When there are
      // fewer than that in total, the sample IS everything and the number
      // is exact -- so only hedge when hedging is true.
      if (total <= MEDIA_SAMPLE_SIZE) {
        return t.typesAll(total, subject, breakdown);
      }

      return t.typesSample(MEDIA_SAMPLE_SIZE, subject, breakdown, total);
    }

    if (data.documentExtensions) {
      const breakdown = listTally(t, data.documentExtensions, 8);

      if (breakdown) return t.docsBreakdown(breakdown);
    }
  }

  // ── What happened recently. The only answers here that no screen
  //    already gives, which is the test this feature keeps failing
  //    elsewhere.
  if (data.activity && data.activity.length) {
    const window = windowAsked(list);

    if (window) {
      const since = windowStart(window);
      // Yesterday ends at midnight. Without an upper bound "what did I do
      // yesterday" returns today's actions as well.
      const until =
        window === 'yesterday' ? windowStart('today') : Number.MAX_SAFE_INTEGER;
      const recent = data.activity.filter(
        entry => entry.at >= since && entry.at < until
      );
      const asksDeleted = has(list, 'delete', 'deleted', 'deleting', 'remove', 'removed');

      if (asksDeleted) return describeDeletions(t, recent, window);

      if (has(list, 'did', 'do', 'done', 'happened', 'changed', 'activity')) {
        return describeActions(t, recent, window);
      }
    }
  }

  // Not a question about numbers this app already holds.
  return null;
}

/** "1.2 GB" to bytes, well enough to sort by. */
function parseSize(text: string): number {
  const match = /([\d.]+)\s*([KMGT]?B)/i.exec(text || '');

  if (!match) return 0;

  const value = parseFloat(match[1]) || 0;
  const unit = match[2].toUpperCase();
  const scale: Record<string, number> = {
    B: 1,
    KB: 1024,
    MB: 1024 ** 2,
    GB: 1024 ** 3,
    TB: 1024 ** 4,
  };

  return value * (scale[unit] || 1);
}

