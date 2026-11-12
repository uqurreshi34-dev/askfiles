/**
 * Duplicate Finder and Similar Image Finder words.
 *
 * Counts: Hindi verb changes for 1 versus more; Arabic has 1, 2 (dual),
 * 3-10 and 11+.
 */
import { AppLang } from '../appLanguage';

const ar = (n: number, one: string, two: string, few: string, many: string) =>
  n === 1 ? one : n === 2 ? two : n >= 3 && n <= 10 ? few : many;

export type DupText = {
  // Duplicate Finder
  title: string; proSub: string; find: string; findSub: string; scanningStorage: string;
  noneFound: string; clean: string; groupsLabel: (n: number) => string;
  copiesMeta: (n: number, each: string, wasted: string) => string;
  deleteAllButOne: string; deleteDuplicate: string; deleteFileMsg: (name: string) => string;
  keepOneMsg: (name: string) => string;
  // Similar Image Finder
  imgTitle: string; imgProSub: string; imgFind: string; imgFindSub: string;
  scanningImages: string; scanningProgress: (done: number, total: number) => string;
  imgNoneFound: string; imgClean: string; similarGroupsLabel: (n: number) => string;
  similarMeta: (n: number, wasted: string) => string; similarImages: string;
  keepLargest: string; deleteImage: string; deleteCopyMsg: string; keepLargestMsg: string;
  // Both
  startScan: string; mayTakeMoment: string; scanAgain: string; wastedSpace: string;
  keepOneCopy: string; deleteRest: string;
};

const TEXT: Record<AppLang, DupText> = {
  en: {
    title: 'Duplicate Finder', proSub: 'Duplicate Finder is part of AskFiles Pro. Upgrade once, use forever.',
    find: 'Find duplicate files',
    findSub: 'Scans your storage for files with the same name and size. Safe to run — nothing is deleted until you choose.',
    scanningStorage: 'Scanning your storage...', noneFound: 'No duplicates found!', clean: 'Your storage is clean.',
    groupsLabel: () => 'duplicate groups',
    copiesMeta: (n, each, wasted) => `${n} copies · ${each} each · ${wasted} wasted`,
    deleteAllButOne: 'Delete all but one', deleteDuplicate: 'Delete duplicate',
    deleteFileMsg: name => `Delete "${name}"? This cannot be undone.`,
    keepOneMsg: name => `Keep the first copy of "${name}" and permanently delete the rest? This cannot be undone.`,
    imgTitle: 'Similar Image Finder', imgProSub: 'Similar Image Finder is part of AskFiles Pro. Upgrade once, use forever.',
    imgFind: 'Find similar images',
    imgFindSub: 'Scans all your photos for visually similar duplicates — even if they have different filenames, sizes or formats.',
    scanningImages: 'Scanning your images...', scanningProgress: (d, t) => `Scanning ${d} of ${t} images...`,
    imgNoneFound: 'No similar images found!', imgClean: 'Your photo library looks clean.',
    similarGroupsLabel: () => 'similar groups',
    similarMeta: (n, wasted) => `${n} similar · ${wasted} wasted`, similarImages: 'Similar images',
    keepLargest: 'Keep largest, delete rest', deleteImage: 'Delete image',
    deleteCopyMsg: 'Delete this copy? This cannot be undone.',
    keepLargestMsg: 'Keep the largest copy and delete the rest? This cannot be undone.',
    startScan: 'Start Scan', mayTakeMoment: 'This may take a moment', scanAgain: 'Scan again', wastedSpace: 'wasted space',
    keepOneCopy: 'Keep one copy', deleteRest: 'Delete rest',
  },
  ar: {
    title: 'البحث عن الملفات المكررة', proSub: 'البحث عن الملفات المكررة جزء من AskFiles Pro. ادفع مرة واحدة واستخدمه للأبد.',
    find: 'ابحث عن الملفات المكررة',
    findSub: 'يفحص مساحة التخزين بحثاً عن ملفات بالاسم والحجم نفسيهما. آمن تماماً — لا يُحذف أي شيء حتى تختار أنت.',
    scanningStorage: 'جارٍ فحص مساحة التخزين...', noneFound: 'لم يُعثر على ملفات مكررة!', clean: 'مساحة التخزين لديك نظيفة.',
    groupsLabel: n => ar(n, 'مجموعة مكررة', 'مجموعتان مكررتان', 'مجموعات مكررة', 'مجموعة مكررة'),
    copiesMeta: (n, each, wasted) => `${ar(n, 'نسخة واحدة', 'نسختان', `${n} نسخ`, `${n} نسخة`)} · ${each} لكل نسخة · ${wasted} مهدرة`,
    deleteAllButOne: 'احذف الكل عدا نسخة واحدة', deleteDuplicate: 'حذف النسخة المكررة',
    deleteFileMsg: name => `حذف «${name}»؟ لا يمكن التراجع عن ذلك.`,
    keepOneMsg: name => `الإبقاء على النسخة الأولى من «${name}» وحذف البقية نهائياً؟ لا يمكن التراجع عن ذلك.`,
    imgTitle: 'البحث عن الصور المتشابهة', imgProSub: 'البحث عن الصور المتشابهة جزء من AskFiles Pro. ادفع مرة واحدة واستخدمه للأبد.',
    imgFind: 'ابحث عن الصور المتشابهة',
    imgFindSub: 'يفحص كل صورك بحثاً عن صور متشابهة بصرياً — حتى لو اختلفت أسماؤها أو أحجامها أو صيغها.',
    scanningImages: 'جارٍ فحص صورك...', scanningProgress: (d, t) => `جارٍ فحص ${d} من ${t}...`,
    imgNoneFound: 'لم يُعثر على صور متشابهة!', imgClean: 'مكتبة صورك تبدو نظيفة.',
    similarGroupsLabel: n => ar(n, 'مجموعة متشابهة', 'مجموعتان متشابهتان', 'مجموعات متشابهة', 'مجموعة متشابهة'),
    similarMeta: (n, wasted) => `${ar(n, 'صورة واحدة', 'صورتان متشابهتان', `${n} صور متشابهة`, `${n} صورة متشابهة`)} · ${wasted} مهدرة`,
    similarImages: 'صور متشابهة',
    keepLargest: 'أبقِ الأكبر واحذف البقية', deleteImage: 'حذف الصورة',
    deleteCopyMsg: 'حذف هذه النسخة؟ لا يمكن التراجع عن ذلك.',
    keepLargestMsg: 'الإبقاء على النسخة الأكبر وحذف البقية؟ لا يمكن التراجع عن ذلك.',
    startScan: 'ابدأ الفحص', mayTakeMoment: 'قد يستغرق ذلك لحظة', scanAgain: 'افحص مرة أخرى', wastedSpace: 'مساحة مهدرة',
    keepOneCopy: 'الإبقاء على نسخة واحدة', deleteRest: 'حذف البقية',
  },
  hi: {
    title: 'डुप्लिकेट फ़ाइंडर', proSub: 'डुप्लिकेट फ़ाइंडर AskFiles Pro का हिस्सा है। एक बार अपग्रेड करें, हमेशा इस्तेमाल करें।',
    find: 'डुप्लिकेट फ़ाइलें ढूँढें',
    findSub: 'एक जैसे नाम और साइज़ वाली फ़ाइलों के लिए आपका स्टोरेज स्कैन करता है। पूरी तरह सुरक्षित — जब तक आप न चुनें, कुछ नहीं हटता।',
    scanningStorage: 'आपका स्टोरेज स्कैन हो रहा है...', noneFound: 'कोई डुप्लिकेट नहीं मिला!', clean: 'आपका स्टोरेज साफ़ है।',
    groupsLabel: () => 'डुप्लिकेट ग्रुप',
    copiesMeta: (n, each, wasted) => `${n} कॉपी · हर एक ${each} · ${wasted} बेकार`,
    deleteAllButOne: 'एक को छोड़कर सब हटाएँ', deleteDuplicate: 'डुप्लिकेट हटाएँ',
    deleteFileMsg: name => `"${name}" हटाएँ? इसे वापस नहीं किया जा सकता।`,
    keepOneMsg: name => `"${name}" की पहली कॉपी रखें और बाकी हमेशा के लिए हटा दें? इसे वापस नहीं किया जा सकता।`,
    imgTitle: 'मिलती-जुलती इमेज फ़ाइंडर', imgProSub: 'मिलती-जुलती इमेज फ़ाइंडर AskFiles Pro का हिस्सा है। एक बार अपग्रेड करें, हमेशा इस्तेमाल करें।',
    imgFind: 'मिलती-जुलती इमेज ढूँढें',
    imgFindSub: 'आपकी सभी फ़ोटो में दिखने में मिलती-जुलती कॉपियाँ ढूँढता है — भले ही उनके नाम, साइज़ या फ़ॉर्मेट अलग हों।',
    scanningImages: 'आपकी इमेज स्कैन हो रही हैं...',
    scanningProgress: (d, t) => `${t} में से ${d} ${d === 1 ? 'इमेज स्कैन हुई' : 'इमेज स्कैन हुईं'}...`,
    imgNoneFound: 'कोई मिलती-जुलती इमेज नहीं मिली!', imgClean: 'आपकी फ़ोटो लाइब्रेरी साफ़ दिखती है।',
    similarGroupsLabel: () => 'मिलते-जुलते ग्रुप',
    similarMeta: (n, wasted) => `${n} मिलती-जुलती · ${wasted} बेकार`, similarImages: 'मिलती-जुलती इमेज',
    keepLargest: 'सबसे बड़ी रखें, बाकी हटाएँ', deleteImage: 'इमेज हटाएँ',
    deleteCopyMsg: 'यह कॉपी हटाएँ? इसे वापस नहीं किया जा सकता।',
    keepLargestMsg: 'सबसे बड़ी कॉपी रखें और बाकी हटा दें? इसे वापस नहीं किया जा सकता।',
    startScan: 'स्कैन शुरू करें', mayTakeMoment: 'इसमें थोड़ा समय लग सकता है', scanAgain: 'फिर से स्कैन करें', wastedSpace: 'बेकार जगह',
    keepOneCopy: 'एक कॉपी रखें', deleteRest: 'बाकी हटाएँ',
  },
};

export function dupText(lang: AppLang): DupText { return TEXT[lang]; }
