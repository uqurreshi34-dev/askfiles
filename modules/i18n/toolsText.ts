/**
 * Large Files screen.
 *
 * Counts: Arabic has 1, 2 (dual), 3-10 and 11+; Hindi verb/noun changes for 1 versus more.
 */
import { AppLang } from '../appLanguage';

const ar = (n: number, one: string, two: string, few: string, many: string) =>
  n === 1 ? one : n === 2 ? two : n >= 3 && n <= 10 ? few : many;

export type ToolsText = {
  startScan: string; scanning: string; mayTakeMoment: string; looksClean: string;
  // Large Files
  largeTitle: string; findLarge: string; findLargeSub: string; over75: string;
  largeFilesLabel: (n: number) => string; totalSize: string; scanAgain: string; noLarge: string;
};

const TEXT: Record<AppLang, ToolsText> = {
  en: {
    startScan: 'Start Scan', scanning: 'Scanning your storage...', mayTakeMoment: 'This may take a moment',
    looksClean: 'Your storage looks clean.',
    largeTitle: 'Large Files', findLarge: 'Find large files',
    findLargeSub: 'Scans your storage for files over 25 MB, sorted by size.', over75: 'Over 75 MB',
    largeFilesLabel: () => 'large files', totalSize: 'total size', scanAgain: 'Scan again', noLarge: 'No large files found!',
  },
  ar: {
    startScan: 'ابدأ الفحص', scanning: 'جارٍ فحص مساحة التخزين...', mayTakeMoment: 'قد يستغرق ذلك لحظة',
    looksClean: 'مساحة التخزين لديك تبدو نظيفة.',
    largeTitle: 'الملفات الكبيرة', findLarge: 'ابحث عن الملفات الكبيرة',
    findLargeSub: 'يفحص مساحة التخزين بحثاً عن الملفات التي تزيد على 25 MB، مرتبة حسب الحجم.', over75: 'أكثر من 75 MB',
    largeFilesLabel: n => ar(n, 'ملف كبير', 'ملفان كبيران', 'ملفات كبيرة', 'ملفاً كبيراً'),
    totalSize: 'الحجم الإجمالي', scanAgain: 'افحص مرة أخرى', noLarge: 'لم يُعثر على ملفات كبيرة!',
  },
  hi: {
    startScan: 'स्कैन शुरू करें', scanning: 'आपका स्टोरेज स्कैन हो रहा है...', mayTakeMoment: 'इसमें थोड़ा समय लग सकता है',
    looksClean: 'आपका स्टोरेज साफ़ दिख रहा है।',
    largeTitle: 'बड़ी फ़ाइलें', findLarge: 'बड़ी फ़ाइलें ढूँढें',
    findLargeSub: 'आपके स्टोरेज में 25 MB से बड़ी फ़ाइलें ढूँढता है और साइज़ के हिसाब से दिखाता है।', over75: '75 MB से ज़्यादा',
    largeFilesLabel: n => n === 1 ? 'बड़ी फ़ाइल' : 'बड़ी फ़ाइलें',
    totalSize: 'कुल साइज़', scanAgain: 'फिर से स्कैन करें', noLarge: 'कोई बड़ी फ़ाइल नहीं मिली!',
  },
};

export function toolsText(lang: AppLang): ToolsText {
  return TEXT[lang];
}
