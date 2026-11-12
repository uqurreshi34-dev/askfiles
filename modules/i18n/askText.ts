/**
 * Answers written on the phone by askLocal (and the storage trend line),
 * in English, Arabic and Hindi. Question matching stays English (chips
 * always send English; anything else goes to the backend), so only the
 * wording of the answer changes here.
 *
 * Counts: Hindi verbs change for 1 versus more; Arabic has 1, 2 (dual,
 * said without the number), 3-10 and 11+. Numbers stay in Latin digits.
 */
import { AppLang, getLanguage } from '../appLanguage';

export type Kind = 'screenshot' | 'image' | 'video' | 'document' | 'download' | 'file';
export type Subject = 'images' | 'videos' | 'documents' | 'downloads';
export type Window = 'today' | 'yesterday' | 'week';
export type Action = 'moved' | 'renamed' | 'restored' | 'trashed' | 'deleted';

const num = (n: number) => n.toLocaleString('en-US');
const s = (n: number) => (n === 1 ? '' : 's');
/** Arabic: 1, 2 (dual, no number), 3-10, 11+ */
const ar4 = (n: number, one: string, two: string, few: string, many: string) =>
  n === 1 ? one : n === 2 ? two : n >= 3 && n <= 10 ? `${num(n)} ${few}` : `${num(n)} ${many}`;
const arFiles = (n: number) => ar4(n, 'ملف واحد', 'ملفان', 'ملفات', 'ملفاً');
const H = (n: number, one: string, many: string) => (n === 1 ? one : many);

export type AskText = {
  and: string;
  join: (parts: string[]) => string;
  noneOfKind: (k: Kind) => string;
  largestOne: (k: Kind, name: string, size: string, folder: string) => string;
  largestCopies: (k: Kind, name: string, size: string, copies: number, listed: string) => string;
  noFiles: string;
  largestFilesHeader: string;
  fileLine: (i: number, name: string, size: string, folder: string) => string;
  screenshots: (n: number) => string;
  folderName: (key: string) => string;
  folderAt: (name: string, size: string) => string;
  mostSpace: (items: string[]) => string;
  storageLeft: (free: string, total: string, used: string, pct: number) => string;
  storageUsed: (used: string, total: string, pct: number) => string;
  categoryName: (cat: string) => string;
  categoryNone: (cat: string) => string;
  categoryCount: (n: number, cat: string, breakdown: string) => string;
  tallyItem: (n: number, ext: string) => string;
  plusOthers: (listed: string, n: number) => string;
  countOf: (subject: Subject, n: number) => string;
  allCounts: (images: number, videos: number, documents: number, downloads: number) => string;
  typesAll: (total: number, subject: Subject, breakdown: string) => string;
  typesSample: (sample: number, subject: Subject, breakdown: string, total: number) => string;
  docsBreakdown: (breakdown: string) => string;
  windowWords: (w: Window) => string;
  noneDeleted: (w: Window) => string;
  trashedPart: (n: number) => string;
  deletedPart: (n: number) => string;
  yesDeleted: (joined: string) => string;
  nothingRecorded: (w: Window) => string;
  actionPart: (a: Action, n: number) => string;
  actionsSummary: (joined: string) => string;
  trendDown: (size: string, when: string) => string;
  trendUp: (size: string, when: string) => string;
  yesterday: string;
  dateLocale: string;
};

// ── English ────────────────────────────────────────────────────────────
const EN_FOLDER: Record<string, string> = {
  pictures: 'Pictures', videos: 'Videos', downloads: 'Downloads', documents: 'Documents', dcim: 'your camera folder', music: 'Music',
};
const EN: AskText = {
  and: 'and',
  join: p => (p.length === 1 ? p[0] : `${p.slice(0, -1).join(', ')} and ${p[p.length - 1]}`),
  noneOfKind: k => `I can't see any ${k} on your device.`,
  largestOne: (k, name, size, folder) => `Your largest ${k} is ${name} at ${size}, in ${folder}.`,
  largestCopies: (k, name, size, n, listed) => `Your largest ${k} is ${name} at ${size}. There are ${n} copies: ${listed}.`,
  noFiles: "I can't see any files on your device.",
  largestFilesHeader: 'Your largest files:',
  fileLine: (i, name, size, folder) => `${i}. ${name}, ${size}, in ${folder}`,
  screenshots: n => `You have ${num(n)} screenshot${s(n)}.`,
  folderName: k => EN_FOLDER[k] || k,
  folderAt: (name, size) => `${name} at ${size}`,
  mostSpace: items => `Most of your space goes to ${items.join(', then ')}.`,
  storageLeft: (free, total, used, pct) => `You have ${free} left of ${total}. You're using ${used}, which is ${pct} percent.`,
  storageUsed: (used, total, pct) => `You're using ${used} of ${total}, which is ${pct} percent.`,
  categoryName: c => c.toLowerCase(),
  categoryNone: c => `I can't see any ${c.toLowerCase()} on your device.`,
  categoryCount: (n, c, b) => `You have ${num(n)} file${s(n)} I'd call ${c.toLowerCase()}: ${b}.`,
  tallyItem: (n, ext) => `${n} ${ext}`,
  plusOthers: (listed, n) => `${listed}, plus ${n} other format${s(n)}`,
  countOf: (sub, n) => `You have ${num(n)} ${n === 1 ? sub.replace(/s$/, '') : sub}.`,
  allCounts: (i, v, d, dl) => `${num(i)} image${s(i)}, ${num(v)} video${s(v)}, ${num(d)} document${s(d)} and ${num(dl)} download${s(dl)}.`,
  typesAll: (total, sub, b) => `Your ${num(total)} ${sub}: ${b}.`,
  typesSample: (sample, sub, b, total) => `Of your ${sample} most recent ${sub}: ${b}. You have ${num(total)} ${sub} in total, so that's a sample.`,
  docsBreakdown: b => `Your documents and downloads: ${b}.`,
  windowWords: w => (w === 'today' ? 'today' : w === 'yesterday' ? 'yesterday' : 'in the last week'),
  noneDeleted: w => `No, you haven't deleted anything ${EN.windowWords(w)}.`,
  trashedPart: n => `${num(n)} file${s(n)} to Trash, still recoverable`,
  deletedPart: n => `${num(n)} file${s(n)} permanently`,
  yesDeleted: j => `Yes: ${j}.`,
  nothingRecorded: w => `Nothing recorded ${EN.windowWords(w)}.`,
  actionPart: (a, n) => `${num(n)} file${s(n)} ${({ moved: 'moved', renamed: 'renamed', restored: 'restored from Trash', trashed: 'moved to Trash', deleted: 'deleted permanently' } as Record<Action, string>)[a]}`,
  actionsSummary: j => `${j}. Tap the clock icon on the home screen for the detail.`,
  trendDown: (size, when) => `Storage is down ${size} since ${when}.`,
  trendUp: (size, when) => `Storage is up ${size} since ${when}.`,
  yesterday: 'yesterday',
  dateLocale: 'en-GB',
};

// ── Arabic ─────────────────────────────────────────────────────────────
const AR_KIND: Record<Kind, string> = {
  screenshot: 'لقطة شاشة', image: 'صورة', video: 'مقطع فيديو', document: 'مستند', download: 'ملف منزّل', file: 'ملف',
};
/** Feminine nouns take هي (she/it) rather than هو. */
const AR_FEM: Record<Kind, boolean> = { screenshot: true, image: true, video: false, document: false, download: false, file: false };
const AR_SUB: Record<Subject, [string, string, string, string, string]> = {
  // one, two, 3-10, 11+, "none" plural
  images: ['صورة واحدة', 'صورتان', 'صور', 'صورة', 'صور'],
  videos: ['مقطع فيديو واحد', 'مقطعا فيديو', 'مقاطع فيديو', 'مقطع فيديو', 'مقاطع فيديو'],
  documents: ['مستند واحد', 'مستندان', 'مستندات', 'مستنداً', 'مستندات'],
  downloads: ['ملف منزّل واحد', 'ملفان منزّلان', 'ملفات منزّلة', 'ملفاً منزّلاً', 'ملفات منزّلة'],
};
const arSub = (sub: Subject, n: number) => (n === 0 ? `0 ${AR_SUB[sub][4]}` : ar4(n, AR_SUB[sub][0], AR_SUB[sub][1], AR_SUB[sub][2], AR_SUB[sub][3]));
const AR_FOLDER: Record<string, string> = {
  pictures: 'الصور', videos: 'الفيديو', downloads: 'التنزيلات', documents: 'المستندات', dcim: 'مجلد الكاميرا', music: 'الموسيقى',
};
const AR_CAT: Record<string, string> = { Spreadsheets: 'جداول بيانات', Archives: 'ملفات مضغوطة', Music: 'ملفات موسيقى' };
const AR_POSS: Record<Subject, string> = { images: 'صورك', videos: 'مقاطع الفيديو لديك', documents: 'مستنداتك', downloads: 'تنزيلاتك' };
const AR_SAMPLE_NOUN: Record<Subject, string> = { images: 'صورة', videos: 'مقطع فيديو', documents: 'مستند', downloads: 'ملف منزّل' };
const AR_WIN: Record<Window, string> = { today: 'اليوم', yesterday: 'أمس', week: 'خلال الأسبوع الماضي' };
const AR_ACT: Record<Action, string> = {
  moved: 'نقل', renamed: 'إعادة تسمية', restored: 'استعادة من المهملات', trashed: 'نقل إلى المهملات', deleted: 'حذف نهائي',
};
const AR: AskText = {
  and: 'و',
  join: p => (p.length === 1 ? p[0] : `${p.slice(0, -1).join('، ')} و${p[p.length - 1]}`),
  noneOfKind: k => `لا أرى أي ${AR_KIND[k]} على جهازك.`,
  largestOne: (k, name, size, folder) => `أكبر ${AR_KIND[k]} لديك ${AR_FEM[k] ? 'هي' : 'هو'} ${name} بحجم ${size}، في ${folder}.`,
  largestCopies: (k, name, size, n, listed) =>
    `أكبر ${AR_KIND[k]} لديك ${AR_FEM[k] ? 'هي' : 'هو'} ${name} بحجم ${size}. توجد ${AR_FEM[k] ? 'منها' : 'منه'} ${ar4(n, 'نسخة واحدة', 'نسختان', 'نسخ', 'نسخة')}: ${listed}.`,
  noFiles: 'لا أرى أي ملفات على جهازك.',
  largestFilesHeader: 'أكبر ملفاتك:',
  fileLine: (i, name, size, folder) => `${i}. ${name}، ${size}، في ${folder}`,
  screenshots: n => (n === 0 ? 'لا توجد لديك لقطات شاشة.' : `لديك ${ar4(n, 'لقطة شاشة واحدة', 'لقطتا شاشة', 'لقطات شاشة', 'لقطة شاشة')}.`),
  folderName: k => AR_FOLDER[k] || k,
  folderAt: (name, size) => `${name} (${size})`,
  mostSpace: items => `معظم مساحتك تذهب إلى ${items.join('، ثم ')}.`,
  storageLeft: (free, total, used, pct) => `تبقّى لديك ${free} من ${total}. أنت تستخدم ${used}، أي ${pct} بالمئة.`,
  storageUsed: (used, total, pct) => `أنت تستخدم ${used} من ${total}، أي ${pct} بالمئة.`,
  categoryName: c => AR_CAT[c] || c,
  categoryNone: c => `لا أرى أي ${AR_CAT[c] || c} على جهازك.`,
  categoryCount: (n, c, b) => `لديك ${arFiles(n)} من نوع ${AR_CAT[c] || c}: ${b}.`,
  tallyItem: (n, ext) => `${n} ${ext}`,
  plusOthers: (listed, n) => `${listed}، بالإضافة إلى ${ar4(n, 'صيغة أخرى', 'صيغتين أخريين', 'صيغ أخرى', 'صيغة أخرى')}`,
  countOf: (sub, n) => (n === 0 ? `لا توجد لديك ${AR_SUB[sub][4]}.` : `لديك ${arSub(sub, n)}.`),
  allCounts: (i, v, d, dl) => `${arSub('images', i)}، ${arSub('videos', v)}، ${arSub('documents', d)} و${arSub('downloads', dl)}.`,
  typesAll: (total, sub, b) => `${AR_POSS[sub]} (${num(total)}): ${b}.`,
  typesSample: (sample, sub, b, total) => `من أحدث ${sample} ${AR_SAMPLE_NOUN[sub]}: ${b}. لديك ${num(total)} إجمالاً، لذا هذه عيّنة.`,
  docsBreakdown: b => `مستنداتك وتنزيلاتك: ${b}.`,
  windowWords: w => AR_WIN[w],
  noneDeleted: w => `لا، لم تحذف أي شيء ${AR_WIN[w]}.`,
  trashedPart: n => `${arFiles(n)} إلى المهملات، ${n === 1 ? 'ويمكن استعادته' : n === 2 ? 'ويمكن استعادتهما' : 'ويمكن استعادتها'}`,
  deletedPart: n => `${arFiles(n)} نهائياً`,
  yesDeleted: j => `نعم: ${j}.`,
  nothingRecorded: w => `لا يوجد شيء مسجّل ${AR_WIN[w]}.`,
  actionPart: (a, n) => `${arFiles(n)} (${AR_ACT[a]})`,
  actionsSummary: j => `${j}. اضغط أيقونة الساعة في الشاشة الرئيسية لمعرفة التفاصيل.`,
  trendDown: (size, when) => `انخفض التخزين بمقدار ${size} منذ ${when}.`,
  trendUp: (size, when) => `زاد التخزين بمقدار ${size} منذ ${when}.`,
  yesterday: 'أمس',
  dateLocale: 'ar-u-nu-latn',
};

// ── Hindi ──────────────────────────────────────────────────────────────
const HI_KIND: Record<Kind, [string, boolean]> = {
  // noun, feminine?
  screenshot: ['स्क्रीनशॉट', false], image: ['इमेज', true], video: ['वीडियो', false],
  document: ['डॉक्यूमेंट', false], download: ['डाउनलोड', false], file: ['फ़ाइल', true],
};
const HI_SUB: Record<Subject, [string, boolean]> = {
  images: ['इमेज', true], videos: ['वीडियो', false], documents: ['डॉक्यूमेंट', false], downloads: ['डाउनलोड', false],
};
const HI_FOLDER: Record<string, string> = {
  pictures: 'पिक्चर्स', videos: 'वीडियो', downloads: 'डाउनलोड', documents: 'डॉक्यूमेंट', dcim: 'कैमरा फ़ोल्डर', music: 'म्यूज़िक',
};
const HI_CAT: Record<string, string> = { Spreadsheets: 'स्प्रेडशीट', Archives: 'आर्काइव', Music: 'म्यूज़िक फ़ाइलें' };
const HI_WIN: Record<Window, string> = { today: 'आज', yesterday: 'कल', week: 'पिछले हफ़्ते' };
const hiFiles = (n: number) => `${num(n)} ${H(n, 'फ़ाइल', 'फ़ाइलें')}`;
const HI_ACT: Record<Action, [string, string]> = {
  moved: ['मूव की', 'मूव कीं'],
  renamed: ['का नाम बदला', 'के नाम बदले'],
  restored: ['ट्रैश से वापस लाई गई', 'ट्रैश से वापस लाई गईं'],
  trashed: ['ट्रैश में डाली', 'ट्रैश में डालीं'],
  deleted: ['हमेशा के लिए हटाई', 'हमेशा के लिए हटाईं'],
};
const HI: AskText = {
  and: 'और',
  join: p => (p.length === 1 ? p[0] : `${p.slice(0, -1).join(', ')} और ${p[p.length - 1]}`),
  noneOfKind: k => `मुझे आपके डिवाइस पर कोई ${HI_KIND[k][0]} नहीं ${HI_KIND[k][1] ? 'दिख रही' : 'दिख रहा'}।`,
  largestOne: (k, name, size, folder) =>
    `${HI_KIND[k][1] ? 'आपकी सबसे बड़ी' : 'आपका सबसे बड़ा'} ${HI_KIND[k][0]} ${name} है, ${size}, ${folder} में।`,
  largestCopies: (k, name, size, n, listed) =>
    `${HI_KIND[k][1] ? 'आपकी सबसे बड़ी' : 'आपका सबसे बड़ा'} ${HI_KIND[k][0]} ${name} है, ${size}। इसकी ${n} कॉपियाँ हैं: ${listed}।`,
  noFiles: 'मुझे आपके डिवाइस पर कोई फ़ाइल नहीं दिख रही।',
  largestFilesHeader: 'आपकी सबसे बड़ी फ़ाइलें:',
  fileLine: (i, name, size, folder) => `${i}. ${name}, ${size}, ${folder} में`,
  screenshots: n => (n === 0 ? 'आपके पास कोई स्क्रीनशॉट नहीं है।' : `आपके पास ${num(n)} स्क्रीनशॉट ${H(n, 'है', 'हैं')}।`),
  folderName: k => HI_FOLDER[k] || k,
  folderAt: (name, size) => `${name} (${size})`,
  mostSpace: items => `आपकी ज़्यादातर जगह ${items.join(', फिर ')} में जा रही है।`,
  storageLeft: (free, total, used, pct) => `आपके ${total} में से ${free} बचा है। आप ${used} इस्तेमाल कर रहे हैं, यानी ${pct} प्रतिशत।`,
  storageUsed: (used, total, pct) => `आप ${total} में से ${used} इस्तेमाल कर रहे हैं, यानी ${pct} प्रतिशत।`,
  categoryName: c => HI_CAT[c] || c,
  categoryNone: c => `आपके डिवाइस पर कोई ${HI_CAT[c] || c} नहीं है।`,
  categoryCount: (n, c, b) => `आपके पास ${hiFiles(n)} ${H(n, 'है', 'हैं')} जिन्हें मैं ${HI_CAT[c] || c} कहूँगा: ${b}।`,
  tallyItem: (n, ext) => `${n} ${ext}`,
  plusOthers: (listed, n) => `${listed}, और ${n} अन्य फ़ॉर्मेट`,
  countOf: (sub, n) => (n === 0 ? `आपके पास कोई ${HI_SUB[sub][0]} नहीं है।` : `आपके पास ${num(n)} ${HI_SUB[sub][0]} ${H(n, 'है', 'हैं')}।`),
  allCounts: (i, v, d, dl) => `${num(i)} इमेज, ${num(v)} वीडियो, ${num(d)} डॉक्यूमेंट और ${num(dl)} डाउनलोड।`,
  typesAll: (total, sub, b) => `${HI_SUB[sub][1] ? 'आपकी' : 'आपके'} ${num(total)} ${HI_SUB[sub][0]}: ${b}।`,
  typesSample: (sample, sub, b, total) =>
    `${HI_SUB[sub][1] ? 'आपकी सबसे हाल की' : 'आपके सबसे हाल के'} ${sample} ${HI_SUB[sub][0]} में: ${b}। कुल ${num(total)} ${HI_SUB[sub][0]} हैं, इसलिए यह एक नमूना है।`,
  docsBreakdown: b => `आपके डॉक्यूमेंट और डाउनलोड: ${b}।`,
  windowWords: w => HI_WIN[w],
  noneDeleted: w => `नहीं, आपने ${HI_WIN[w]} कुछ भी नहीं हटाया।`,
  trashedPart: n => `${hiFiles(n)} ट्रैश में, अभी वापस लाई जा ${H(n, 'सकती है', 'सकती हैं')}`,
  deletedPart: n => `${hiFiles(n)} हमेशा के लिए`,
  yesDeleted: j => `हाँ: ${j}।`,
  nothingRecorded: w => `${HI_WIN[w]} कुछ भी दर्ज नहीं है।`,
  actionPart: (a, n) => `${hiFiles(n)} ${HI_ACT[a][n === 1 ? 0 : 1]}`,
  actionsSummary: j => `${j}। पूरी जानकारी के लिए होम स्क्रीन पर घड़ी वाले आइकन पर टैप करें।`,
  trendDown: (size, when) => `${when} से स्टोरेज ${size} कम हुआ है।`,
  trendUp: (size, when) => `${when} से स्टोरेज ${size} बढ़ा है।`,
  yesterday: 'कल',
  dateLocale: 'hi-IN',
};

const TEXT: Record<AppLang, AskText> = { en: EN, ar: AR, hi: HI };

export function askText(lang: AppLang = getLanguage()): AskText { return TEXT[lang]; }
