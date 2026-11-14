/**
 * The Cleaner's last scan, shared between the summary screen and a group's
 * file list, so opening a group does not scan the phone again. Group screens
 * remove files from here as they are cleaned, so the summary stays honest
 * without a rescan.
 */
import { scanCleanup, CleanupGroup, CleanupGroupId } from '@/modules/media-store';
import { formatSize } from '@/utils/files';
import { readableFolder } from '@/modules/activityLog';

let groups: CleanupGroup[] | null = null;
const listeners = new Set<() => void>();

function emit() { listeners.forEach(l => l()); }

export function cleanerGroups(): CleanupGroup[] | null { return groups; }

export function cleanerGroup(id: CleanupGroupId): CleanupGroup | undefined {
  return groups?.find(g => g.id === id);
}

let inFlight: Promise<CleanupGroup[]> | null = null;

export function runCleanerScan(): Promise<CleanupGroup[]> {
  // One scan at a time: a second caller shares the running one.
  if (inFlight) return inFlight;
  inFlight = scanCleanup()
    .then(result => {
      groups = result.filter(g => g.count > 0).sort((a, b) => b.bytes - a.bytes);
      emit();
      return groups;
    })
    .finally(() => { inFlight = null; });
  return inFlight;
}

/** The last scan, or a new one if there is none yet. Never scans twice at once. */
export function ensureCleanerScan(): Promise<CleanupGroup[]> {
  return groups ? Promise.resolve(groups) : runCleanerScan();
}

// ── Ask AI ─────────────────────────────────────────────────────────────────

const AI_NAMES: Record<CleanupGroupId, string> = {
  whatsappVideo: 'WhatsApp videos', whatsappImages: 'WhatsApp images and stickers',
  whatsappVoice: 'WhatsApp voice notes and audio', whatsappDocs: 'WhatsApp documents',
  telegram: 'Telegram media', apks: 'App installer files (APK)',
  oldDownloads: 'Downloads untouched for 90+ days', oldScreenshots: 'Screenshots older than 30 days',
};

/**
 * The Cleaner's findings for Ask AI's context, in the same shape as the
 * rest of the context: name (size, in path). Groups are already sorted and
 * each group's files are largest first, so this is a few slices, not a sort.
 */
export function cleanerAiContext(list: CleanupGroup[] | null = groups): string {
  if (!list || !list.length) return '';
  const lines = list.map(g => {
    const top = g.files.slice(0, 3)
      .map(f => `${f.name} (${formatSize(f.size)}, in ${readableFolder(f.uri)})`)
      .join(', ');
    return `[${g.id}] ${AI_NAMES[g.id]}: ${g.count} files, ${formatSize(g.bytes)}. Largest: ${top}.`;
  });
  return `Cleaner groups (files the Cleaner found that can be reviewed and removed; the id is in square brackets):\n${lines.join('\n')}`;
}

const TAG = /\[\[\s*cleaner\s*:\s*([A-Za-z]+)\s*\]\]/g;
const KNOWN = new Set<string>(Object.keys(AI_NAMES));

/** Splits the model's [[cleaner:id]] tags from the text shown to the user. */
export function splitCleanerTags(answer: string): { text: string; ids: CleanupGroupId[] } {
  const ids: CleanupGroupId[] = [];
  const text = answer.replace(TAG, (_, id: string) => {
    if (KNOWN.has(id) && !ids.includes(id as CleanupGroupId)) ids.push(id as CleanupGroupId);
    return '';
  }).replace(/\n{3,}/g, '\n\n').trim();
  return { text, ids };
}

// Words in the question, in English, Arabic and Hindi. Only used when the
// model named no group, so a vague answer still leads somewhere useful.
const WORDS = {
  whatsapp: ['whatsapp', 'واتساب', 'واتس', 'व्हाट्सएप', 'व्हाट्सऐप'],
  telegram: ['telegram', 'تيليجرام', 'تلغرام', 'टेलीग्राम'],
  video: ['video', 'فيديو', 'वीडियो'],
  image: ['image', 'photo', 'picture', 'sticker', 'صور', 'صورة', 'ملصق', 'इमेज', 'फ़ोटो', 'फोटो', 'स्टिकर'],
  voice: ['voice', 'audio', 'صوت', 'صوتي', 'वॉइस', 'ऑडियो'],
  doc: ['document', 'pdf', 'مستند', 'डॉक्यूमेंट', 'दस्तावेज़'],
  apk: ['apk', 'installer', 'تثبيت', 'इंस्टॉलर'],
  screenshot: ['screenshot', 'لقطة', 'لقطات', 'स्क्रीनशॉट'],
  download: ['download', 'تنزيل', 'التنزيلات', 'डाउनलोड'],
  clean: ['clean', 'free up', 'delete', 'remove', 'old', 'space', 'تنظيف', 'إخلاء', 'حذف', 'قديم', 'مساحة', 'साफ़', 'साफ', 'खाली', 'हटा', 'पुरान', 'जगह'],
};

/** Whether a question is about cleaning up or a Cleaner group. */
export function isCleanerQuestion(question: string): boolean {
  const q = question.toLowerCase();
  return (['whatsapp', 'telegram', 'apk', 'screenshot', 'clean'] as const)
    .some(key => WORDS[key].some(w => q.includes(w)));
}

/** Sent instead of the groups when a clean-up question beats the scan. */
export const CLEANER_PENDING =
  'Cleaner groups: the Cleaner is still scanning, so its findings are not available yet. '
  + 'Never say there is nothing to clean up; suggest opening the Cleaner to see what it finds.';

/** Groups a question points at, best first, at most three. */
export function cleanerGroupsForQuestion(question: string, list: CleanupGroup[] | null = groups): CleanupGroupId[] {
  if (!list || !list.length) return [];
  const q = question.toLowerCase();
  const has = (key: keyof typeof WORDS) => WORDS[key].some(w => q.includes(w));
  const present = new Set(list.map(g => g.id));
  const picked: CleanupGroupId[] = [];
  const add = (id: CleanupGroupId) => { if (present.has(id) && !picked.includes(id)) picked.push(id); };

  if (has('whatsapp')) {
    if (has('video')) add('whatsappVideo');
    if (has('image')) add('whatsappImages');
    if (has('voice')) add('whatsappVoice');
    if (has('doc')) add('whatsappDocs');
    if (!picked.length) list.filter(g => g.id.startsWith('whatsapp')).forEach(g => add(g.id));
  }
  if (has('telegram')) add('telegram');
  if (has('apk')) add('apks');
  if (has('screenshot') && has('clean')) add('oldScreenshots');
  if (has('download') && has('clean')) add('oldDownloads');
  // A general clean-up question: the biggest groups (the list is largest first).
  if (!picked.length && has('clean')) list.forEach(g => add(g.id));
  return picked.slice(0, 3);
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
