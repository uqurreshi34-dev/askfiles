/**
 * Home screen words in English, Arabic and Hindi: the home page, its
 * Settings, What's New and rating pop-ups, the tools grid and the tab bar.
 *
 * Use homeText(useLanguage()) so the screen switches when the language
 * changes. Names people chose themselves (folders, tags, files) are never
 * translated.
 */
import { AppLang } from './appLanguage';

/** Arabic counts: 2 to 10 take the plural word, 1 and 11+ the singular. */
function ar(n: number, one: string, few: string) {
  return n >= 2 && n <= 10 ? few : one;
}

/** Arabic: exactly 2 uses the dual word on its own (ملفين / ملفان); otherwise number + word. */
const D = (n: number, one: string, few: string, dual: string) => (n === 2 ? dual : `${n} ${ar(n, one, few)}`);

export type HomeText = {
  // Header area
  searchFiles: string;
  quickAccess: string;
  tools: string;
  pinned: string;
  tags: string;
  mostUsed: string;
  recent: string;
  clearAll: string;
  noRecents: string;
  // Quick access
  images: string;
  videos: string;
  documents: string;
  downloads: string;
  favourites: string;
  trash: string;
  // Tools
  network: string;
  largeFiles: string;
  storage: string;
  docScanner: string;
  sensitiveFiles: string;
  imageConverter: string;
  csvReader: string;
  pdfReader: string;
  textEditor: string;
  // Recents
  group: Record<string, string>;
  timeAgo: (timestamp: number) => string;
  // Permission cards
  fullAccessTitle: string;
  fullAccessSub: string;
  mediaAccessTitle: string;
  mediaAccessSub: string;
  // Settings
  version: (v: string) => string;
  privacyPolicy: string;
  rateApp: string;
  appLock: string;
  background: string;
  language: string;
  close: string;
  palette: Record<string, string>;
  verifyToDisableLock: string;
  cancel: string;
  // What's New
  whatsNew: string;
  whatsNewItems: [string, string, string, string];
  gotIt: string;
  // Rating
  enjoying: string;
  quickRating: string;
  rateAskFiles: string;
  maybeLater: string;
  // Scanner, pins and tags
  saveScanAs: string;
  pagesScanned: (n: number) => string;
  imagesJpg: string;
  scanFailed: string;
  scanFailedMsg: string;
  scanCancelled: string;
  unpinFolder: string;
  unpinMsg: (name: string) => string;
  unpin: string;
  deleteTag: string;
  deleteTagMsg: (name: string) => string;
  delete: string;
  saved: string;
  imagesSaved: (n: number, where: string) => string;
  pdfSaved: (where: string) => string;
  internalStorage: string;
  chooseLocation: string;
  defaultSaveLocation: string;
  // Tools grid
  dragHint: string;
  done: string;
  tapToRestoreTools: string;
  hiddenTapToRestore: string;
  // Tab bar
  tabHome: string;
  tabBrowse: string;
  tabSearch: string;
  tabCloud: string;
};

function ago(
  ts: number,
  justNow: string,
  mins: (n: number) => string,
  hours: (n: number) => string,
  yesterday: string,
  days: (n: number) => string,
) {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (m < 1) return justNow;
  if (m < 60) return mins(m);
  if (h < 24) return hours(h);
  if (d === 1) return yesterday;
  return days(d);
}

const EN: HomeText = {
  searchFiles: 'Search files...',
  quickAccess: 'Quick Access',
  tools: 'Tools',
  pinned: 'Pinned',
  tags: 'Tags',
  mostUsed: 'Most Used',
  recent: 'Recent',
  clearAll: 'Clear all',
  noRecents: 'No recent files — open something from Browse',
  images: 'Images',
  videos: 'Videos',
  documents: 'Documents',
  downloads: 'Downloads',
  favourites: 'Favourites',
  trash: 'Trash',
  network: 'Network',
  largeFiles: 'Large Files',
  storage: 'Storage',
  docScanner: 'Doc Scanner',
  sensitiveFiles: 'Sensitive Files',
  imageConverter: 'Image Converter',
  csvReader: 'CSV Reader',
  pdfReader: 'PDF Reader',
  textEditor: 'Text Editor',
  group: { Today: 'Today', Yesterday: 'Yesterday', 'This week': 'This week', Older: 'Older' },
  timeAgo: ts => ago(ts, 'Just now', n => `${n} min ago`, n => `${n} hr ago`, 'Yesterday', n => `${n} days ago`),
  fullAccessTitle: 'Full storage access needed',
  fullAccessSub: 'Tap to enable — required for Browse, Documents and file operations',
  mediaAccessTitle: 'Media access needed',
  mediaAccessSub: 'Tap to enable — required for Images, Videos and Storage Breakdown',
  version: v => `Version ${v}`,
  privacyPolicy: 'Privacy Policy',
  rateApp: 'Rate App',
  appLock: 'App Lock',
  background: 'Background',
  language: 'Language',
  close: 'Close',
  palette: {},
  verifyToDisableLock: 'Verify identity to disable app lock',
  cancel: 'Cancel',
  whatsNew: "What's New",
  whatsNewItems: [
    'Arabic and Hindi — across the whole app, including the widget and reminders. Switch any time in Settings',
    'Folder organiser — in Browse, tap the sparkle button to sort a messy folder into tidy subfolders, with undo',
    'Free AI answers — tap a question to find your largest image, video or file',
    'Activity log — see what you moved, deleted or put in the Vault',
  ],
  gotIt: 'Got it',
  enjoying: 'Enjoying AskFiles?',
  quickRating: 'A quick rating helps a lot ⭐',
  rateAskFiles: 'Rate AskFiles',
  maybeLater: 'Maybe later',
  saveScanAs: 'Save scan as',
  pagesScanned: n => `${n} page${n > 1 ? 's' : ''} scanned`,
  imagesJpg: 'Images (JPG)',
  scanFailed: 'Scan failed',
  scanFailedMsg: 'Could not complete scan',
  scanCancelled: 'User cancelled scan',
  unpinFolder: 'Unpin folder',
  unpinMsg: name => `Remove "${name}" from Home?`,
  unpin: 'Unpin',
  deleteTag: 'Delete tag',
  deleteTagMsg: name => `Delete "${name}" and remove it from all files?`,
  delete: 'Delete',
  saved: 'Saved',
  imagesSaved: (n, where) => `${n} image${n > 1 ? 's' : ''} saved to ${where}`,
  pdfSaved: where => `PDF saved to ${where}`,
  internalStorage: 'Internal Storage',
  chooseLocation: 'Choose location',
  defaultSaveLocation: 'Default save location',
  dragHint: 'Long press to drag · tap × to hide',
  done: 'Done',
  tapToRestoreTools: 'Tap to restore tools',
  hiddenTapToRestore: 'Hidden — tap to restore',
  tabHome: 'Home',
  tabBrowse: 'Browse',
  tabSearch: 'Search',
  tabCloud: 'Cloud',
};

const AR: HomeText = {
  searchFiles: 'ابحث في الملفات...',
  quickAccess: 'وصول سريع',
  tools: 'الأدوات',
  pinned: 'المثبّتة',
  tags: 'الوسوم',
  mostUsed: 'الأكثر استخداماً',
  recent: 'الأخيرة',
  clearAll: 'مسح الكل',
  noRecents: 'لا توجد ملفات حديثة — افتح ملفاً من تصفّح',
  images: 'الصور',
  videos: 'الفيديو',
  documents: 'المستندات',
  downloads: 'التنزيلات',
  favourites: 'المفضلة',
  trash: 'المهملات',
  network: 'الشبكة',
  largeFiles: 'الملفات الكبيرة',
  storage: 'التخزين',
  docScanner: 'ماسح المستندات',
  sensitiveFiles: 'الملفات الحساسة',
  imageConverter: 'محوّل الصور',
  csvReader: 'قارئ CSV',
  pdfReader: 'قارئ PDF',
  textEditor: 'محرر النصوص',
  group: { Today: 'اليوم', Yesterday: 'أمس', 'This week': 'هذا الأسبوع', Older: 'أقدم' },
  timeAgo: ts => ago(
    ts,
    'الآن',
    n => `منذ ${D(n, 'دقيقة', 'دقائق', 'دقيقتين')}`,
    n => `منذ ${D(n, 'ساعة', 'ساعات', 'ساعتين')}`,
    'أمس',
    n => `منذ ${D(n, 'يوم', 'أيام', 'يومين')}`,
  ),
  fullAccessTitle: 'مطلوب الوصول الكامل إلى التخزين',
  fullAccessSub: 'اضغط للتفعيل — مطلوب للتصفح والمستندات وعمليات الملفات',
  mediaAccessTitle: 'مطلوب الوصول إلى الوسائط',
  mediaAccessSub: 'اضغط للتفعيل — مطلوب للصور والفيديو وتفاصيل التخزين',
  version: v => `الإصدار ${v}`,
  privacyPolicy: 'سياسة الخصوصية',
  rateApp: 'قيّم التطبيق',
  appLock: 'قفل التطبيق',
  background: 'الخلفية',
  language: 'اللغة',
  close: 'إغلاق',
  palette: {
    classic: 'كلاسيكي', sage: 'مريمية', blush: 'وردي', sky: 'سماوي', sand: 'رملي',
    navy: 'كحلي', brown: 'بني', forest: 'غابة',
  },
  verifyToDisableLock: 'تحقّق من هويتك لإيقاف قفل التطبيق',
  cancel: 'إلغاء',
  whatsNew: 'ما الجديد',
  whatsNewItems: [
    'العربية والهندية — في التطبيق كله، بما في ذلك أداة الشاشة الرئيسية والتذكيرات. غيّر اللغة متى شئت من الإعدادات',
    'منظّم المجلدات — في تصفّح، اضغط زر النجمة لترتيب مجلد فوضوي في مجلدات فرعية مرتبة، مع إمكانية التراجع',
    'إجابات مجانية بالذكاء الاصطناعي — اضغط سؤالاً لتعرف أكبر صورة أو فيديو أو ملف لديك',
    'سجل النشاط — اعرف ما نقلته أو حذفته أو وضعته في الخزنة',
  ],
  gotIt: 'حسناً',
  enjoying: 'هل يعجبك AskFiles؟',
  quickRating: 'تقييم سريع يساعدنا كثيراً ⭐',
  rateAskFiles: 'قيّم AskFiles',
  maybeLater: 'لاحقاً',
  saveScanAs: 'حفظ المسح بصيغة',
  pagesScanned: n => `تم مسح ${D(n, 'صفحة', 'صفحات', 'صفحتين')}`,
  imagesJpg: 'صور (JPG)',
  scanFailed: 'فشل المسح',
  scanFailedMsg: 'تعذّر إكمال المسح',
  scanCancelled: 'ألغى المستخدم المسح',
  unpinFolder: 'إلغاء تثبيت المجلد',
  unpinMsg: name => `إزالة «${name}» من الرئيسية؟`,
  unpin: 'إلغاء التثبيت',
  deleteTag: 'حذف الوسم',
  deleteTagMsg: name => `حذف «${name}» وإزالته من كل الملفات؟`,
  delete: 'حذف',
  saved: 'تم الحفظ',
  imagesSaved: (n, where) => `تم حفظ ${D(n, 'صورة', 'صور', 'صورتين')} في ${where}`,
  pdfSaved: where => `تم حفظ ملف PDF في ${where}`,
  internalStorage: 'التخزين الداخلي',
  chooseLocation: 'اختر المكان',
  defaultSaveLocation: 'مكان الحفظ الافتراضي',
  dragHint: 'اضغط مطوّلاً للسحب · اضغط × للإخفاء',
  done: 'تم',
  tapToRestoreTools: 'اضغط لاستعادة الأدوات',
  hiddenTapToRestore: 'مخفية — اضغط للاستعادة',
  tabHome: 'الرئيسية',
  tabBrowse: 'تصفّح',
  tabSearch: 'بحث',
  tabCloud: 'السحابة',
};

const HI: HomeText = {
  searchFiles: 'फ़ाइलें खोजें...',
  quickAccess: 'क्विक एक्सेस',
  tools: 'टूल्स',
  pinned: 'पिन किए गए',
  tags: 'टैग',
  mostUsed: 'सबसे ज़्यादा इस्तेमाल',
  recent: 'हाल की',
  clearAll: 'सब हटाएँ',
  noRecents: 'कोई हाल की फ़ाइल नहीं — ब्राउज़ से कुछ खोलें',
  images: 'इमेज',
  videos: 'वीडियो',
  documents: 'डॉक्यूमेंट',
  downloads: 'डाउनलोड',
  favourites: 'पसंदीदा',
  trash: 'ट्रैश',
  network: 'नेटवर्क',
  largeFiles: 'बड़ी फ़ाइलें',
  storage: 'स्टोरेज',
  docScanner: 'डॉक स्कैनर',
  sensitiveFiles: 'संवेदनशील फ़ाइलें',
  imageConverter: 'इमेज कन्वर्टर',
  csvReader: 'CSV रीडर',
  pdfReader: 'PDF रीडर',
  textEditor: 'टेक्स्ट एडिटर',
  group: { Today: 'आज', Yesterday: 'कल', 'This week': 'इस हफ़्ते', Older: 'पुरानी' },
  timeAgo: ts => ago(ts, 'अभी', n => `${n} मिनट पहले`, n => `${n} घंटे पहले`, 'कल', n => `${n} दिन पहले`),
  fullAccessTitle: 'पूरे स्टोरेज की अनुमति चाहिए',
  fullAccessSub: 'चालू करने के लिए टैप करें — ब्राउज़, डॉक्यूमेंट और फ़ाइल के कामों के लिए ज़रूरी',
  mediaAccessTitle: 'मीडिया की अनुमति चाहिए',
  mediaAccessSub: 'चालू करने के लिए टैप करें — इमेज, वीडियो और स्टोरेज ब्रेकडाउन के लिए ज़रूरी',
  version: v => `वर्ज़न ${v}`,
  privacyPolicy: 'प्राइवेसी पॉलिसी',
  rateApp: 'ऐप को रेट करें',
  appLock: 'ऐप लॉक',
  background: 'बैकग्राउंड',
  language: 'भाषा',
  close: 'बंद करें',
  palette: {
    classic: 'क्लासिक', sage: 'सेज', blush: 'ब्लश', sky: 'स्काई', sand: 'सैंड',
    navy: 'नेवी', brown: 'ब्राउन', forest: 'फ़ॉरेस्ट',
  },
  verifyToDisableLock: 'ऐप लॉक बंद करने के लिए अपनी पहचान सत्यापित करें',
  cancel: 'रद्द करें',
  whatsNew: 'नया क्या है',
  whatsNewItems: [
    'अरबी और हिन्दी — पूरे ऐप में, विजेट और रिमाइंडर समेत। सेटिंग्स में कभी भी बदलें',
    'फ़ोल्डर ऑर्गनाइज़र — ब्राउज़ में स्पार्कल बटन दबाकर बिखरे फ़ोल्डर को साफ़ सब-फ़ोल्डरों में बाँटें, अनडू के साथ',
    'मुफ़्त AI जवाब — अपनी सबसे बड़ी इमेज, वीडियो या फ़ाइल जानने के लिए सवाल पर टैप करें',
    'एक्टिविटी लॉग — देखें आपने क्या मूव किया, हटाया या Vault में रखा',
  ],
  gotIt: 'ठीक है',
  enjoying: 'AskFiles पसंद आ रहा है?',
  quickRating: 'एक छोटी-सी रेटिंग बहुत मदद करती है ⭐',
  rateAskFiles: 'AskFiles को रेट करें',
  maybeLater: 'बाद में',
  saveScanAs: 'स्कैन को इस रूप में सेव करें',
  pagesScanned: n => `${n} पेज स्कैन ${n > 1 ? 'हुए' : 'हुआ'}`,
  imagesJpg: 'इमेज (JPG)',
  scanFailed: 'स्कैन नहीं हो सका',
  scanFailedMsg: 'स्कैन पूरा नहीं हो सका',
  scanCancelled: 'यूज़र ने स्कैन रद्द किया',
  unpinFolder: 'फ़ोल्डर अनपिन करें',
  unpinMsg: name => `"${name}" को होम से हटाएँ?`,
  unpin: 'अनपिन करें',
  deleteTag: 'टैग हटाएँ',
  deleteTagMsg: name => `"${name}" को हटाएँ और सभी फ़ाइलों से निकालें?`,
  delete: 'हटाएँ',
  saved: 'सेव हो गया',
  imagesSaved: (n, where) => `${n} इमेज ${where} में सेव ${n > 1 ? 'हुईं' : 'हुई'}`,
  pdfSaved: where => `PDF ${where} में सेव हुई`,
  internalStorage: 'इंटरनल स्टोरेज',
  chooseLocation: 'जगह चुनें',
  defaultSaveLocation: 'डिफ़ॉल्ट सेव लोकेशन',
  dragHint: 'खींचने के लिए देर तक दबाएँ · छिपाने के लिए × दबाएँ',
  done: 'हो गया',
  tapToRestoreTools: 'टूल्स वापस लाने के लिए टैप करें',
  hiddenTapToRestore: 'छिपे हुए — वापस लाने के लिए टैप करें',
  tabHome: 'होम',
  tabBrowse: 'ब्राउज़',
  tabSearch: 'सर्च',
  tabCloud: 'क्लाउड',
};

const TEXT: Record<AppLang, HomeText> = { en: EN, ar: AR, hi: HI };

export function homeText(lang: AppLang): HomeText {
  return TEXT[lang];
}
