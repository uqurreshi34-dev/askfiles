/**
 * Cleaner screens.
 *
 * Counts: Arabic has 1, 2 (dual), 3-10 and 11+; Hindi noun changes for 1 versus more.
 * App names (WhatsApp, Telegram) and APK stay in English in every language.
 */
import { AppLang } from '../appLanguage';
import type { CleanupGroupId } from '@/modules/media-store';

const ar = (n: number, one: string, two: string, few: string, many: string) =>
  n === 1 ? one : n === 2 ? two : n >= 3 && n <= 10 ? few : many;

export type CleanerText = {
  title: string; scanning: string; mayTakeMoment: string; rescan: string;
  canFree: (size: string) => string; reviewHint: string;
  nothing: string; nothingSub: string;
  groups: Record<CleanupGroupId, string>;
  files: (n: number) => string;
  moreWays: string; largeFiles: string; largeFilesSub: string;
  duplicates: string; duplicatesSub: string; similar: string; similarSub: string;
  // Group screen
  sortLargest: string; sortOldest: string; select: string; selectAll: string; clean: string;
  showingLargest: (shown: string, total: string) => string;
  confirmTitle: (n: number) => string; confirmMsg: string;
  moveToTrash: string; deletePermanently: string;
  trashedMsg: (n: number) => string; freedMsg: (size: string) => string; someFailed: string;
  proBulk: string;
};

const TEXT: Record<AppLang, CleanerText> = {
  en: {
    title: 'Cleaner', scanning: 'Scanning your storage...', mayTakeMoment: 'This may take a moment', rescan: 'Scan again',
    canFree: size => `${size} can be freed`, reviewHint: 'Tap a group to review its files. Nothing is removed until you choose.',
    nothing: 'Nothing to clean right now', nothingSub: 'Your storage looks clean.',
    groups: {
      whatsappVideo: 'WhatsApp videos', whatsappImages: 'WhatsApp images & stickers',
      whatsappVoice: 'WhatsApp voice notes & audio', whatsappDocs: 'WhatsApp documents',
      telegram: 'Telegram media', apks: 'App installer files (APK)',
      oldDownloads: 'Old downloads (90+ days)', oldScreenshots: 'Old screenshots (30+ days)',
    },
    files: n => `${n} file${n !== 1 ? 's' : ''}`,
    moreWays: 'MORE WAYS TO FREE SPACE', largeFiles: 'Large files', largeFilesSub: 'Files over 25 MB',
    duplicates: 'Duplicate files', duplicatesSub: 'Identical copies', similar: 'Similar images', similarSub: 'Near-identical photos',
    sortLargest: 'Largest', sortOldest: 'Oldest', select: 'Select', selectAll: 'Select all', clean: 'Clean',
    showingLargest: (shown, total) => `Showing the largest ${shown} of ${total} files.`,
    confirmTitle: n => n === 1 ? 'Clean 1 file?' : `Clean ${n} files?`,
    confirmMsg: 'Move to Trash keeps them for 30 days, and the space is freed when Trash is emptied. Delete permanently frees the space now and cannot be undone.',
    moveToTrash: 'Move to Trash', deletePermanently: 'Delete permanently',
    trashedMsg: n => `${n === 1 ? '1 file' : `${n} files`} moved to Trash. Empty Trash to free the space now.`,
    freedMsg: size => `${size} freed.`, someFailed: 'Some files could not be removed.',
    proBulk: 'Selecting many files at once is part of AskFiles Pro. You can still clean files one by one.',
  },
  ar: {
    title: 'المنظّف', scanning: 'جارٍ فحص مساحة التخزين...', mayTakeMoment: 'قد يستغرق ذلك لحظة', rescan: 'افحص مرة أخرى',
    canFree: size => `يمكن إخلاء ${size}`, reviewHint: 'اضغط على أي مجموعة لمراجعة ملفاتها. لا يُحذف شيء حتى تختار أنت.',
    nothing: 'لا يوجد ما يُنظَّف الآن', nothingSub: 'مساحة التخزين لديك تبدو نظيفة.',
    groups: {
      whatsappVideo: 'فيديوهات WhatsApp', whatsappImages: 'صور وملصقات WhatsApp',
      whatsappVoice: 'الرسائل الصوتية والصوتيات في WhatsApp', whatsappDocs: 'مستندات WhatsApp',
      telegram: 'وسائط Telegram', apks: 'ملفات تثبيت التطبيقات (APK)',
      oldDownloads: 'تنزيلات قديمة (أكثر من 90 يوماً)', oldScreenshots: 'لقطات شاشة قديمة (أكثر من 30 يوماً)',
    },
    files: n => ar(n, 'ملف واحد', 'ملفان', `${n} ملفات`, `${n} ملفاً`),
    moreWays: 'طرق أخرى لإخلاء المساحة', largeFiles: 'الملفات الكبيرة', largeFilesSub: 'ملفات تزيد على 25 MB',
    duplicates: 'الملفات المكررة', duplicatesSub: 'نسخ متطابقة', similar: 'الصور المتشابهة', similarSub: 'صور شبه متطابقة',
    sortLargest: 'الأكبر', sortOldest: 'الأقدم', select: 'تحديد', selectAll: 'تحديد الكل', clean: 'تنظيف',
    showingLargest: (shown, total) => `يُعرض أكبر ${shown} من أصل ${total} ملف.`,
    confirmTitle: n => ar(n, 'تنظيف ملف واحد؟', 'تنظيف ملفين؟', `تنظيف ${n} ملفات؟`, `تنظيف ${n} ملفاً؟`),
    confirmMsg: 'النقل إلى المهملات يحتفظ بها 30 يوماً، وتُخلى المساحة عند إفراغ المهملات. الحذف النهائي يُخلي المساحة الآن ولا يمكن التراجع عنه.',
    moveToTrash: 'نقل إلى المهملات', deletePermanently: 'حذف نهائي',
    trashedMsg: n => `${ar(n, 'نُقل ملف واحد', 'نُقل ملفان', `نُقلت ${n} ملفات`, `نُقل ${n} ملفاً`)} إلى المهملات. أفرغ المهملات لإخلاء المساحة الآن.`,
    freedMsg: size => `تم إخلاء ${size}.`, someFailed: 'تعذّرت إزالة بعض الملفات.',
    proBulk: 'تحديد عدة ملفات دفعة واحدة جزء من AskFiles Pro. لا يزال بإمكانك تنظيف الملفات واحداً تلو الآخر.',
  },
  hi: {
    title: 'क्लीनर', scanning: 'आपका स्टोरेज स्कैन हो रहा है...', mayTakeMoment: 'इसमें थोड़ा समय लग सकता है', rescan: 'फिर से स्कैन करें',
    canFree: size => `${size} खाली की जा सकती है`, reviewHint: 'किसी ग्रुप की फ़ाइलें देखने के लिए उस पर टैप करें। आपके चुने बिना कुछ नहीं हटेगा।',
    nothing: 'अभी साफ़ करने के लिए कुछ नहीं', nothingSub: 'आपका स्टोरेज साफ़ दिख रहा है।',
    groups: {
      whatsappVideo: 'WhatsApp वीडियो', whatsappImages: 'WhatsApp इमेज और स्टिकर',
      whatsappVoice: 'WhatsApp वॉइस नोट और ऑडियो', whatsappDocs: 'WhatsApp डॉक्यूमेंट',
      telegram: 'Telegram मीडिया', apks: 'ऐप इंस्टॉलर फ़ाइलें (APK)',
      oldDownloads: 'पुराने डाउनलोड (90+ दिन)', oldScreenshots: 'पुराने स्क्रीनशॉट (30+ दिन)',
    },
    files: n => `${n} ${n === 1 ? 'फ़ाइल' : 'फ़ाइलें'}`,
    moreWays: 'जगह खाली करने के और तरीके', largeFiles: 'बड़ी फ़ाइलें', largeFilesSub: '25 MB से बड़ी फ़ाइलें',
    duplicates: 'डुप्लिकेट फ़ाइलें', duplicatesSub: 'एक जैसी कॉपी', similar: 'मिलती-जुलती इमेज', similarSub: 'लगभग एक जैसी फ़ोटो',
    sortLargest: 'सबसे बड़ी', sortOldest: 'सबसे पुरानी', select: 'चुनें', selectAll: 'सभी चुनें', clean: 'साफ़ करें',
    showingLargest: (shown, total) => `${total} में से सबसे बड़ी ${shown} फ़ाइलें दिखाई जा रही हैं।`,
    confirmTitle: n => n === 1 ? '1 फ़ाइल साफ़ करें?' : `${n} फ़ाइलें साफ़ करें?`,
    confirmMsg: 'ट्रैश में भेजने पर वे 30 दिन तक रहती हैं, और ट्रैश खाली करने पर जगह खाली होती है। हमेशा के लिए हटाने पर जगह अभी खाली होती है और इसे वापस नहीं किया जा सकता।',
    moveToTrash: 'ट्रैश में भेजें', deletePermanently: 'हमेशा के लिए हटाएँ',
    trashedMsg: n => `${n === 1 ? '1 फ़ाइल ट्रैश में भेजी गई' : `${n} फ़ाइलें ट्रैश में भेजी गईं`}। जगह अभी खाली करने के लिए ट्रैश खाली करें।`,
    freedMsg: size => `${size} जगह खाली हुई।`, someFailed: 'कुछ फ़ाइलें हटाई नहीं जा सकीं।',
    proBulk: 'एक साथ कई फ़ाइलें चुनना AskFiles Pro का हिस्सा है। आप फ़ाइलें एक-एक करके अब भी साफ़ कर सकते हैं।',
  },
};

export function cleanerText(lang: AppLang): CleanerText {
  return TEXT[lang];
}
