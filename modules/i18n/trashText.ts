/**
 * Trash (Recently Deleted) screen.
 *
 * Counts: Arabic has 1, 2 (dual), 3-10 and 11+; Hindi verb changes for 1 versus more.
 */
import { AppLang } from '../appLanguage';

const ar = (n: number, one: string, two: string, few: string, many: string) =>
  n === 1 ? one : n === 2 ? two : n >= 3 && n <= 10 ? few : many;

export type TrashText = {
  title: string; empty: string; emptySub: string; countLine: (n: number) => string;
  restore: string; restoring: string; restoringOf: (done: number, total: number) => string;
  deletePermanently: string; deleteForever: (name: string) => string; emptyTrash: string; emptyMsg: (n: number) => string;
  restored: string; restoredToDownloads: string; couldNotRestore: string;
  oneRestored: (name: string) => string; oneToDownloads: (name: string) => string;
  nRestored: (n: number) => string; nToDownloads: (n: number) => string; nMovedToDownloads: (n: number) => string;
  expires: (days: number) => string;
};

const TEXT: Record<AppLang, TrashText> = {
  en: {
    title: 'Recently Deleted', empty: 'Trash is empty',
    emptySub: 'Deleted files appear here for 30 days before being permanently removed.',
    countLine: n => `${n} file${n !== 1 ? 's' : ''} · Kept for up to 30 days`,
    restore: 'Restore', restoring: 'Restoring...', restoringOf: (d, t) => `Restoring ${d} of ${t}...`,
    deletePermanently: 'Delete permanently', deleteForever: name => `Delete "${name}" forever? This cannot be undone.`,
    emptyTrash: 'Empty Trash',
    emptyMsg: n => n === 1 ? 'Permanently delete this file? This cannot be undone.' : `Permanently delete ${n} files? This cannot be undone.`,
    restored: 'Restored', restoredToDownloads: 'Restored to Downloads', couldNotRestore: 'Could not restore file.',
    oneRestored: name => `"${name}" restored to its original location.`,
    oneToDownloads: name => `"${name}" could not be restored to its original location as the folder no longer exists. It has been moved to Downloads instead.`,
    nRestored: n => `${n} file${n !== 1 ? 's' : ''} restored to original location.`,
    nToDownloads: n => `${n} file${n !== 1 ? 's' : ''} restored to Downloads as original folder no longer exists.`,
    nMovedToDownloads: n => `${n} moved to Downloads as original folder no longer exists.`,
    expires: d => d <= 0 ? 'Expiring soon' : d === 1 ? 'Expires tomorrow' : `Expires in ${d} days`,
  },
  ar: {
    title: 'المحذوفة مؤخراً', empty: 'المهملات فارغة',
    emptySub: 'تظهر الملفات المحذوفة هنا لمدة 30 يوماً قبل حذفها نهائياً.',
    countLine: n => `${ar(n, 'ملف واحد', 'ملفان', `${n} ملفات`, `${n} ملفاً`)} · تُحفظ لمدة تصل إلى 30 يوماً`,
    restore: 'استعادة', restoring: 'جارٍ الاستعادة...', restoringOf: (d, t) => `جارٍ استعادة ${d} من ${t}...`,
    deletePermanently: 'حذف نهائي', deleteForever: name => `حذف «${name}» نهائياً؟ لا يمكن التراجع عن ذلك.`,
    emptyTrash: 'إفراغ المهملات',
    emptyMsg: n => `${ar(n, 'حذف هذا الملف نهائياً؟', 'حذف الملفين نهائياً؟', `حذف ${n} ملفات نهائياً؟`, `حذف ${n} ملفاً نهائياً؟`)} لا يمكن التراجع عن ذلك.`,
    restored: 'تمت الاستعادة', restoredToDownloads: 'تمت الاستعادة إلى التنزيلات', couldNotRestore: 'تعذّرت استعادة الملف.',
    oneRestored: name => `أُعيد «${name}» إلى موقعه الأصلي.`,
    oneToDownloads: name => `تعذّرت إعادة «${name}» إلى موقعه الأصلي لأن المجلد لم يعد موجوداً، فنُقل إلى التنزيلات بدلاً من ذلك.`,
    nRestored: n => ar(n, 'أُعيد ملف واحد إلى موقعه الأصلي.', 'أُعيد ملفان إلى موقعيهما الأصليين.', `أُعيدت ${n} ملفات إلى مواقعها الأصلية.`, `أُعيد ${n} ملفاً إلى مواقعها الأصلية.`),
    nToDownloads: n => ar(n, 'أُعيد ملف واحد إلى التنزيلات لأن مجلده الأصلي لم يعد موجوداً.', 'أُعيد ملفان إلى التنزيلات لأن مجلديهما الأصليين لم يعودا موجودين.', `أُعيدت ${n} ملفات إلى التنزيلات لأن مجلداتها الأصلية لم تعد موجودة.`, `أُعيد ${n} ملفاً إلى التنزيلات لأن مجلداتها الأصلية لم تعد موجودة.`),
    nMovedToDownloads: n => ar(n, 'ونُقل ملف واحد إلى التنزيلات لأن مجلده الأصلي لم يعد موجوداً.', 'ونُقل ملفان إلى التنزيلات لأن مجلديهما الأصليين لم يعودا موجودين.', `ونُقلت ${n} ملفات إلى التنزيلات لأن مجلداتها الأصلية لم تعد موجودة.`, `ونُقل ${n} ملفاً إلى التنزيلات لأن مجلداتها الأصلية لم تعد موجودة.`),
    expires: d => d <= 0 ? 'يُحذف قريباً' : d === 1 ? 'يُحذف غداً' : `يُحذف بعد ${ar(d, 'يوم', 'يومين', `${d} أيام`, `${d} يوماً`)}`,
  },
  hi: {
    title: 'हाल ही में हटाई गई', empty: 'ट्रैश खाली है',
    emptySub: 'हटाई गई फ़ाइलें हमेशा के लिए हटने से पहले 30 दिन तक यहाँ रहती हैं।',
    countLine: n => `${n} ${n === 1 ? 'फ़ाइल' : 'फ़ाइलें'} · 30 दिन तक रखी जाती हैं`,
    restore: 'रीस्टोर करें', restoring: 'रीस्टोर हो रहा है...', restoringOf: (d, t) => `${t} में से ${d} रीस्टोर हो रही ${d === 1 ? 'है' : 'हैं'}...`,
    deletePermanently: 'हमेशा के लिए हटाएँ', deleteForever: name => `"${name}" को हमेशा के लिए हटाएँ? इसे वापस नहीं किया जा सकता।`,
    emptyTrash: 'ट्रैश खाली करें',
    emptyMsg: n => n === 1 ? 'इस फ़ाइल को हमेशा के लिए हटाएँ? इसे वापस नहीं किया जा सकता।' : `${n} फ़ाइलें हमेशा के लिए हटाएँ? इसे वापस नहीं किया जा सकता।`,
    restored: 'रीस्टोर हो गया', restoredToDownloads: 'डाउनलोड में रीस्टोर हुआ', couldNotRestore: 'फ़ाइल रीस्टोर नहीं हो सकी।',
    oneRestored: name => `"${name}" अपनी मूल जगह पर रीस्टोर हो गई।`,
    oneToDownloads: name => `"${name}" अपनी मूल जगह पर रीस्टोर नहीं हो सकी, क्योंकि वह फ़ोल्डर अब मौजूद नहीं है। इसे डाउनलोड में भेज दिया गया है।`,
    nRestored: n => n === 1 ? '1 फ़ाइल अपनी मूल जगह पर रीस्टोर हुई।' : `${n} फ़ाइलें अपनी मूल जगह पर रीस्टोर हुईं।`,
    nToDownloads: n => n === 1 ? 'मूल फ़ोल्डर मौजूद नहीं है, इसलिए 1 फ़ाइल डाउनलोड में रीस्टोर हुई।' : `मूल फ़ोल्डर मौजूद नहीं हैं, इसलिए ${n} फ़ाइलें डाउनलोड में रीस्टोर हुईं।`,
    nMovedToDownloads: n => n === 1 ? '1 फ़ाइल डाउनलोड में भेजी गई, क्योंकि उसका मूल फ़ोल्डर अब मौजूद नहीं है।' : `${n} फ़ाइलें डाउनलोड में भेजी गईं, क्योंकि उनके मूल फ़ोल्डर अब मौजूद नहीं हैं।`,
    expires: d => d <= 0 ? 'जल्द हट जाएगी' : d === 1 ? 'कल हट जाएगी' : `${d} दिन में हट जाएगी`,
  },
};

export function trashText(lang: AppLang): TrashText {
  return TEXT[lang];
}
