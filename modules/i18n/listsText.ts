/**
 * Favourites and tag lists (both use FileListViewer).
 *
 * Counts: Arabic has 1, 2 (dual), 3-10 and 11+; Hindi noun changes for 1 versus more.
 */
import { AppLang } from '../appLanguage';

const ar = (n: number, one: string, two: string, few: string, many: string) =>
  n === 1 ? one : n === 2 ? two : n >= 3 && n <= 10 ? few : many;

export type ListsText = {
  remove: string; calculating: string; fileType: (ext: string) => string;
  favTitle: string; favEmpty: string; favEmptySub: string; favCount: (n: number) => string;
  removeFav: string; removeFavMsg: (name: string) => string;
  tagFallback: string; tagEmpty: string; tagEmptySub: (tag: string) => string; fileCount: (n: number) => string;
  removeTag: string; removeTagLabel: (tag: string) => string; removeTagMsg: (tag: string, name: string) => string;
};

const TEXT: Record<AppLang, ListsText> = {
  en: {
    remove: 'Remove', calculating: 'Calculating...', fileType: ext => `${ext} file`,
    favTitle: 'Favourites', favEmpty: 'No favourites yet', favEmptySub: 'Long press any file and tap "Add to Favourites"',
    favCount: n => `${n} favourite${n !== 1 ? 's' : ''}`,
    removeFav: 'Remove from Favourites', removeFavMsg: name => `Remove "${name}"?`,
    tagFallback: 'Tag', tagEmpty: 'No files tagged yet',
    tagEmptySub: tag => `Tag files with "${tag}" from the file long-press menu in Browse or Categories.`,
    fileCount: n => `${n} file${n !== 1 ? 's' : ''}`,
    removeTag: 'Remove tag', removeTagLabel: tag => `Remove "${tag}" tag`,
    removeTagMsg: (tag, name) => `Remove the "${tag}" tag from "${name}"?`,
  },
  ar: {
    remove: 'إزالة', calculating: 'جارٍ الحساب...', fileType: ext => `ملف ${ext}`,
    favTitle: 'المفضلة', favEmpty: 'لا توجد ملفات مفضلة بعد', favEmptySub: 'اضغط مطولاً على أي ملف ثم اختر «إضافة إلى المفضلة»',
    favCount: n => ar(n, 'ملف مفضّل واحد', 'ملفان مفضّلان', `${n} ملفات مفضّلة`, `${n} ملفاً مفضّلاً`),
    removeFav: 'إزالة من المفضلة', removeFavMsg: name => `إزالة «${name}»؟`,
    tagFallback: 'وسم', tagEmpty: 'لا توجد ملفات موسومة بعد',
    tagEmptySub: tag => `ضع الوسم «${tag}» على الملفات من قائمة الضغط المطوّل على الملف في التصفح أو الفئات.`,
    fileCount: n => ar(n, 'ملف واحد', 'ملفان', `${n} ملفات`, `${n} ملفاً`),
    removeTag: 'إزالة الوسم', removeTagLabel: tag => `إزالة الوسم «${tag}»`,
    removeTagMsg: (tag, name) => `إزالة الوسم «${tag}» من «${name}»؟`,
  },
  hi: {
    remove: 'हटाएँ', calculating: 'हिसाब लगाया जा रहा है...', fileType: ext => `${ext} फ़ाइल`,
    favTitle: 'पसंदीदा', favEmpty: 'अभी कोई पसंदीदा फ़ाइल नहीं', favEmptySub: 'किसी भी फ़ाइल को देर तक दबाएँ और "पसंदीदा में जोड़ें" पर टैप करें',
    favCount: n => `${n} पसंदीदा ${n === 1 ? 'फ़ाइल' : 'फ़ाइलें'}`,
    removeFav: 'पसंदीदा से हटाएँ', removeFavMsg: name => `"${name}" हटाएँ?`,
    tagFallback: 'टैग', tagEmpty: 'अभी कोई फ़ाइल टैग नहीं की गई',
    tagEmptySub: tag => `ब्राउज़ या कैटेगरी में फ़ाइल को देर तक दबाकर खुलने वाले मेन्यू से फ़ाइलों पर "${tag}" टैग लगाएँ।`,
    fileCount: n => `${n} ${n === 1 ? 'फ़ाइल' : 'फ़ाइलें'}`,
    removeTag: 'टैग हटाएँ', removeTagLabel: tag => `"${tag}" टैग हटाएँ`,
    removeTagMsg: (tag, name) => `"${name}" से "${tag}" टैग हटाएँ?`,
  },
};

export function listsText(lang: AppLang): ListsText {
  return TEXT[lang];
}
