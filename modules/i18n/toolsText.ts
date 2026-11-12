/**
 * Large Files and Sensitive Files screens.
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
  // Sensitive Files
  sensTitle: string; findSens: string; findSensSub: string; rescan: string;
  noSens: string; noSensBang: string; sensFound: (n: number) => string; considerVault: string;
  move: string; vaultMsg: (name: string) => string; couldNotVault: string;
};

const TEXT: Record<AppLang, ToolsText> = {
  en: {
    startScan: 'Start Scan', scanning: 'Scanning your storage...', mayTakeMoment: 'This may take a moment',
    looksClean: 'Your storage looks clean.',
    largeTitle: 'Large Files', findLarge: 'Find large files',
    findLargeSub: 'Scans your storage for files over 25 MB, sorted by size.', over75: 'Over 75 MB',
    largeFilesLabel: () => 'large files', totalSize: 'total size', scanAgain: 'Scan again', noLarge: 'No large files found!',
    sensTitle: 'Sensitive Files', findSens: 'Find sensitive files',
    findSensSub: 'Scans for files with names suggesting sensitive content — passwords, bank statements, IDs, CVs and more. Move them to your Secure Vault.',
    rescan: 'Rescan', noSens: 'No sensitive files found', noSensBang: 'No sensitive files found!',
    sensFound: n => `${n} sensitive file${n !== 1 ? 's' : ''} found`,
    considerVault: 'Consider moving these to your Secure Vault.',
    move: 'Move', vaultMsg: name => `Move "${name}" to your Secure Vault?`, couldNotVault: 'Could not move file to Vault.',
  },
  ar: {
    startScan: 'ابدأ الفحص', scanning: 'جارٍ فحص مساحة التخزين...', mayTakeMoment: 'قد يستغرق ذلك لحظة',
    looksClean: 'مساحة التخزين لديك تبدو نظيفة.',
    largeTitle: 'الملفات الكبيرة', findLarge: 'ابحث عن الملفات الكبيرة',
    findLargeSub: 'يفحص مساحة التخزين بحثاً عن الملفات التي تزيد على 25 MB، مرتبة حسب الحجم.', over75: 'أكثر من 75 MB',
    largeFilesLabel: n => ar(n, 'ملف كبير', 'ملفان كبيران', 'ملفات كبيرة', 'ملفاً كبيراً'),
    totalSize: 'الحجم الإجمالي', scanAgain: 'افحص مرة أخرى', noLarge: 'لم يُعثر على ملفات كبيرة!',
    sensTitle: 'الملفات الحساسة', findSens: 'ابحث عن الملفات الحساسة',
    findSensSub: 'يبحث عن الملفات التي توحي أسماؤها بمحتوى حساس — كلمات المرور وكشوف الحسابات البنكية والهويات والسير الذاتية وغيرها. انقلها إلى خزنتك الآمنة.',
    rescan: 'أعد الفحص', noSens: 'لم يُعثر على ملفات حساسة', noSensBang: 'لم يُعثر على ملفات حساسة!',
    sensFound: n => ar(n, 'عُثر على ملف حساس واحد', 'عُثر على ملفين حساسين', `عُثر على ${n} ملفات حساسة`, `عُثر على ${n} ملفاً حساساً`),
    considerVault: 'يُستحسن نقلها إلى خزنتك الآمنة.',
    move: 'نقل', vaultMsg: name => `نقل «${name}» إلى خزنتك الآمنة؟`, couldNotVault: 'تعذّر نقل الملف إلى الخزنة.',
  },
  hi: {
    startScan: 'स्कैन शुरू करें', scanning: 'आपका स्टोरेज स्कैन हो रहा है...', mayTakeMoment: 'इसमें थोड़ा समय लग सकता है',
    looksClean: 'आपका स्टोरेज साफ़ दिख रहा है।',
    largeTitle: 'बड़ी फ़ाइलें', findLarge: 'बड़ी फ़ाइलें ढूँढें',
    findLargeSub: 'आपके स्टोरेज में 25 MB से बड़ी फ़ाइलें ढूँढता है और साइज़ के हिसाब से दिखाता है।', over75: '75 MB से ज़्यादा',
    largeFilesLabel: n => n === 1 ? 'बड़ी फ़ाइल' : 'बड़ी फ़ाइलें',
    totalSize: 'कुल साइज़', scanAgain: 'फिर से स्कैन करें', noLarge: 'कोई बड़ी फ़ाइल नहीं मिली!',
    sensTitle: 'संवेदनशील फ़ाइलें', findSens: 'संवेदनशील फ़ाइलें ढूँढें',
    findSensSub: 'ऐसी फ़ाइलें ढूँढता है जिनके नाम से संवेदनशील जानकारी का पता चलता है — पासवर्ड, बैंक स्टेटमेंट, ID, CV वगैरह। इन्हें अपने सुरक्षित Vault में मूव करें।',
    rescan: 'फिर से स्कैन करें', noSens: 'कोई संवेदनशील फ़ाइल नहीं मिली', noSensBang: 'कोई संवेदनशील फ़ाइल नहीं मिली!',
    sensFound: n => n === 1 ? '1 संवेदनशील फ़ाइल मिली' : `${n} संवेदनशील फ़ाइलें मिलीं`,
    considerVault: 'इन्हें अपने सुरक्षित Vault में मूव करने पर विचार करें।',
    move: 'मूव करें', vaultMsg: name => `"${name}" को अपने सुरक्षित Vault में मूव करें?`, couldNotVault: 'फ़ाइल Vault में मूव नहीं हो सकी।',
  },
};

export function toolsText(lang: AppLang): ToolsText {
  return TEXT[lang];
}
