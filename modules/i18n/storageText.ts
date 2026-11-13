/** Storage Breakdown screen and the storage summary card. */
import { AppLang } from '../appLanguage';

export type StorageText = {
  title: string; calculating: string; byCategory: string; details: string; note: string; includes: string;
  images: string; videos: string; downloads: string; documents: string; music: string; other: string;
  storage: string; internalStorage: string; internal: string; used: string;
  free: string; usedLabel: string; total: string;
  healthy: string; consider: string; low: string;
  info: (total: string, used: string) => string;
  sdInfo: (name: string, total: string, free: string) => string;
  infoEnd: string;
  freeUpSpace: string; freeUpSpaceSub: string;
};

const TEXT: Record<AppLang, StorageText> = {
  en: {
    title: 'Storage Breakdown', calculating: 'Calculating...', byCategory: 'BY CATEGORY', details: 'DETAILS',
    note: 'Sizes shown are for files you can see and manage in AskFiles.', includes: 'Includes apps and user files',
    images: 'Images', videos: 'Videos', downloads: 'Downloads', documents: 'Documents', music: 'Music', other: 'Other',
    storage: 'Storage', internalStorage: 'Internal storage', internal: 'Internal', used: 'used',
    free: 'Free', usedLabel: 'Used', total: 'Total',
    healthy: 'Storage is healthy', consider: 'Consider clearing some space', low: 'Running low on space',
    info: (total, used) => `Your device has ${total} of internal storage. AskFiles shows ${used} used across your files and apps.`,
    sdInfo: (name, total, free) => ` Your ${name} has ${total} total with ${free} free.`,
    freeUpSpace: 'Free up space', freeUpSpaceSub: 'WhatsApp and Telegram media, old downloads, APKs and more',
    infoEnd: ' Android Settings may show a slightly different figure — this is normal and is due to how the operating system calculates reserved and system space.',
  },
  ar: {
    title: 'تفاصيل مساحة التخزين', calculating: 'جارٍ الحساب...', byCategory: 'حسب الفئة', details: 'التفاصيل',
    note: 'الأحجام المعروضة للملفات التي يمكنك رؤيتها وإدارتها في AskFiles.', includes: 'تشمل التطبيقات وملفات المستخدم',
    images: 'الصور', videos: 'الفيديوهات', downloads: 'التنزيلات', documents: 'المستندات', music: 'الموسيقى', other: 'أخرى',
    storage: 'التخزين', internalStorage: 'التخزين الداخلي', internal: 'الداخلي', used: 'مستخدم',
    free: 'متاح', usedLabel: 'مستخدم', total: 'الإجمالي',
    healthy: 'مساحة التخزين بحالة جيدة', consider: 'يُستحسن إخلاء بعض المساحة', low: 'المساحة توشك على النفاد',
    info: (total, used) => `يحتوي جهازك على ${total} من التخزين الداخلي. يعرض AskFiles ${used} مستخدمة لملفاتك وتطبيقاتك.`,
    sdInfo: (name, total, free) => ` تبلغ سعة ${name} ${total} والمتاح منها ${free}.`,
    freeUpSpace: 'أخلِ بعض المساحة', freeUpSpaceSub: 'وسائط WhatsApp وTelegram والتنزيلات القديمة وملفات APK وغيرها',
    infoEnd: ' قد تُظهر إعدادات Android رقماً مختلفاً قليلاً — هذا طبيعي ويعود إلى طريقة حساب النظام للمساحة المحجوزة ومساحة النظام.',
  },
  hi: {
    title: 'स्टोरेज का ब्योरा', calculating: 'हिसाब लगाया जा रहा है...', byCategory: 'कैटेगरी के अनुसार', details: 'विवरण',
    note: 'दिखाए गए साइज़ उन फ़ाइलों के हैं जिन्हें आप AskFiles में देख और मैनेज कर सकते हैं।', includes: 'ऐप्स और यूज़र फ़ाइलें शामिल हैं',
    images: 'इमेज', videos: 'वीडियो', downloads: 'डाउनलोड', documents: 'डॉक्यूमेंट', music: 'म्यूज़िक', other: 'अन्य',
    storage: 'स्टोरेज', internalStorage: 'इंटरनल स्टोरेज', internal: 'इंटरनल', used: 'इस्तेमाल',
    free: 'खाली', usedLabel: 'इस्तेमाल', total: 'कुल',
    healthy: 'स्टोरेज ठीक है', consider: 'थोड़ी जगह खाली करना अच्छा रहेगा', low: 'जगह कम हो रही है',
    info: (total, used) => `आपके डिवाइस में ${total} इंटरनल स्टोरेज है। AskFiles आपकी फ़ाइलों और ऐप्स में ${used} इस्तेमाल दिखाता है।`,
    sdInfo: (name, total, free) => ` आपके ${name} में कुल ${total} है, जिसमें ${free} खाली है।`,
    freeUpSpace: 'जगह खाली करें', freeUpSpaceSub: 'WhatsApp और Telegram मीडिया, पुराने डाउनलोड, APK और भी बहुत कुछ',
    infoEnd: ' Android Settings में थोड़ा अलग आँकड़ा दिख सकता है — यह सामान्य है, क्योंकि सिस्टम रिज़र्व और सिस्टम स्पेस को अलग तरीके से गिनता है।',
  },
};

export function storageText(lang: AppLang): StorageText {
  return TEXT[lang];
}
