/**
 * Dual Pane screen and its file panes. Shared words (Cancel, Replace, Skip
 * existing, folder errors) come from common.ts and files.ts.
 *
 * Counts: Arabic has 1, 2 (dual), 3-10 and 11+; Hindi verb changes for 1 versus more.
 */
import { AppLang } from '../appLanguage';

const ar = (n: number, one: string, two: string, few: string, many: string) =>
  n === 1 ? one : n === 2 ? two : n >= 3 && n <= 10 ? few : many;
const arItems = (n: number) => ar(n, 'عنصر واحد', 'عنصرين', `${n} عناصر`, `${n} عنصراً`);

export type DualText = {
  title: string; deselect: string; move: string; moveFiles: string;
  moveNTo: (n: number, dest: string) => string;
  copyingN: (n: number) => string; movingN: (n: number) => string;
  selectedTo: (n: number) => string;
  storage: string; folder: string; empty: string; items: (n: number) => string;
  filterPh: string; noMatches: string; emptyFolder: string;
};

const TEXT: Record<AppLang, DualText> = {
  en: {
    title: 'Dual Pane', deselect: 'Deselect', move: 'Move', moveFiles: 'Move files',
    moveNTo: (n, dest) => `Move ${n} item${n !== 1 ? 's' : ''} to ${dest}?`,
    copyingN: n => `Copying ${n} item${n !== 1 ? 's' : ''}...`,
    movingN: n => `Moving ${n} item${n !== 1 ? 's' : ''}...`,
    selectedTo: n => `${n} item${n !== 1 ? 's' : ''} selected`,
    storage: 'Storage', folder: 'Folder', empty: 'Empty', items: n => `${n} item${n !== 1 ? 's' : ''}`,
    filterPh: 'Filter...', noMatches: 'No matches', emptyFolder: 'Empty folder',
  },
  ar: {
    title: 'العرض المزدوج', deselect: 'إلغاء التحديد', move: 'نقل', moveFiles: 'نقل الملفات',
    moveNTo: (n, dest) => `نقل ${arItems(n)} إلى ${dest}؟`,
    copyingN: n => `جارٍ نسخ ${arItems(n)}...`,
    movingN: n => `جارٍ نقل ${arItems(n)}...`,
    selectedTo: n => ar(n, 'تم تحديد عنصر واحد', 'تم تحديد عنصرين', `تم تحديد ${n} عناصر`, `تم تحديد ${n} عنصراً`),
    storage: 'التخزين', folder: 'مجلد', empty: 'فارغ',
    items: n => ar(n, 'عنصر واحد', 'عنصران', `${n} عناصر`, `${n} عنصراً`),
    filterPh: 'تصفية...', noMatches: 'لا توجد نتائج', emptyFolder: 'مجلد فارغ',
  },
  hi: {
    title: 'डुअल पेन', deselect: 'चयन हटाएँ', move: 'मूव करें', moveFiles: 'फ़ाइलें मूव करें',
    moveNTo: (n, dest) => `${n} आइटम ${dest} में मूव करें?`,
    copyingN: n => n === 1 ? '1 आइटम कॉपी हो रहा है...' : `${n} आइटम कॉपी हो रहे हैं...`,
    movingN: n => n === 1 ? '1 आइटम मूव हो रहा है...' : `${n} आइटम मूव हो रहे हैं...`,
    selectedTo: n => n === 1 ? '1 आइटम चुना गया' : `${n} आइटम चुने गए`,
    storage: 'स्टोरेज', folder: 'फ़ोल्डर', empty: 'खाली', items: n => `${n} आइटम`,
    filterPh: 'फ़िल्टर...', noMatches: 'कुछ नहीं मिला', emptyFolder: 'खाली फ़ोल्डर',
  },
};

export function dualText(lang: AppLang): DualText {
  return TEXT[lang];
}
