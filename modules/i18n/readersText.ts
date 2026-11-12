/**
 * CSV reader, PDF viewer, Text editor, Image editor and the cloud sign-in screen.
 *
 * Counts: Arabic has 1, 2 (dual), 3-10 and 11+; Hindi verb/noun changes for 1 versus more.
 */
import { AppLang } from '../appLanguage';

const ar = (n: number, one: string, two: string, few: string, many: string) =>
  n === 1 ? one : n === 2 ? two : n >= 3 && n <= 10 ? few : many;
const arRows = (n: number) => ar(n, 'صف واحد', 'صفان', `${n} صفوف`, `${n} صفاً`);

const EN = {
  // Shared
  error: 'Error', cancel: 'Cancel', done: 'Done', open: 'Open', saved: 'Saved', defaultSaveLocation: 'Default save location',
  download: 'Download', pictures: 'Pictures', savedTo: (p: string) => `Saved to ${p}`, couldNotOpenFile: 'Could not open file.',
  // CSV
  csvTitle: 'CSV Reader', csvOpen: 'Open a CSV file',
  csvIntro: 'View, search, sort and filter any CSV file. Works fully offline — your data never leaves your device.',
  csvChoose: 'Choose CSV File', emptyFile: 'Empty file', noData: 'This CSV has no data.', largeFile: 'Large file',
  showingFirst: (n: string) => `Showing the first ${n} rows. This file has more data than AskFiles displays at once.`,
  parseFailed: 'Parse failed', couldNotRead: 'Could not read this CSV.',
  copyColumn: 'Copy column', chart: 'Chart', analyse: 'Analyse',
  selectedRows: (n: number) => `${n} selected rows`, visibleRows: (n: number) => `${n} visible rows`,
  count: 'Count', sum: 'Sum', average: 'Average', min: 'Min', max: 'Max', stdDev: 'Std Deviation',
  copied: 'Copied', rowsCopied: (n: number) => `${n} row${n !== 1 ? 's' : ''} copied.`,
  valuesCopied: (n: number, col: string) => `${n} values from "${col}" copied.`,
  exported: 'Exported', exportFailed: 'Export failed', couldNotExport: 'Could not export.',
  searchIn: (col: string) => `Search in "${col}"…`, searchAll: 'Search all columns…', all: 'All',
  stats: (rows: number, cols: number, filtered: boolean) => `${rows} rows${filtered ? ' (filtered)' : ''} · ${cols} cols`,
  selected: (n: number) => `${n} selected`, selectAll: 'Select all', noResults: 'No results found',
  groupBy: 'Group by', valueSum: 'Value (sum)', topGroups: (n: number) => `Top ${n} groups by total`, noChartData: 'No data',
  columnInfo: 'Column Info', exportCsv: 'Export CSV',
  // PDF
  pdfTitle: 'PDF Viewer', pdfOpen: 'Open a PDF file', pdfIntro: 'View any PDF document. Works fully offline — your files never leave your device.',
  pdfChoose: 'Choose PDF File', couldNotOpenPdf: 'Could not open PDF.', jumping: (n: number) => `Jumping to page ${n}...`,
  pdfTip: 'Tip: Convert to images to extract text', pages: 'Pages',
  // Text editor
  txtTitle: 'Text Editor', txtIntro: 'Open and edit any text file. Changes are saved directly to the original file.',
  txtChoose: 'Choose Text File', unsaved: 'Unsaved changes', unsavedMsg: 'You have unsaved changes. Discard them?', discard: 'Discard',
  tooLarge: 'File too large', tooLargeMsg: 'Text Editor supports files up to 1MB. For larger files, use a desktop editor.',
  couldNotReadFile: 'Could not read file.', couldNotSave: 'Could not save file.', saveAs: 'Save As',
  // Image editor
  editImage: 'Edit image', unsupported: 'Unsupported image', couldNotReadImage: 'Could not read this image.', ok: 'OK',
  nothingToPlace: 'Nothing to place', nothingToPlaceMsg: 'Type some text or pick an emoji first.',
  savedAs: (name: string) => `Saved as ${name}`,
  downsampled: '\n\nThis image was very large, so the copy was saved at a slightly reduced size.',
  couldNotSaveImage: 'Could not save', somethingWrongImage: 'Something went wrong writing the image.',
  typeBelow: 'Type below, then tap the image to place it.', textPh: 'Text or emoji...', size: 'Size', undo: 'Undo', clear: 'Clear',
  added: (n: number) => `${n} added`, originalSafe: 'The original is never changed — saving creates a new copy.', saveEdited: 'Save edited image',
  // Cloud sign-in callback
  backToBackup: 'Back to Cloud Backup', connecting: 'Connecting…', connected: 'Connected successfully', cancelled: 'Sign in cancelled',
  tapBackBackup: 'Tap the back button above to return to Cloud Backup', tapBack: 'Tap the back button above to go back',
};

export type ReadersText = typeof EN;

const AR: ReadersText = {
  error: 'خطأ', cancel: 'إلغاء', done: 'تم', open: 'فتح', saved: 'تم الحفظ', defaultSaveLocation: 'مكان الحفظ الافتراضي',
  download: 'التنزيلات', pictures: 'الصور', savedTo: p => `حُفظ في ${p}`, couldNotOpenFile: 'تعذّر فتح الملف.',
  csvTitle: 'قارئ CSV', csvOpen: 'افتح ملف CSV',
  csvIntro: 'اعرض أي ملف CSV وابحث فيه ورتّبه وصفّه. يعمل دون اتصال تماماً — بياناتك لا تغادر جهازك أبداً.',
  csvChoose: 'اختر ملف CSV', emptyFile: 'ملف فارغ', noData: 'لا يحتوي ملف CSV هذا على بيانات.', largeFile: 'ملف كبير',
  showingFirst: n => `يُعرض أول ${n} صف. يحتوي هذا الملف على بيانات أكثر مما يعرضه AskFiles دفعة واحدة.`,
  parseFailed: 'تعذّرت القراءة', couldNotRead: 'تعذّرت قراءة ملف CSV هذا.',
  copyColumn: 'نسخ العمود', chart: 'رسم بياني', analyse: 'تحليل',
  selectedRows: n => `${arRows(n)} ${n === 1 ? 'محدد' : n === 2 ? 'محددان' : 'محددة'}`,
  visibleRows: n => `${arRows(n)} ${n === 1 ? 'ظاهر' : n === 2 ? 'ظاهران' : 'ظاهرة'}`,
  count: 'العدد', sum: 'المجموع', average: 'المتوسط', min: 'الأدنى', max: 'الأعلى', stdDev: 'الانحراف المعياري',
  copied: 'تم النسخ', rowsCopied: n => `نُسخ ${arRows(n)}.`,
  valuesCopied: (n, col) => `نُسخت ${ar(n, 'قيمة واحدة', 'قيمتان', `${n} قيم`, `${n} قيمة`)} من «${col}».`,
  exported: 'تم التصدير', exportFailed: 'فشل التصدير', couldNotExport: 'تعذّر التصدير.',
  searchIn: col => `ابحث في «${col}»…`, searchAll: 'ابحث في كل الأعمدة…', all: 'الكل',
  stats: (rows, cols, filtered) => `${arRows(rows)}${filtered ? ' (بعد التصفية)' : ''} · ${ar(cols, 'عمود واحد', 'عمودان', `${cols} أعمدة`, `${cols} عموداً`)}`,
  selected: n => `تم تحديد ${n}`, selectAll: 'تحديد الكل', noResults: 'لا توجد نتائج',
  groupBy: 'التجميع حسب', valueSum: 'القيمة (المجموع)',
  topGroups: n => ar(n, 'أعلى مجموعة حسب الإجمالي', 'أعلى مجموعتين حسب الإجمالي', `أعلى ${n} مجموعات حسب الإجمالي`, `أعلى ${n} مجموعة حسب الإجمالي`),
  noChartData: 'لا توجد بيانات', columnInfo: 'معلومات العمود', exportCsv: 'تصدير CSV',
  pdfTitle: 'عارض PDF', pdfOpen: 'افتح ملف PDF', pdfIntro: 'اعرض أي مستند PDF. يعمل دون اتصال تماماً — ملفاتك لا تغادر جهازك أبداً.',
  pdfChoose: 'اختر ملف PDF', couldNotOpenPdf: 'تعذّر فتح ملف PDF.', jumping: n => `جارٍ الانتقال إلى الصفحة ${n}...`,
  pdfTip: 'نصيحة: حوّله إلى صور لاستخراج النص', pages: 'الصفحات',
  txtTitle: 'محرر النصوص', txtIntro: 'افتح أي ملف نصي وعدّله. تُحفظ التغييرات مباشرة في الملف الأصلي.',
  txtChoose: 'اختر ملفاً نصياً', unsaved: 'تغييرات غير محفوظة', unsavedMsg: 'لديك تغييرات غير محفوظة. هل تريد تجاهلها؟', discard: 'تجاهل',
  tooLarge: 'الملف كبير جداً', tooLargeMsg: 'يدعم محرر النصوص ملفات حتى 1MB. للملفات الأكبر، استخدم محرراً على الحاسوب.',
  couldNotReadFile: 'تعذّرت قراءة الملف.', couldNotSave: 'تعذّر حفظ الملف.', saveAs: 'حفظ باسم',
  editImage: 'تعديل الصورة', unsupported: 'صورة غير مدعومة', couldNotReadImage: 'تعذّرت قراءة هذه الصورة.', ok: 'حسناً',
  nothingToPlace: 'لا شيء لإضافته', nothingToPlaceMsg: 'اكتب نصاً أو اختر رمزاً تعبيرياً أولاً.',
  savedAs: name => `حُفظت باسم ${name}`,
  downsampled: '\n\nكانت هذه الصورة كبيرة جداً، لذا حُفظت النسخة بحجم أصغر قليلاً.',
  couldNotSaveImage: 'تعذّر الحفظ', somethingWrongImage: 'حدث خطأ أثناء كتابة الصورة.',
  typeBelow: 'اكتب في الأسفل، ثم اضغط على الصورة لوضعه.', textPh: 'نص أو رمز تعبيري...', size: 'الحجم', undo: 'تراجع', clear: 'مسح',
  added: n => ar(n, 'أُضيف عنصر واحد', 'أُضيف عنصران', `أُضيفت ${n} عناصر`, `أُضيف ${n} عنصراً`),
  originalSafe: 'لا يتغير الأصل أبداً — الحفظ ينشئ نسخة جديدة.', saveEdited: 'حفظ الصورة المعدّلة',
  backToBackup: 'العودة إلى النسخ الاحتياطي السحابي', connecting: 'جارٍ الاتصال…', connected: 'تم الاتصال بنجاح', cancelled: 'أُلغي تسجيل الدخول',
  tapBackBackup: 'اضغط زر الرجوع في الأعلى للعودة إلى النسخ الاحتياطي السحابي', tapBack: 'اضغط زر الرجوع في الأعلى للعودة',
};

const HI: ReadersText = {
  error: 'गड़बड़ी', cancel: 'रद्द करें', done: 'हो गया', open: 'खोलें', saved: 'सेव हो गया', defaultSaveLocation: 'डिफ़ॉल्ट सेव लोकेशन',
  download: 'Download', pictures: 'Pictures', savedTo: p => `${p} में सेव हुआ`, couldNotOpenFile: 'फ़ाइल नहीं खुल सकी।',
  csvTitle: 'CSV रीडर', csvOpen: 'CSV फ़ाइल खोलें',
  csvIntro: 'किसी भी CSV फ़ाइल को देखें, खोजें, सॉर्ट और फ़िल्टर करें। पूरी तरह ऑफ़लाइन चलता है — आपका डेटा कभी आपके डिवाइस से बाहर नहीं जाता।',
  csvChoose: 'CSV फ़ाइल चुनें', emptyFile: 'खाली फ़ाइल', noData: 'इस CSV में कोई डेटा नहीं है।', largeFile: 'बड़ी फ़ाइल',
  showingFirst: n => `पहली ${n} पंक्तियाँ दिखाई जा रही हैं। इस फ़ाइल में AskFiles एक बार में जितना दिखाता है, उससे ज़्यादा डेटा है।`,
  parseFailed: 'पढ़ा नहीं जा सका', couldNotRead: 'यह CSV पढ़ी नहीं जा सकी।',
  copyColumn: 'कॉलम कॉपी करें', chart: 'चार्ट', analyse: 'विश्लेषण',
  selectedRows: n => n === 1 ? '1 चुनी गई पंक्ति' : `${n} चुनी गई पंक्तियाँ`,
  visibleRows: n => n === 1 ? '1 दिख रही पंक्ति' : `${n} दिख रही पंक्तियाँ`,
  count: 'गिनती', sum: 'जोड़', average: 'औसत', min: 'न्यूनतम', max: 'अधिकतम', stdDev: 'मानक विचलन',
  copied: 'कॉपी हो गया', rowsCopied: n => n === 1 ? '1 पंक्ति कॉपी हुई।' : `${n} पंक्तियाँ कॉपी हुईं।`,
  valuesCopied: (n, col) => n === 1 ? `"${col}" से 1 मान कॉपी हुआ।` : `"${col}" से ${n} मान कॉपी हुए।`,
  exported: 'एक्सपोर्ट हो गया', exportFailed: 'एक्सपोर्ट नहीं हो सका', couldNotExport: 'एक्सपोर्ट नहीं हो सका।',
  searchIn: col => `"${col}" में खोजें…`, searchAll: 'सभी कॉलम में खोजें…', all: 'सभी',
  stats: (rows, cols, filtered) => `${rows} ${rows === 1 ? 'पंक्ति' : 'पंक्तियाँ'}${filtered ? ' (फ़िल्टर की गई)' : ''} · ${cols} कॉलम`,
  selected: n => n === 1 ? '1 चुनी गई' : `${n} चुनी गईं`, selectAll: 'सभी चुनें', noResults: 'कोई नतीजा नहीं मिला',
  groupBy: 'ग्रुप करें', valueSum: 'मान (जोड़)', topGroups: n => `कुल के हिसाब से टॉप ${n} ग्रुप`, noChartData: 'कोई डेटा नहीं',
  columnInfo: 'कॉलम की जानकारी', exportCsv: 'CSV एक्सपोर्ट करें',
  pdfTitle: 'PDF व्यूअर', pdfOpen: 'PDF फ़ाइल खोलें', pdfIntro: 'कोई भी PDF डॉक्यूमेंट देखें। पूरी तरह ऑफ़लाइन चलता है — आपकी फ़ाइलें कभी आपके डिवाइस से बाहर नहीं जातीं।',
  pdfChoose: 'PDF फ़ाइल चुनें', couldNotOpenPdf: 'PDF नहीं खुल सकी।', jumping: n => `पेज ${n} पर जा रहे हैं...`,
  pdfTip: 'टिप: टेक्स्ट निकालने के लिए इसे इमेज में बदलें', pages: 'पेज',
  txtTitle: 'टेक्स्ट एडिटर', txtIntro: 'कोई भी टेक्स्ट फ़ाइल खोलें और बदलें। बदलाव सीधे मूल फ़ाइल में सेव होते हैं।',
  txtChoose: 'टेक्स्ट फ़ाइल चुनें', unsaved: 'बिना सेव किए बदलाव', unsavedMsg: 'आपके कुछ बदलाव सेव नहीं हुए हैं। उन्हें छोड़ दें?', discard: 'छोड़ दें',
  tooLarge: 'फ़ाइल बहुत बड़ी है', tooLargeMsg: 'टेक्स्ट एडिटर 1MB तक की फ़ाइलें सपोर्ट करता है। बड़ी फ़ाइलों के लिए कंप्यूटर वाला एडिटर इस्तेमाल करें।',
  couldNotReadFile: 'फ़ाइल पढ़ी नहीं जा सकी।', couldNotSave: 'फ़ाइल सेव नहीं हो सकी।', saveAs: 'इस रूप में सेव करें',
  editImage: 'इमेज एडिट करें', unsupported: 'यह इमेज सपोर्ट नहीं है', couldNotReadImage: 'यह इमेज पढ़ी नहीं जा सकी।', ok: 'ठीक है',
  nothingToPlace: 'लगाने के लिए कुछ नहीं', nothingToPlaceMsg: 'पहले कुछ टेक्स्ट लिखें या कोई इमोजी चुनें।',
  savedAs: name => `${name} नाम से सेव हुई`,
  downsampled: '\n\nयह इमेज बहुत बड़ी थी, इसलिए कॉपी थोड़े छोटे साइज़ में सेव की गई।',
  couldNotSaveImage: 'सेव नहीं हो सका', somethingWrongImage: 'इमेज लिखते समय कुछ गड़बड़ हो गई।',
  typeBelow: 'नीचे लिखें, फिर उसे लगाने के लिए इमेज पर टैप करें।', textPh: 'टेक्स्ट या इमोजी...', size: 'साइज़', undo: 'वापस लें', clear: 'साफ़ करें',
  added: n => n === 1 ? '1 जोड़ा गया' : `${n} जोड़े गए`, originalSafe: 'मूल इमेज कभी नहीं बदलती — सेव करने पर नई कॉपी बनती है।', saveEdited: 'एडिट की गई इमेज सेव करें',
  backToBackup: 'क्लाउड बैकअप पर वापस जाएँ', connecting: 'कनेक्ट हो रहा है…', connected: 'कनेक्ट हो गया', cancelled: 'साइन इन रद्द हुआ',
  tapBackBackup: 'क्लाउड बैकअप पर लौटने के लिए ऊपर वापस बटन दबाएँ', tapBack: 'वापस जाने के लिए ऊपर वापस बटन दबाएँ',
};

const TEXT: Record<AppLang, ReadersText> = { en: EN, ar: AR, hi: HI };

export function readersText(lang: AppLang): ReadersText {
  return TEXT[lang];
}
