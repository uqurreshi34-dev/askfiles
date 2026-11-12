/**
 * Categories screen words (Images, Videos, Documents, Downloads).
 * Shared file words (sheet options, pop-ups) are in files.ts and common.ts.
 *
 * Counts: Hindi changes the verb (and its gender) for 1 versus more;
 * Arabic uses one form for 1, another for 2-10 and another for 11+.
 */
import { AppLang } from '../appLanguage';

export type Cat = 'images' | 'videos' | 'documents' | 'downloads';

/** Arabic: 1, 2-10, 11+ */
const ar3 = (n: number, one: string, few: string, many: string) => (n === 1 ? one : n >= 2 && n <= 10 ? few : many);

const EN_NOUN: Record<Cat, [string, string]> = {
  images: ['image', 'images'], videos: ['video', 'videos'],
  documents: ['document', 'documents'], downloads: ['download', 'downloads'],
};
const EN_TITLE: Record<Cat, string> = { images: 'Images', videos: 'Videos', documents: 'Documents', downloads: 'Downloads' };

const AR_NOUN: Record<Cat, [string, string, string]> = {
  images: ['صورة', 'صور', 'صورة'],
  videos: ['فيديو', 'مقاطع فيديو', 'مقطع فيديو'],
  documents: ['مستند', 'مستندات', 'مستنداً'],
  downloads: ['ملف منزّل', 'ملفات منزّلة', 'ملفاً منزّلاً'],
};
const AR_TITLE: Record<Cat, string> = { images: 'الصور', videos: 'الفيديو', documents: 'المستندات', downloads: 'التنزيلات' };
const AR_NONE: Record<Cat, string> = { images: 'لا توجد صور', videos: 'لا توجد مقاطع فيديو', documents: 'لا توجد مستندات', downloads: 'لا توجد تنزيلات' };
const AR_SEARCH: Record<Cat, string> = { images: 'ابحث في الصور...', videos: 'ابحث في مقاطع الفيديو...', documents: 'ابحث في المستندات...', downloads: 'ابحث في التنزيلات...' };

const HI_NOUN: Record<Cat, string> = { images: 'इमेज', videos: 'वीडियो', documents: 'डॉक्यूमेंट', downloads: 'डाउनलोड' };
const HI_FEMININE: Record<Cat, boolean> = { images: true, videos: false, documents: false, downloads: false };

export type CategoryText = {
  title: (cat: Cat) => string;
  selected: (cat: Cat, n: number) => string;
  count: (cat: Cat, n: number) => string;
  none: (cat: Cat) => string;
  search: (cat: Cat) => string;
  /** Filter tab label; PDF, APK, Word and Excel are names and stay as they are. */
  tab: (tab: string) => string;
  typeCount: (tab: string, n: number) => string;
  typeNone: (tab: string) => string;
  exitFolders: string; viewFolders: string; sort: string; slideshow: string; play: string;
  faved: string; favourite: string; partlyDone: string;
  addedToFavourites: string; removedFromFavourites: string;
  addedShort: (name: string) => string; removedShort: (name: string) => string;
  couldNotRenameFile: string;
  nDone: (n: number, copy: boolean) => string;
  nSkippedDupes: (n: number) => string;
  nFailedUnreadable: (n: number) => string;
  trashNFiles: (n: number) => string;
  nFilesSelected: (n: number) => string;
};

const TAB: Record<AppLang, Record<string, string>> = {
  en: { All: 'All', Other: 'Other', Docs: 'Docs' },
  ar: { All: 'الكل', Other: 'أخرى', Docs: 'مستندات' },
  hi: { All: 'सभी', Other: 'अन्य', Docs: 'डॉक्स' },
};

const TEXT: Record<AppLang, CategoryText> = {
  en: {
    title: c => EN_TITLE[c],
    selected: (c, n) => `${n} ${EN_NOUN[c][n === 1 ? 0 : 1]} selected`,
    count: (c, n) => `${n} ${EN_NOUN[c][n === 1 ? 0 : 1]}`,
    none: c => `No ${EN_NOUN[c][1]} found`,
    search: c => `Search ${EN_NOUN[c][1]}...`,
    tab: t => TAB.en[t] ?? t,
    typeCount: (t, n) => `${n} ${(TAB.en[t] ?? t).toLowerCase()} file${n !== 1 ? 's' : ''}`,
    typeNone: t => `No ${TAB.en[t] ?? t} files found`,
    exitFolders: 'Exit folders', viewFolders: 'View folders', sort: 'Sort', slideshow: 'Slideshow', play: 'Play',
    faved: 'Faved', favourite: 'Favourite', partlyDone: 'Partly done',
    addedToFavourites: 'Added to Favourites', removedFromFavourites: 'Removed from Favourites',
    addedShort: name => `"${name}" added.`, removedShort: name => `"${name}" removed.`,
    couldNotRenameFile: 'Could not rename this file.',
    nDone: (n, copy) => `${n} item${n !== 1 ? 's' : ''} ${copy ? 'copied' : 'moved'}`,
    nSkippedDupes: n => `${n} skipped (duplicate names)`,
    nFailedUnreadable: n => `${n} failed (unreadable or corrupted)`,
    trashNFiles: n => `Move ${n} file${n !== 1 ? 's' : ''} to Trash? They will be deleted after 30 days.`,
    nFilesSelected: n => `${n} file${n !== 1 ? 's' : ''} selected`,
  },
  ar: {
    title: c => AR_TITLE[c],
    selected: (c, n) => `تم تحديد ${n} ${ar3(n, ...AR_NOUN[c])}`,
    count: (c, n) => `${n} ${ar3(n, ...AR_NOUN[c])}`,
    none: c => AR_NONE[c],
    search: c => AR_SEARCH[c],
    tab: t => TAB.ar[t] ?? t,
    typeCount: (t, n) => `${n} ${ar3(n, 'ملف', 'ملفات', 'ملفاً')} ${TAB.ar[t] ?? t}`,
    typeNone: t => `لا توجد ملفات ${TAB.ar[t] ?? t}`,
    exitFolders: 'الخروج من المجلدات', viewFolders: 'عرض المجلدات', sort: 'ترتيب', slideshow: 'عرض الشرائح', play: 'تشغيل',
    faved: 'في المفضلة', favourite: 'تفضيل', partlyDone: 'اكتمل جزئياً',
    addedToFavourites: 'تمت الإضافة إلى المفضلة', removedFromFavourites: 'تمت الإزالة من المفضلة',
    addedShort: name => `تمت إضافة «${name}».`, removedShort: name => `تمت إزالة «${name}».`,
    couldNotRenameFile: 'تعذّرت إعادة تسمية هذا الملف.',
    nDone: (n, copy) => `تم ${copy ? 'نسخ' : 'نقل'} ${n} ${ar3(n, 'عنصر', 'عناصر', 'عنصراً')}`,
    nSkippedDupes: n => `تم تخطي ${n} (أسماء مكررة)`,
    nFailedUnreadable: n => `فشل ${n} (غير قابلة للقراءة أو تالفة)`,
    trashNFiles: n => `نقل ${n} ${ar3(n, 'ملف', 'ملفات', 'ملفاً')} إلى المهملات؟ ستُحذف بعد 30 يوماً.`,
    nFilesSelected: n => `تم تحديد ${n} ${ar3(n, 'ملف', 'ملفات', 'ملفاً')}`,
  },
  hi: {
    title: c => ({ images: 'इमेज', videos: 'वीडियो', documents: 'डॉक्यूमेंट', downloads: 'डाउनलोड' } as Record<Cat, string>)[c],
    selected: (c, n) => `${n} ${HI_NOUN[c]} ${HI_FEMININE[c] ? (n === 1 ? 'चुनी गई' : 'चुनी गईं') : (n === 1 ? 'चुना गया' : 'चुने गए')}`,
    count: (c, n) => `${n} ${HI_NOUN[c]}`,
    none: c => `कोई ${HI_NOUN[c]} नहीं ${HI_FEMININE[c] ? 'मिली' : 'मिला'}`,
    search: c => `${HI_NOUN[c]} खोजें...`,
    tab: t => TAB.hi[t] ?? t,
    typeCount: (t, n) => `${n} ${TAB.hi[t] ?? t} ${n === 1 ? 'फ़ाइल' : 'फ़ाइलें'}`,
    typeNone: t => `कोई ${TAB.hi[t] ?? t} फ़ाइल नहीं मिली`,
    exitFolders: 'फ़ोल्डर से बाहर', viewFolders: 'फ़ोल्डर देखें', sort: 'क्रम', slideshow: 'स्लाइडशो', play: 'चलाएँ',
    faved: 'पसंदीदा में', favourite: 'पसंदीदा', partlyDone: 'आंशिक रूप से पूरा',
    addedToFavourites: 'पसंदीदा में जोड़ा गया', removedFromFavourites: 'पसंदीदा से हटाया गया',
    addedShort: name => `"${name}" जोड़ दी गई।`, removedShort: name => `"${name}" हटा दी गई।`,
    couldNotRenameFile: 'इस फ़ाइल का नाम नहीं बदला जा सका।',
    nDone: (n, copy) => `${n} आइटम ${copy ? 'कॉपी' : 'मूव'} ${n === 1 ? 'हुआ' : 'हुए'}`,
    nSkippedDupes: n => `${n} ${n === 1 ? 'छोड़ा गया' : 'छोड़े गए'} (एक जैसे नाम)`,
    nFailedUnreadable: n => `${n} नहीं हो ${n === 1 ? 'सका' : 'सके'} (पढ़ा नहीं जा सका या खराब)`,
    trashNFiles: n => `${n} ${n === 1 ? 'फ़ाइल' : 'फ़ाइलें'} ट्रैश में डालें? 30 दिन बाद हट ${n === 1 ? 'जाएगी' : 'जाएँगी'}।`,
    nFilesSelected: n => `${n} ${n === 1 ? 'फ़ाइल चुनी गई' : 'फ़ाइलें चुनी गईं'}`,
  },
};

export function categoryText(lang: AppLang): CategoryText { return TEXT[lang]; }
