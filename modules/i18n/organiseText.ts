/**
 * Folder organiser words: the sparkle button in Browse, its plan, and undo.
 * Folder names it creates (Documents, Images...) are real folders on disk
 * and are never translated.
 */
import { AppLang, getLanguage } from '../appLanguage';
import { arCount as A } from './common';

const s = (n: number) => (n !== 1 ? 's' : '');
const H = (n: number, one: string, many: string) => (n === 1 ? one : many);

export type OrganiseText = {
  title: string; organise: string; undo: string; dismiss: string; proceed: string;
  noChanges: string; alreadyOrganised: string; protectedFolder: string;
  couldNotFinish: string; couldNotOrganise: string;
  intoFolder: (n: number, folder: string) => string;
  create: (folders: string) => string;
  movedN: (n: number) => string; noneMoved: string;
  createdN: (n: number) => string; skippedN: (n: number) => string;
  prepFailedN: (n: number) => string; failedN: (n: number) => string;
  // Plan summary
  toFolder: (n: number, folder: string) => string;
  and: string;
  creatingN: (n: number) => string; reusing: string;
  movingN: (n: number, list: string, folders: string) => string;
  // Undo
  nothingToUndo: string; nothingLeft: string;
  putBack: (n: number) => string; noneBack: string;
  removedEmpty: (n: number) => string; leftAlone: (n: number) => string;
  couldNotMoveBack: (n: number) => string;
};

const TEXT: Record<AppLang, OrganiseText> = {
  en: {
    title: 'JARVIS organisation', organise: 'Organise', undo: 'Undo', dismiss: 'Dismiss', proceed: 'Proceed?',
    noChanges: 'No changes proposed.', alreadyOrganised: 'This folder is already organised.',
    protectedFolder: 'This is a standard Android folder, so I will leave its structure intact.',
    couldNotFinish: 'I could not finish organising this folder.', couldNotOrganise: 'I could not organise this folder.',
    intoFolder: (n, f) => `${n} into ${f}`,
    create: f => `Create: ${f}`,
    movedN: n => `Moved ${n} item${s(n)}.`, noneMoved: 'No items moved.',
    createdN: n => `Created ${n} folder${s(n)}.`, skippedN: n => `Skipped ${n}.`,
    prepFailedN: n => `Could not prepare ${n} destination folder${s(n)}.`, failedN: n => `Failed ${n}.`,
    toFolder: (n, f) => `${n} to ${f}`,
    and: 'and',
    creatingN: n => `, creating ${n} folder${s(n)}`, reusing: ', reusing the folders already here',
    movingN: (n, list, folders) => `Moving ${n} file${s(n)}: ${list}${folders}.`,
    nothingToUndo: 'There is nothing to undo.', nothingLeft: 'There was nothing left to put back.',
    putBack: n => `Put ${n} file${s(n)} back.`, noneBack: 'No files were put back.',
    removedEmpty: n => `Removed ${n} empty folder${s(n)}.`,
    leftAlone: n => `Left ${n} alone, ${n === 1 ? 'it has' : 'they have'} moved since.`,
    couldNotMoveBack: n => `Could not move ${n} back.`,
  },
  ar: {
    title: 'تنظيم JARVIS', organise: 'تنظيم', undo: 'تراجع', dismiss: 'إغلاق', proceed: 'هل تريد المتابعة؟',
    noChanges: 'لا توجد تغييرات مقترحة.', alreadyOrganised: 'هذا المجلد منظّم بالفعل.',
    protectedFolder: 'هذا مجلد أساسي في Android، لذا سأترك ترتيبه كما هو.',
    couldNotFinish: 'لم أتمكن من إنهاء تنظيم هذا المجلد.', couldNotOrganise: 'لم أتمكن من تنظيم هذا المجلد.',
    intoFolder: (n, f) => `${n} إلى ${f}`,
    create: f => `إنشاء: ${f}`,
    movedN: n => `تم نقل ${n} ${A(n, 'عنصر', 'عناصر')}.`, noneMoved: 'لم يتم نقل أي عنصر.',
    createdN: n => `تم إنشاء ${n} ${A(n, 'مجلد', 'مجلدات')}.`, skippedN: n => `تم تخطي ${n}.`,
    prepFailedN: n => `تعذّر تجهيز ${n} ${A(n, 'مجلد وجهة', 'مجلدات وجهة')}.`, failedN: n => `فشل ${n}.`,
    toFolder: (n, f) => `${n} إلى ${f}`,
    and: 'و',
    creatingN: n => `، مع إنشاء ${n} ${A(n, 'مجلد', 'مجلدات')}`, reusing: '، باستخدام المجلدات الموجودة هنا',
    movingN: (n, list, folders) => `سيتم نقل ${n} ${A(n, 'ملف', 'ملفات')}: ${list}${folders}.`,
    nothingToUndo: 'لا يوجد ما يمكن التراجع عنه.', nothingLeft: 'لم يتبقَّ شيء لإعادته.',
    putBack: n => `تمت إعادة ${n} ${A(n, 'ملف', 'ملفات')} إلى مكانها.`, noneBack: 'لم تتم إعادة أي ملف.',
    removedEmpty: n => `تمت إزالة ${n} ${A(n, 'مجلد فارغ', 'مجلدات فارغة')}.`,
    leftAlone: n => `تم ترك ${n} كما ${n === 1 ? 'هو لأنه نُقل' : 'هي لأنها نُقلت'} منذ ذلك الحين.`,
    couldNotMoveBack: n => `تعذّرت إعادة ${n}.`,
  },
  hi: {
    title: 'JARVIS व्यवस्था', organise: 'व्यवस्थित करें', undo: 'अनडू', dismiss: 'बंद करें', proceed: 'आगे बढ़ें?',
    noChanges: 'कोई बदलाव सुझाया नहीं गया।', alreadyOrganised: 'यह फ़ोल्डर पहले से व्यवस्थित है।',
    protectedFolder: 'यह Android का मानक फ़ोल्डर है, इसलिए मैं इसकी बनावट नहीं बदलूँगा।',
    couldNotFinish: 'मैं इस फ़ोल्डर को पूरी तरह व्यवस्थित नहीं कर सका।', couldNotOrganise: 'मैं इस फ़ोल्डर को व्यवस्थित नहीं कर सका।',
    intoFolder: (n, f) => `${n} → ${f}`,
    create: f => `बनाएँ: ${f}`,
    movedN: n => `${n} ${H(n, 'आइटम', 'आइटम')} मूव किए।`, noneMoved: 'कोई आइटम मूव नहीं हुआ।',
    createdN: n => `${n} फ़ोल्डर ${H(n, 'बनाया', 'बनाए')}।`, skippedN: n => `${n} ${H(n, 'छोड़ा गया', 'छोड़े गए')}।`,
    prepFailedN: n => `${n} डेस्टिनेशन फ़ोल्डर तैयार नहीं हो ${H(n, 'सका', 'सके')}।`, failedN: n => `${n} नहीं हो ${H(n, 'सका', 'सके')}।`,
    toFolder: (n, f) => `${n} → ${f}`,
    and: 'और',
    creatingN: n => `, ${n} फ़ोल्डर बनाकर`, reusing: ', यहाँ पहले से मौजूद फ़ोल्डर इस्तेमाल करके',
    movingN: (n, list, folders) => `${n} ${H(n, 'फ़ाइल', 'फ़ाइलें')} मूव होंगी: ${list}${folders}।`,
    nothingToUndo: 'अनडू करने को कुछ नहीं है।', nothingLeft: 'वापस रखने को कुछ नहीं बचा।',
    putBack: n => `${n} ${H(n, 'फ़ाइल', 'फ़ाइलें')} वापस रखी ${H(n, 'गई', 'गईं')}।`, noneBack: 'कोई फ़ाइल वापस नहीं रखी गई।',
    removedEmpty: n => `${n} खाली फ़ोल्डर हटाए।`,
    leftAlone: n => `${n} को नहीं छुआ, ${n === 1 ? 'वह तब से मूव हो चुकी है' : 'वे तब से मूव हो चुकी हैं'}।`,
    couldNotMoveBack: n => `${n} वापस नहीं रखी जा ${H(n, 'सकी', 'सकीं')}।`,
  },
};

export function organiseText(lang: AppLang = getLanguage()): OrganiseText { return TEXT[lang]; }
