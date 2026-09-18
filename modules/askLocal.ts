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

function count(value: number, singular: string, plural?: string): string {
  const word = value === 1 ? singular : plural || `${singular}s`;

  return `${value.toLocaleString()} ${word}`;
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

function listTally(counts: Record<string, number>, limit = 6): string {
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);

  if (sorted.length === 0) return '';

  const shown = sorted.slice(0, limit).map(([extension, n]) => `${n} ${extension}`);
  const rest = sorted.length - shown.length;

  const listed =
    shown.length === 1
      ? shown[0]
      : `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`;

  return rest > 0 ? `${listed}, plus ${rest} other format${rest === 1 ? '' : 's'}` : listed;
}

function describeFile(file: NamedFile | undefined, label: string): string | null {
  if (!file) return `I can't see any ${label} on your device.`;

  return `Your largest ${label} is ${file.name} at ${file.size}, in ${file.folder}.`;
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

export function answerLocally(question: string, data: AskLocalData): string | null {
  const list = words(question);

  if (list.length === 0) return null;

  const asksHowMany = has(list, 'many', 'count', 'number') || list[0] === 'count';
  const asksLargest = has(list, 'largest', 'biggest', 'heaviest');
  const asksSpace =
    has(list, 'space', 'storage', 'free', 'full', 'capacity') ||
    (has(list, 'taking', 'takes', 'using', 'uses') && has(list, 'most', 'space'));
  const asksTypes = has(list, 'types', 'type', 'formats', 'format', 'kinds', 'kind');

  // ── Screenshots. Exact, and the one the prompt shouted about. ───────────
  if (asksHowMany && has(list, 'screenshot', 'screenshots')) {
    return `You have ${count(data.mediaContext.screenshotCount, 'screenshot')}.`;
  }

  // ── Largest single file, overall or by kind. ────────────────────────────
  if (asksLargest) {
    // Before subjectOf, which would resolve "screenshot" to images and
    // answer about the wrong file.
    if (has(list, 'screenshot', 'screenshots')) {
      const shots = data.largestFiles.screenshots;

      if (!shots) return null;

      return describeFile(shots[0], 'screenshot');
    }

    const subject = subjectOf(list);

    if (subject === 'images') return describeFile(data.largestFiles.images[0], 'image');
    if (subject === 'videos') return describeFile(data.largestFiles.videos[0], 'video');
    if (subject === 'documents') return describeFile(data.largestFiles.documents[0], 'document');
    if (subject === 'downloads') return describeFile(data.largestFiles.downloads[0], 'download');

    if (has(list, 'file', 'files', 'thing', 'anything')) {
      const top = data.largestFiles.overall;

      if (top.length === 0) return "I can't see any files on your device.";

      // "files", plural, wants the list rather than the winner.
      if (has(list, 'files') && !has(list, 'file')) {
        const shown = top
          .slice(0, 5)
          .map((file, index) => `${index + 1}. ${file.name}, ${file.size}, in ${file.folder}`);

        return `Your largest files:\n${shown.join('\n')}`;
      }

      return describeFile(top[0], 'file');
    }
  }

  // ── What is taking up the space. ────────────────────────────────────────
  if (asksSpace) {
    const info = data.storageInfo;

    if (!info) return null;

    if (has(list, 'most') || has(list, 'taking', 'takes', 'using', 'uses')) {
      const folders = Object.entries(data.folderSizes)
        .filter(([name]) => name !== 'other')
        .sort((a, b) => parseSize(b[1]) - parseSize(a[1]))
        .slice(0, 3)
        .map(([name, size]) => `${friendly(name)} at ${size}`);

      if (folders.length === 0) return null;

      return `Most of your space goes to ${folders.join(', then ')}.`;
    }

    return (
      `You're using ${info.usedReadable} of ${info.totalReadable}, ` +
      `which is ${info.usedPercent} percent.`
    );
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
      return `I can't see any ${category.toLowerCase()} on your device.`;
    }

    return (
      `You have ${count(total, 'file')} I'd call ${category.toLowerCase()}: ` +
      `${listTally(matched)}.`
    );
  }

  // ── Plain counts. ───────────────────────────────────────────────────────
  if (asksHowMany) {
    const subject = subjectOf(list);

    if (subject) {
      return `You have ${count(data.fileCounts[subject], subject.replace(/s$/, ''))}.`;
    }

    if (has(list, 'file', 'files')) {
      const { images, videos, documents, downloads } = data.fileCounts;

      return (
        `${count(images, 'image')}, ${count(videos, 'video')}, ` +
        `${count(documents, 'document')} and ${count(downloads, 'download')}.`
      );
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
      const breakdown = listTally(tally(names));

      // MediaLibrary gives us the most recent 500 names. When there are
      // fewer than that in total, the sample IS everything and the number
      // is exact -- so only hedge when hedging is true.
      if (total <= MEDIA_SAMPLE_SIZE) {
        return `Your ${total.toLocaleString()} ${subject}: ${breakdown}.`;
      }

      return (
        `Of your ${MEDIA_SAMPLE_SIZE} most recent ${subject}: ${breakdown}. ` +
        `You have ${total.toLocaleString()} ${subject} in total, so that's a sample.`
      );
    }

    if (data.documentExtensions) {
      const breakdown = listTally(data.documentExtensions, 8);

      if (breakdown) return `Your documents and downloads: ${breakdown}.`;
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

function friendly(key: string): string {
  const names: Record<string, string> = {
    pictures: 'Pictures',
    videos: 'Videos',
    downloads: 'Downloads',
    documents: 'Documents',
    dcim: 'your camera folder',
    music: 'Music',
  };

  return names[key] || key;
}
