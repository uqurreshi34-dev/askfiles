/**
 * Words used on many screens: buttons, file-info labels, dates, PIN and
 * move messages. Each screen's own words live next to this file.
 *
 * In a screen: const c = commonText(useLanguage()).
 * In plain helpers (no hooks): commonText() uses the current language.
 */
import { AppLang, getLanguage } from '../appLanguage';

/** Arabic counts: 2 to 10 take the plural word, 1 and 11+ the singular. */
export function arCount(n: number, one: string, few: string) {
  return n >= 2 && n <= 10 ? few : one;
}

export type CommonText = {
  cancel: string; delete: string; ok: string; done: string; open: string;
  share: string; info: string; error: string; all: string;
  selected: (n: number) => string;
  working: string; openingFile: string; movingFile: string; movingFiles: string;
  moveHere: string; moveTo: string; folderEmpty: string; fileInfo: string;
  proFeature: string; upgradeToPro: string;
  // PIN
  incorrectPin: string; forgotPin: string; verifyResetPin: string;
  noBiometricsTitle: string; noBiometricsMsg: string;
  // Moving and deleting
  fileExists: string; moved: string; partialSuccess: string; deletePermanently: string;
  // File info
  size: string; modified: string; created: string; type: string;
  typeFile: (ext: string) => string;
  resolution: string; duration: string; dateTaken: string; recorded: string;
  camera: string; iso: string; aperture: string; shutter: string; gps: string;
  // Dates
  justNow: string;
  minsAgo: (n: number) => string; hoursAgo: (n: number) => string;
  daysAgo: (n: number) => string; monthsAgo: (n: number) => string;
  dateLocale: string;
};

const EN: CommonText = {
  cancel: 'Cancel', delete: 'Delete', ok: 'OK', done: 'Done', open: 'Open',
  share: 'Share', info: 'Info', error: 'Error', all: 'All',
  selected: n => `${n} selected`,
  working: 'Working...', openingFile: 'Opening file...', movingFile: 'Moving file...', movingFiles: 'Moving files...',
  moveHere: 'Move here', moveTo: 'Move to...', folderEmpty: 'This folder is empty', fileInfo: 'File Info',
  proFeature: 'Pro Feature', upgradeToPro: 'Upgrade to Pro',
  incorrectPin: 'Incorrect PIN. Try again.', forgotPin: 'Forgot PIN?',
  verifyResetPin: 'Verify identity to reset PIN',
  noBiometricsTitle: 'No biometrics available',
  noBiometricsMsg: 'For security, go to Settings → Apps → AskFiles → Clear Data to reset. Your vault files will be preserved if you reinstall from Play Store.',
  fileExists: 'File already exists', moved: 'Moved', partialSuccess: 'Partial success', deletePermanently: 'Delete permanently',
  size: 'Size', modified: 'Modified', created: 'Created', type: 'Type',
  typeFile: ext => `${ext} file`,
  resolution: 'Resolution', duration: 'Duration', dateTaken: 'Date taken', recorded: 'Recorded',
  camera: 'Camera', iso: 'ISO', aperture: 'Aperture', shutter: 'Shutter', gps: 'GPS',
  justNow: 'Just now',
  minsAgo: n => `${n} min ago`,
  hoursAgo: n => `${n} hour${n !== 1 ? 's' : ''} ago`,
  daysAgo: n => `${n} day${n !== 1 ? 's' : ''} ago`,
  monthsAgo: n => `${n} month${n !== 1 ? 's' : ''} ago`,
  dateLocale: 'en-GB',
};

const AR: CommonText = {
  cancel: 'إلغاء', delete: 'حذف', ok: 'حسناً', done: 'تم', open: 'فتح',
  share: 'مشاركة', info: 'معلومات', error: 'خطأ', all: 'الكل',
  selected: n => `تم تحديد ${n}`,
  working: 'جارٍ العمل...', openingFile: 'جارٍ فتح الملف...', movingFile: 'جارٍ نقل الملف...', movingFiles: 'جارٍ نقل الملفات...',
  moveHere: 'انقل هنا', moveTo: 'نقل إلى...', folderEmpty: 'هذا المجلد فارغ', fileInfo: 'معلومات الملف',
  proFeature: 'ميزة Pro', upgradeToPro: 'الترقية إلى Pro',
  incorrectPin: 'رمز PIN غير صحيح. حاول مرة أخرى.', forgotPin: 'نسيت رمز PIN؟',
  verifyResetPin: 'تحقّق من هويتك لإعادة تعيين رمز PIN',
  noBiometricsTitle: 'لا تتوفر بصمة أو وجه',
  noBiometricsMsg: 'لدواعٍ أمنية، اذهب إلى الإعدادات ← التطبيقات ← AskFiles ← مسح البيانات لإعادة التعيين. ستبقى ملفات خزنتك محفوظة إذا أعدت التثبيت من Play Store.',
  fileExists: 'الملف موجود بالفعل', moved: 'تم النقل', partialSuccess: 'نجاح جزئي', deletePermanently: 'حذف نهائي',
  size: 'الحجم', modified: 'آخر تعديل', created: 'تاريخ الإنشاء', type: 'النوع',
  typeFile: ext => `ملف ${ext}`,
  resolution: 'الدقة', duration: 'المدة', dateTaken: 'تاريخ الالتقاط', recorded: 'تاريخ التسجيل',
  camera: 'الكاميرا', iso: 'ISO', aperture: 'فتحة العدسة', shutter: 'سرعة الغالق', gps: 'الموقع (GPS)',
  justNow: 'الآن',
  minsAgo: n => `منذ ${n} ${arCount(n, 'دقيقة', 'دقائق')}`,
  hoursAgo: n => `منذ ${n} ${arCount(n, 'ساعة', 'ساعات')}`,
  daysAgo: n => `منذ ${n} ${arCount(n, 'يوم', 'أيام')}`,
  monthsAgo: n => `منذ ${n} ${arCount(n, 'شهر', 'أشهر')}`,
  dateLocale: 'ar-u-nu-latn',
};

const HI: CommonText = {
  cancel: 'रद्द करें', delete: 'हटाएँ', ok: 'ठीक है', done: 'हो गया', open: 'खोलें',
  share: 'शेयर करें', info: 'जानकारी', error: 'गड़बड़ी', all: 'सभी',
  selected: n => `${n} चुने गए`,
  working: 'काम हो रहा है...', openingFile: 'फ़ाइल खुल रही है...', movingFile: 'फ़ाइल मूव हो रही है...', movingFiles: 'फ़ाइलें मूव हो रही हैं...',
  moveHere: 'यहाँ मूव करें', moveTo: 'यहाँ मूव करें...', folderEmpty: 'यह फ़ोल्डर खाली है', fileInfo: 'फ़ाइल की जानकारी',
  proFeature: 'Pro फ़ीचर', upgradeToPro: 'Pro में अपग्रेड करें',
  incorrectPin: 'गलत PIN। फिर से कोशिश करें।', forgotPin: 'PIN भूल गए?',
  verifyResetPin: 'PIN रीसेट करने के लिए अपनी पहचान सत्यापित करें',
  noBiometricsTitle: 'बायोमेट्रिक उपलब्ध नहीं है',
  noBiometricsMsg: 'सुरक्षा के लिए, रीसेट करने हेतु Settings → Apps → AskFiles → Clear Data पर जाएँ। Play Store से दोबारा इंस्टॉल करने पर आपकी Vault फ़ाइलें सुरक्षित रहेंगी।',
  fileExists: 'फ़ाइल पहले से मौजूद है', moved: 'मूव हो गया', partialSuccess: 'आंशिक रूप से सफल', deletePermanently: 'हमेशा के लिए हटाएँ',
  size: 'साइज़', modified: 'बदला गया', created: 'बनाया गया', type: 'प्रकार',
  typeFile: ext => `${ext} फ़ाइल`,
  resolution: 'रेज़ोल्यूशन', duration: 'अवधि', dateTaken: 'खींचने की तारीख', recorded: 'रिकॉर्ड हुआ',
  camera: 'कैमरा', iso: 'ISO', aperture: 'अपर्चर', shutter: 'शटर', gps: 'GPS',
  justNow: 'अभी',
  minsAgo: n => `${n} मिनट पहले`,
  hoursAgo: n => `${n} घंटे पहले`,
  daysAgo: n => `${n} दिन पहले`,
  monthsAgo: n => `${n} महीने पहले`,
  dateLocale: 'hi-IN',
};

const TEXT: Record<AppLang, CommonText> = { en: EN, ar: AR, hi: HI };

export function commonText(lang: AppLang = getLanguage()): CommonText {
  return TEXT[lang];
}
