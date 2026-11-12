/**
 * Cloud Backup screen words. Provider names (Google Drive, OneDrive,
 * Dropbox) and the "AskFiles" folder name are names and stay as they are.
 *
 * Counts: Hindi verb changes for 1 versus more; Arabic has 1, 2 (dual,
 * without the number), 3-10 and 11+.
 */
import { AppLang } from '../appLanguage';

const ar4 = (n: number, one: string, two: string, few: string, many: string) =>
  n === 1 ? one : n === 2 ? two : n >= 3 && n <= 10 ? `${n} ${few}` : `${n} ${many}`;

export type BackupText = {
  cloudBackup: string; whatsBackedUp: string; vaultFiles: string; vaultFilesDesc: string;
  tagsFavPinned: string; tagsDesc: string;
  connected: string; notConnected: string; disconnect: string; connect: string;
  uploadingWait: string; nUploaded: (cur: number, total: number) => string;
  restoringWait: string; nRestored: (cur: number, total: number) => string;
  lastBackup: (when: string) => string; noBackupYet: (provider: string) => string;
  backingUp: string; backUpTo: (provider: string) => string;
  restoring: string; restoreFrom: (provider: string) => string;
  fileLocation: string; folderOn: (provider: string) => string; onlyYou: string;
  connectHint: (account: 'Google' | 'Microsoft' | 'Dropbox') => string;
  backupComplete: string;
  backedUpFiles: (provider: string) => string; backedUpSettings: (provider: string) => string; backedUpAll: (provider: string) => string;
  chooseBackup: string; chooseWhat: string; whatBackup: string; filesOnly: string; settingsOnly: string; backUpEverything: string;
  restoreFailed: string; settingsRestored: string; settingsRestoredMsg: string;
  restoreComplete: string; restoredToVault: (n: number, withSettings: boolean) => string;
  nothingToRestore: string; allInVault: string; allProviderInVault: (provider: string) => string;
  chooseRestore: string; whatRestore: string; restoreEverything: string;
  disconnectTitle: (provider: string) => string; disconnectMsg: (provider: string) => string;
  /** The cloud hooks report errors in English; this says them in the app's language. */
  error: (english: string) => string;
};

const EN: BackupText = {
  cloudBackup: 'Cloud Backup', whatsBackedUp: "What's backed up", vaultFiles: 'Vault files',
  vaultFilesDesc: 'Your files are stored privately in each cloud provider',
  tagsFavPinned: 'Tags, favourites & pinned folders', tagsDesc: 'Back up after making changes to keep them in sync across devices',
  connected: 'Connected', notConnected: 'Not connected', disconnect: 'Disconnect', connect: 'Connect',
  uploadingWait: 'Uploading — please wait: ', nUploaded: (c, t) => `${c}/${t} files uploaded`,
  restoringWait: 'Restoring — please wait: ', nRestored: (c, t) => `${c}/${t} files restored`,
  lastBackup: w => `Last backup: ${w}`, noBackupYet: p => `No ${p} backup yet`,
  backingUp: 'Backing up...', backUpTo: p => `Back Up to ${p}`,
  restoring: 'Restoring...', restoreFrom: p => `Restore from ${p}`,
  fileLocation: 'File location:', folderOn: p => ` "AskFiles" folder on your ${p}.`, onlyYou: 'Only you can see these files.',
  connectHint: a => `Connect your ${a} account to back up and restore your vault files.`,
  backupComplete: 'Backup complete',
  backedUpFiles: p => `Your vault files have been backed up to ${p}.`,
  backedUpSettings: p => `Your tags, favourites, pinned folders and appearance have been backed up to ${p}.`,
  backedUpAll: p => `Your vault and settings have been backed up to ${p}.`,
  chooseBackup: 'Choose what to back up.', chooseWhat: 'Choose what...', whatBackup: 'What would you like to back up?',
  filesOnly: 'Files Only', settingsOnly: 'Settings Only', backUpEverything: 'Back Up Everything',
  restoreFailed: 'Restore failed', settingsRestored: 'Settings restored',
  settingsRestoredMsg: 'Your tags, favourites, pinned folders and appearance have been restored.',
  restoreComplete: 'Restore complete',
  restoredToVault: (n, all) => `${n} file${n !== 1 ? 's' : ''} restored to your vault${all ? ' and settings applied' : ''}.`,
  nothingToRestore: 'Nothing to restore', allInVault: 'All backed-up files are already in your vault.',
  allProviderInVault: p => `All ${p} backup files are already in your vault.`,
  chooseRestore: 'Choose what to restore. Files already in your vault will be skipped.',
  whatRestore: 'What would you like to restore?', restoreEverything: 'Restore Everything',
  disconnectTitle: p => `Disconnect ${p}`,
  disconnectMsg: p => `This removes access to ${p} from AskFiles. Your backed-up files will remain on ${p}.`,
  error: e => e,
};

// English error -> words, with the provider name kept as it is.
function errorFrom(e: string, w: {
  signIn: (p: string) => string; notConnected: (p: string) => string; noFolder: string; noFiles: string;
  full: (p: string) => string; connection: string; noBackup: string; restoreConnection: string;
}): string {
  let m: RegExpMatchArray | null;
  if ((m = e.match(/^(Google|Microsoft|Dropbox) sign-in failed\. Try again\.$/))) return w.signIn(m[1]);
  if ((m = e.match(/^Not connected to (.+)\.$/))) return w.notConnected(m[1]);
  if (e === 'Could not create Drive folder.') return w.noFolder;
  if (e === 'No files in vault to back up.') return w.noFiles;
  if ((m = e.match(/^Backup failed\. Your (.+) storage may be full\. Check your available space and try again\.$/))) return w.full(m[1]);
  if (e === 'Backup failed. Check your connection and try again.') return w.connection;
  if (e === 'No backup found.') return w.noBackup;
  if (e === 'Restore failed. Check your connection and try again.') return w.restoreConnection;
  return e;
}

const AR: BackupText = {
  cloudBackup: 'النسخ الاحتياطي السحابي', whatsBackedUp: 'ما الذي يُنسخ احتياطياً', vaultFiles: 'ملفات الخزنة',
  vaultFilesDesc: 'تُحفظ ملفاتك بشكل خاص لدى كل مزوّد سحابي',
  tagsFavPinned: 'الوسوم والمفضلة والمجلدات المثبتة', tagsDesc: 'انسخها احتياطياً بعد أي تغيير لتبقى متزامنة بين أجهزتك',
  connected: 'متصل', notConnected: 'غير متصل', disconnect: 'قطع الاتصال', connect: 'اتصال',
  uploadingWait: 'جارٍ الرفع — يرجى الانتظار: ', nUploaded: (c, t) => `تم رفع ${c} من ${t}`,
  restoringWait: 'جارٍ الاستعادة — يرجى الانتظار: ', nRestored: (c, t) => `تمت استعادة ${c} من ${t}`,
  lastBackup: w => `آخر نسخة احتياطية: ${w}`, noBackupYet: p => `لا توجد نسخة احتياطية على ${p} بعد`,
  backingUp: 'جارٍ النسخ الاحتياطي...', backUpTo: p => `نسخ احتياطي إلى ${p}`,
  restoring: 'جارٍ الاستعادة...', restoreFrom: p => `استعادة من ${p}`,
  fileLocation: 'مكان الملفات:', folderOn: p => ` مجلد «AskFiles» على ${p}.`, onlyYou: 'أنت وحدك من يمكنه رؤية هذه الملفات.',
  connectHint: a => `اربط حساب ${a} لنسخ ملفات خزنتك احتياطياً واستعادتها.`,
  backupComplete: 'اكتمل النسخ الاحتياطي',
  backedUpFiles: p => `تم نسخ ملفات خزنتك احتياطياً إلى ${p}.`,
  backedUpSettings: p => `تم نسخ الوسوم والمفضلة والمجلدات المثبتة والمظهر احتياطياً إلى ${p}.`,
  backedUpAll: p => `تم نسخ خزنتك وإعداداتك احتياطياً إلى ${p}.`,
  chooseBackup: 'اختر ما تريد نسخه احتياطياً.', chooseWhat: 'اختر...', whatBackup: 'ما الذي تريد نسخه احتياطياً؟',
  filesOnly: 'الملفات فقط', settingsOnly: 'الإعدادات فقط', backUpEverything: 'نسخ كل شيء',
  restoreFailed: 'فشلت الاستعادة', settingsRestored: 'تمت استعادة الإعدادات',
  settingsRestoredMsg: 'تمت استعادة الوسوم والمفضلة والمجلدات المثبتة والمظهر.',
  restoreComplete: 'اكتملت الاستعادة',
  restoredToVault: (n, all) => `تمت استعادة ${ar4(n, 'ملف واحد', 'ملفين', 'ملفات', 'ملفاً')} إلى خزنتك${all ? ' وتطبيق الإعدادات' : ''}.`,
  nothingToRestore: 'لا يوجد ما يُستعاد', allInVault: 'كل الملفات المنسوخة احتياطياً موجودة بالفعل في خزنتك.',
  allProviderInVault: p => `كل ملفات النسخة الاحتياطية على ${p} موجودة بالفعل في خزنتك.`,
  chooseRestore: 'اختر ما تريد استعادته. سيتم تخطي الملفات الموجودة بالفعل في خزنتك.',
  whatRestore: 'ما الذي تريد استعادته؟', restoreEverything: 'استعادة كل شيء',
  disconnectTitle: p => `قطع الاتصال بـ ${p}`,
  disconnectMsg: p => `سيؤدي هذا إلى إزالة وصول AskFiles إلى ${p}. ستبقى ملفاتك المنسوخة احتياطياً على ${p}.`,
  error: e => errorFrom(e, {
    signIn: a => `فشل تسجيل الدخول إلى ${a}. حاول مرة أخرى.`,
    notConnected: p => `غير متصل بـ ${p}.`,
    noFolder: 'تعذّر إنشاء مجلد على Drive.',
    noFiles: 'لا توجد ملفات في الخزنة لنسخها احتياطياً.',
    full: p => `فشل النسخ الاحتياطي. قد تكون مساحة ${p} ممتلئة. تحقّق من المساحة المتاحة وحاول مرة أخرى.`,
    connection: 'فشل النسخ الاحتياطي. تحقّق من اتصالك وحاول مرة أخرى.',
    noBackup: 'لم يُعثر على نسخة احتياطية.',
    restoreConnection: 'فشلت الاستعادة. تحقّق من اتصالك وحاول مرة أخرى.',
  }),
};

const HI: BackupText = {
  cloudBackup: 'क्लाउड बैकअप', whatsBackedUp: 'किसका बैकअप होता है', vaultFiles: 'Vault फ़ाइलें',
  vaultFilesDesc: 'आपकी फ़ाइलें हर क्लाउड प्रोवाइडर में निजी रूप से रखी जाती हैं',
  tagsFavPinned: 'टैग, पसंदीदा और पिन किए गए फ़ोल्डर', tagsDesc: 'बदलाव करने के बाद बैकअप लें ताकि सभी डिवाइस पर ये सिंक रहें',
  connected: 'कनेक्टेड', notConnected: 'कनेक्ट नहीं है', disconnect: 'डिस्कनेक्ट करें', connect: 'कनेक्ट करें',
  uploadingWait: 'अपलोड हो रहा है — कृपया रुकें: ', nUploaded: (c, t) => `${t} में से ${c} फ़ाइलें अपलोड हुईं`,
  restoringWait: 'रीस्टोर हो रहा है — कृपया रुकें: ', nRestored: (c, t) => `${t} में से ${c} फ़ाइलें रीस्टोर हुईं`,
  lastBackup: w => `पिछला बैकअप: ${w}`, noBackupYet: p => `${p} पर अभी तक कोई बैकअप नहीं`,
  backingUp: 'बैकअप हो रहा है...', backUpTo: p => `${p} पर बैकअप लें`,
  restoring: 'रीस्टोर हो रहा है...', restoreFrom: p => `${p} से रीस्टोर करें`,
  fileLocation: 'फ़ाइलों की जगह:', folderOn: p => ` आपके ${p} पर "AskFiles" फ़ोल्डर।`, onlyYou: 'इन फ़ाइलों को केवल आप देख सकते हैं।',
  connectHint: a => `अपनी Vault फ़ाइलों का बैकअप लेने और उन्हें रीस्टोर करने के लिए अपना ${a} अकाउंट कनेक्ट करें।`,
  backupComplete: 'बैकअप पूरा हुआ',
  backedUpFiles: p => `आपकी Vault फ़ाइलों का ${p} पर बैकअप हो गया है।`,
  backedUpSettings: p => `आपके टैग, पसंदीदा, पिन किए गए फ़ोल्डर और थीम का ${p} पर बैकअप हो गया है।`,
  backedUpAll: p => `आपके Vault और सेटिंग्स का ${p} पर बैकअप हो गया है।`,
  chooseBackup: 'चुनें कि किसका बैकअप लेना है।', chooseWhat: 'चुनें...', whatBackup: 'आप किसका बैकअप लेना चाहते हैं?',
  filesOnly: 'केवल फ़ाइलें', settingsOnly: 'केवल सेटिंग्स', backUpEverything: 'सबका बैकअप लें',
  restoreFailed: 'रीस्टोर नहीं हो सका', settingsRestored: 'सेटिंग्स रीस्टोर हो गईं',
  settingsRestoredMsg: 'आपके टैग, पसंदीदा, पिन किए गए फ़ोल्डर और थीम रीस्टोर हो गए हैं।',
  restoreComplete: 'रीस्टोर पूरा हुआ',
  restoredToVault: (n, all) =>
    `${n} ${n === 1 ? 'फ़ाइल आपके Vault में रीस्टोर हुई' : 'फ़ाइलें आपके Vault में रीस्टोर हुईं'}${all ? ' और सेटिंग्स लागू हो गईं' : ''}।`,
  nothingToRestore: 'रीस्टोर करने को कुछ नहीं', allInVault: 'बैकअप की गई सभी फ़ाइलें पहले से आपके Vault में हैं।',
  allProviderInVault: p => `${p} बैकअप की सभी फ़ाइलें पहले से आपके Vault में हैं।`,
  chooseRestore: 'चुनें कि क्या रीस्टोर करना है। जो फ़ाइलें पहले से Vault में हैं, वे छोड़ दी जाएँगी।',
  whatRestore: 'आप क्या रीस्टोर करना चाहते हैं?', restoreEverything: 'सब रीस्टोर करें',
  disconnectTitle: p => `${p} डिस्कनेक्ट करें`,
  disconnectMsg: p => `इससे AskFiles की ${p} तक पहुँच हट जाएगी। आपकी बैकअप फ़ाइलें ${p} पर बनी रहेंगी।`,
  error: e => errorFrom(e, {
    signIn: a => `${a} साइन-इन नहीं हो सका। फिर से कोशिश करें।`,
    notConnected: p => `${p} से कनेक्ट नहीं है।`,
    noFolder: 'Drive पर फ़ोल्डर नहीं बन सका।',
    noFiles: 'बैकअप के लिए Vault में कोई फ़ाइल नहीं है।',
    full: p => `बैकअप नहीं हो सका। हो सकता है आपका ${p} स्टोरेज भर गया हो। उपलब्ध जगह जाँचें और फिर से कोशिश करें।`,
    connection: 'बैकअप नहीं हो सका। अपना कनेक्शन जाँचें और फिर से कोशिश करें।',
    noBackup: 'कोई बैकअप नहीं मिला।',
    restoreConnection: 'रीस्टोर नहीं हो सका। अपना कनेक्शन जाँचें और फिर से कोशिश करें।',
  }),
};

const TEXT: Record<AppLang, BackupText> = { en: EN, ar: AR, hi: HI };

export function backupText(lang: AppLang): BackupText { return TEXT[lang]; }
