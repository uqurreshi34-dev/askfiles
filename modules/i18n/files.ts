/**
 * File screens' words (Browse, Categories, Search): sheet options, sort menu,
 * pop-ups and progress messages, in English, Arabic and Hindi.
 * Generated from one table so every language has every key.
 *
 * In a screen: const f = filesText(useLanguage()).
 */
import { AppLang } from '../appLanguage';
import { arCount } from './common';

const s = (n: number) => (n !== 1 ? 's' : '');
const A = arCount;
const H = (n: number, one: string, many: string) => (n === 1 ? one : many);

export type FilesText = {
  noImagesSelected: string;
  selectOneImage: string;
  pdfCreated: string;
  couldNotCreatePdf: string;
  extracted: string;
  couldNotExtractPages: string;
  notEnoughPdfs: string;
  selectTwoPdfs: string;
  merged: string;
  couldNotMergePdfs: string;
  mixedSelection: string;
  mergePdfs: string;
  couldNotExtractText: string;
  noWifi: string;
  connectWifi: string;
  couldNotStartWifi: string;
  copied: string;
  imageCopied: string;
  couldNotCopyImage: string;
  textCopied: string;
  removed: string;
  added: string;
  printFailed: string;
  couldNotPrint: string;
  couldNotSummarise: string;
  nameTaken: string;
  hideFolder: string;
  hideFile: string;
  hide: string;
  unhide: string;
  moveToVault: string;
  alreadyInVault: string;
  movedToVault: string;
  couldNotVault: string;
  folderNotEmpty: string;
  deleteFolder: string;
  deleteFolders: string;
  permissionNeeded: string;
  needFullAccessDelete: string;
  openSettings: string;
  moveToTrash: string;
  couldNotTrash: string;
  incorrectPassword: string;
  wrongPassword: string;
  tryAgain: string;
  couldNotExtract7z: string;
  couldNotExtractZip: string;
  noFilesToZip: string;
  cantZip: string;
  zipped: string;
  couldNotZip: string;
  proVaultMsg: string;
  notNow: string;
  upgrade: string;
  cantVaultFolders: string;
  vaultFilesOnly: string;
  move: string;
  nothingMoved: string;
  renamed: string;
  couldNotRenameFiles: string;
  invalidName: string;
  folderNameChars: string;
  fileNameChars: string;
  alreadyExists: string;
  alreadyExistPlural: string;
  couldNotCreateFolder: string;
  couldNotSaveFile: string;
  couldNotCreateFile: string;
  couldNotOpenForEdit: string;
  success: string;
  renameFailed: string;
  couldNotRenameAccess: string;
  skipExisting: string;
  replace: string;
  nothingToDo: string;
  allSkipped: string;
  folderNotFound: string;
  removeBookmark: string;
  someFoldersSkipped: string;
  couldNotUpdatePins: string;
  unknown: string;
  internalStorage: string;
  storage: string;
  browse: string;
  copyTo: string;
  copyHere: string;
  copying: string;
  moving: string;
  folder: string;
  folderInfo: string;
  location: string;
  timesOpened: string;
  lastOpened: string;
  nameAZ: string;
  nameZA: string;
  dateNewest: string;
  dateOldest: string;
  sizeLargest: string;
  sizeSmallest: string;
  save: string;
  create: string;
  deletingFolder: string;
  analysingVideo: string;
  bookmarks: string;
  chooseLocation: string;
  copyText: string;
  copyImage: string;
  copy: string;
  createNew: string;
  createPdf: string;
  createZip: string;
  detected: string;
  editImage: string;
  edit: string;
  micAccess: string;
  extractText: string;
  extractPages: string;
  extract: string;
  extractedText: string;
  leaveBlankPw: string;
  more: string;
  multiRename: string;
  newFolder: string;
  newTextFile: string;
  noTextFound: string;
  zipOptional: string;
  preparingShare: string;
  print: string;
  processing: string;
  protectPw: string;
  readingText: string;
  rename: string;
  renamingFiles: string;
  scanSameWifi: string;
  selectAll: string;
  shareViaQr: string;
  showHidden: string;
  sortBy: string;
  vault: string;
  videoSummary: string;
  zip: string;
  addTag: string;
  addToFavourites: string;
  removeFromFavourites: string;
  bookmarkFolder: string;
  pinToHome: string;
  unpinFromHome: string;
  extractZip: string;
  extract7z: string;
  baseNamePh: string;
  enterPasswordPh: string;
  fileNamePh: string;
  folderNamePh: string;
  newNamePh: string;
  rootOfInternal: string;
  saveRenamed: string;
  searchFolderPh: string;
  startTypingPh: string;
  tagNamePh: string;
  createApply: string;
  newTag: string;
  tags: string;
  saveHere: string;
  couldNotCreateFolderShort: string;
  defaultSaveLocation: string;
  cannotPlayVideo: string;
  fileCouldNotOpen: string;
  docs: string;
  downloads: string;
  namePlaceholder: string;
  imagesSavedScans: (n: number) => string;
  pagesSaved: (n: number, name: string) => string;
  pdfsMerged: (n: number) => string;
  mixedPdfMsg: (pdfs: number, others: number) => string;
  removedFromFav: (name: string) => string;
  addedToFav: (name: string) => string;
  fileNamedExistsFolder: (name: string) => string;
  couldNotHideMsg: (unhide: boolean) => string;
  hideMsg: (name: string, isFolder: boolean) => string;
  moveOneToVaultMsg: (name: string) => string;
  alreadyInVaultMsg: (name: string) => string;
  isNowSecured: (name: string) => string;
  folderNotEmptyMsg: (name: string, n: number) => string;
  deleteOneMsg: (name: string) => string;
  trashOneMsg: (name: string) => string;
  extractedTo: (folder: string) => string;
  zippedMsg: (name: string, n: number, pw: boolean) => string;
  moveNToVault: (n: number) => string;
  moveNToVaultSkip: (n: number, folders: number) => string;
  nMovedToVault: (n: number) => string;
  nAlreadyInVault: (n: number, names: string, more: number) => string;
  nCouldNotMove: (n: number) => string;
  nSecured: (n: number) => string;
  trashNFiles: (n: number) => string;
  deleteNFolders: (n: number) => string;
  trashAndDelete: (files: number, folders: number) => string;
  foldersSkippedMsg: (n: number, first: string) => string;
  nItemsSelected: (n: number) => string;
  nFiles: (n: number) => string;
  nFolders: (n: number) => string;
  totalSize: (size: string) => string;
  renamedWithFails: (ok: number, failed: number, where: string) => string;
  renamedAs: (ok: number, base: string, where: string) => string;
  folderExistsHere: (name: string) => string;
  fileExistsHere: (name: string) => string;
  existsInFolder: (name: string) => string;
  copiedOk: (name: string) => string;
  movedOk: (name: string) => string;
  couldNotCopyOrMoveFile: (copy: boolean) => string;
  couldNotCopyOrMoveFiles: (copy: boolean) => string;
  dupesExistMsg: (names: string, more: number, total: number) => string;
  multiDoneMsg: (n: number, copy: boolean, skipped: number) => string;
  bookmarkGoneMsg: (name: string) => string;
  movingToTrash: (done: number, total: number) => string;
  copyProgress: (copy: boolean, cur: number, total: number, name: string) => string;
  movingNToTrash: (n: number) => string;
  tagsCount: (n: number) => string;
  pillTitle: (move: boolean, n: number) => string;
  movingNToVault: (n: number) => string;
  creatingPdfProgress: (cur: number, total: number) => string;
  extractingPageProgress: (cur: number, total: number) => string;
  mergingPdfProgress: (cur: number, total: number) => string;
  renameNFiles: (n: number) => string;
  filesWillBeNamed: (base: string) => string;
};

const EN: FilesText = {
  noImagesSelected: 'No images selected',
  selectOneImage: 'Select at least one image to create a PDF.',
  pdfCreated: 'PDF Created',
  couldNotCreatePdf: 'Could not create PDF.',
  extracted: 'Extracted',
  couldNotExtractPages: 'Could not extract PDF pages.',
  notEnoughPdfs: 'Not enough PDFs',
  selectTwoPdfs: 'Select at least 2 PDF files to merge.',
  merged: 'Merged',
  couldNotMergePdfs: 'Could not merge PDFs.',
  mixedSelection: 'Mixed selection',
  mergePdfs: 'Merge PDFs',
  couldNotExtractText: 'Could not extract text from this image.',
  noWifi: 'No Wi-Fi',
  connectWifi: 'Connect to Wi-Fi, or turn on your hotspot, to share files.',
  couldNotStartWifi: 'Could not start WiFi server',
  copied: 'Copied',
  imageCopied: 'Image copied to clipboard.',
  couldNotCopyImage: 'Could not copy image to clipboard.',
  textCopied: 'Text copied to clipboard.',
  removed: 'Removed',
  added: 'Added',
  printFailed: 'Print failed',
  couldNotPrint: 'Could not print this file. Make sure a printer is set up on your device.',
  couldNotSummarise: 'Could not generate video summary.',
  nameTaken: 'Name already taken',
  hideFolder: 'Hide folder',
  hideFile: 'Hide file',
  hide: 'Hide',
  unhide: 'Unhide',
  moveToVault: 'Move to Vault',
  alreadyInVault: 'Already in the Vault',
  movedToVault: 'Moved to Vault',
  couldNotVault: 'Could not move file to Vault. Try again.',
  folderNotEmpty: 'Folder not empty',
  deleteFolder: 'Delete Folder',
  deleteFolders: 'Delete Folders',
  permissionNeeded: 'Permission needed',
  needFullAccessDelete: 'AskFiles needs full storage access to delete folders.',
  openSettings: 'Open Settings',
  moveToTrash: 'Move to Trash',
  couldNotTrash: 'Could not move file to Trash.',
  incorrectPassword: 'Incorrect Password',
  wrongPassword: 'The password you entered is wrong. Please try again.',
  tryAgain: 'Try Again',
  couldNotExtract7z: 'Could not extract this 7z file.',
  couldNotExtractZip: 'Could not extract zip file.',
  noFilesToZip: 'No files to zip',
  cantZip: 'ZIP files and folders cannot be zipped.',
  zipped: 'Zipped',
  couldNotZip: 'Could not create zip file.',
  proVaultMsg: 'Upgrade to AskFiles Pro to move files to the Vault.',
  notNow: 'Not now',
  upgrade: 'Upgrade',
  cantVaultFolders: 'Folders can\'t be vaulted',
  vaultFilesOnly: 'The Vault holds files only. Select at least one file.',
  move: 'Move',
  nothingMoved: 'Nothing moved',
  renamed: 'Renamed',
  couldNotRenameFiles: 'Could not rename files.',
  invalidName: 'Invalid name',
  folderNameChars: 'Folder names cannot contain: * \\ : ? " < > |',
  fileNameChars: 'File names cannot contain: * / \\ : ? " < > |',
  alreadyExists: 'Already exists',
  alreadyExistPlural: 'Already exist',
  couldNotCreateFolder: 'Could not create folder. Check storage permissions.',
  couldNotSaveFile: 'Could not save file.',
  couldNotCreateFile: 'Could not create file.',
  couldNotOpenForEdit: 'Could not open file for editing.',
  success: 'Success',
  renameFailed: 'Rename failed',
  couldNotRenameAccess: 'Could not rename this file. Make sure "All files access" is enabled in Settings.',
  skipExisting: 'Skip existing',
  replace: 'Replace',
  nothingToDo: 'Nothing to do',
  allSkipped: 'All selected files already exist at the destination and were skipped.',
  folderNotFound: 'Folder not found',
  removeBookmark: 'Remove bookmark',
  someFoldersSkipped: 'Some folders skipped',
  couldNotUpdatePins: 'Could not update pinned folders.',
  unknown: 'Unknown',
  internalStorage: 'Internal Storage',
  storage: 'Storage',
  browse: 'Browse',
  copyTo: 'Copy to...',
  copyHere: 'Copy here',
  copying: 'Copying',
  moving: 'Moving',
  folder: 'Folder',
  folderInfo: 'Folder Info',
  location: 'Location',
  timesOpened: 'Times opened',
  lastOpened: 'Last opened',
  nameAZ: 'Name A → Z',
  nameZA: 'Name Z → A',
  dateNewest: 'Date (newest first)',
  dateOldest: 'Date (oldest first)',
  sizeLargest: 'Size (largest first)',
  sizeSmallest: 'Size (smallest first)',
  save: 'Save',
  create: 'Create',
  deletingFolder: 'Deleting folder...',
  analysingVideo: 'Analysing video...',
  bookmarks: 'Bookmarks',
  chooseLocation: 'Choose location',
  copyText: 'Copy Text',
  copyImage: 'Copy image',
  copy: 'Copy',
  createNew: 'Create New',
  createPdf: 'Create PDF',
  createZip: 'Create ZIP',
  detected: 'Detected',
  editImage: 'Edit image',
  edit: 'Edit',
  micAccess: 'Enable microphone access in Settings to use voice dictation',
  extractText: 'Extract Text',
  extractPages: 'Extract pages as images',
  extract: 'Extract',
  extractedText: 'Extracted Text',
  leaveBlankPw: 'Leave blank if not password protected',
  more: 'More',
  multiRename: 'Multi-rename',
  newFolder: 'New Folder',
  newTextFile: 'New Text File',
  noTextFound: 'No text found in this image.',
  zipOptional: 'Optional — leave blank for a standard zip',
  preparingShare: 'Preparing files for sharing...',
  print: 'Print',
  processing: 'Processing...',
  protectPw: 'Protect with Password',
  readingText: 'Reading text...',
  rename: 'Rename',
  renamingFiles: 'Renaming files...',
  scanSameWifi: 'Scan with any device on the same WiFi',
  selectAll: 'Select All',
  shareViaQr: 'Share via QR',
  showHidden: 'Show hidden folders and files',
  sortBy: 'Sort by',
  vault: 'Vault',
  videoSummary: 'Video Summary',
  zip: 'Zip',
  addTag: 'Add Tag',
  addToFavourites: 'Add to Favourites',
  removeFromFavourites: 'Remove from Favourites',
  bookmarkFolder: 'Bookmark folder',
  pinToHome: 'Pin to Home',
  unpinFromHome: 'Unpin from Home',
  extractZip: 'Extract ZIP',
  extract7z: 'Extract 7Z',
  baseNamePh: 'Base name e.g. holiday',
  enterPasswordPh: 'Enter password...',
  fileNamePh: 'File name...',
  folderNamePh: 'Folder name...',
  newNamePh: 'New name...',
  rootOfInternal: 'Root of internal storage',
  saveRenamed: 'Save renamed files',
  searchFolderPh: 'Search in this folder...',
  startTypingPh: 'Start typing...',
  tagNamePh: 'Tag name...',
  createApply: 'Create & Apply',
  newTag: 'New Tag',
  tags: 'Tags',
  saveHere: 'Save here',
  couldNotCreateFolderShort: 'Could not create folder.',
  defaultSaveLocation: 'Default save location',
  cannotPlayVideo: 'Cannot play video',
  fileCouldNotOpen: 'This file could not be opened. It may have been moved or deleted.',
  docs: 'Docs',
  downloads: 'Downloads',
  namePlaceholder: 'name',
  imagesSavedScans: (n: number) => `${n} image${s(n)} saved to Documents/Scans`,
  pagesSaved: (n: number, name: string) => `${n} page${s(n)} saved to Documents/Scans/${name}_pages`,
  pdfsMerged: (n: number) => `${n} PDFs merged successfully. Saved to Documents/Scans.`,
  mixedPdfMsg: (pdfs: number, others: number) => `Only PDF files will be merged. ${pdfs} PDF${s(pdfs)} selected, ${others} file${s(others)} will be skipped. Continue?`,
  removedFromFav: (name: string) => `"${name}" removed from Favourites.`,
  addedToFav: (name: string) => `"${name}" added to Favourites.`,
  fileNamedExistsFolder: (name: string) => `A file named "${name}" already exists in this folder.`,
  couldNotHideMsg: (unhide: boolean) => `Could not ${unhide ? 'unhide' : 'hide'} this file.`,
  hideMsg: (name: string, isFolder: boolean) => `"${name}" will be hidden from your gallery and ${isFolder ? 'folder lists, along with everything inside it' : 'file lists'}. To find it again, turn on "Show hidden folders and files" in the sort menu, then choose Unhide.`,
  moveOneToVaultMsg: (name: string) => `Move "${name}" to your Secure Vault? The original file will be removed from its current location.`,
  alreadyInVaultMsg: (name: string) => `A file called "${name}" is already in the Vault. Rename this one first, or remove the copy that is already there.`,
  isNowSecured: (name: string) => `"${name}" is now secured.`,
  folderNotEmptyMsg: (name: string, n: number) => `"${name}" contains ${n} item${s(n)}. Delete or move all files first, then delete the empty folder.`,
  deleteOneMsg: (name: string) => `Delete "${name}"? This cannot be undone.`,
  trashOneMsg: (name: string) => `"${name}" will be moved to Trash and deleted after 30 days.`,
  extractedTo: (folder: string) => `Files extracted to "${folder}" folder.`,
  zippedMsg: (name: string, n: number, pw: boolean) => `"${name}" created with ${n} file${s(n)}.${pw ? ' Password protected.' : ''}`,
  moveNToVault: (n: number) => `Move ${n} file${s(n)} to your Secure Vault?`,
  moveNToVaultSkip: (n: number, folders: number) => `Move ${n} file${s(n)} to your Secure Vault? ${folders} folder${s(folders)} will be skipped — the Vault holds files only.`,
  nMovedToVault: (n: number) => `${n} file${s(n)} moved to Vault.`,
  nAlreadyInVault: (n: number, names: string, more: number) => `${n} ${n === 1 ? 'is' : 'are'} already in the Vault: ${names}${more > 0 ? ` and ${more} more` : ''}.`,
  nCouldNotMove: (n: number) => `${n} could not be moved.`,
  nSecured: (n: number) => `${n} file${s(n)} secured.`,
  trashNFiles: (n: number) => `Move ${n} file${s(n)} to Trash? Deleted after 30 days.`,
  deleteNFolders: (n: number) => `Delete ${n} folder${s(n)}? This cannot be undone.`,
  trashAndDelete: (files: number, folders: number) => `Move ${files} file${s(files)} to Trash and permanently delete ${folders} folder${s(folders)}? Files can be restored within 30 days.`,
  foldersSkippedMsg: (n: number, first: string) => `${n === 1 ? `"${first}"` : `${n} folders`} could not be deleted because ${n === 1 ? 'it is' : 'they are'} not empty.`,
  nItemsSelected: (n: number) => `${n} item${s(n)} selected`,
  nFiles: (n: number) => `${n} file${s(n)}`,
  nFolders: (n: number) => `${n} folder${s(n)}`,
  totalSize: (size: string) => `Total size: ${size}`,
  renamedWithFails: (ok: number, failed: number, where: string) => `${ok} file${s(ok)} renamed. ${failed} failed.\nSaved to ${where}`,
  renamedAs: (ok: number, base: string, where: string) => `${ok} file${s(ok)} renamed as ${base}_1, ${base}_2...\nSaved to ${where}`,
  folderExistsHere: (name: string) => `A folder named "${name}" already exists here.`,
  fileExistsHere: (name: string) => `A file named "${name}" already exists here.`,
  existsInFolder: (name: string) => `"${name}" already exists in this folder.`,
  copiedOk: (name: string) => `"${name}" copied successfully.`,
  movedOk: (name: string) => `"${name}" moved successfully.`,
  couldNotCopyOrMoveFile: (copy: boolean) => copy ? 'Could not copy file.' : 'Could not move file.',
  couldNotCopyOrMoveFiles: (copy: boolean) => copy ? 'Could not copy files.' : 'Could not move files.',
  dupesExistMsg: (names: string, more: number, total: number) => `${names}${more > 0 ? ` and ${more} more` : ''} already ${total === 1 ? 'exists' : 'exist'} in this folder.`,
  multiDoneMsg: (n: number, copy: boolean, skipped: number) => `${n} item${s(n)} ${copy ? 'copied' : 'moved'} successfully.${skipped > 0 ? ` ${skipped} skipped (duplicate names).` : ''}`,
  bookmarkGoneMsg: (name: string) => `"${name}" couldn't be found. It may have been moved or deleted.`,
  movingToTrash: (done: number, total: number) => `Moving ${done} of ${total} files to Trash...`,
  copyProgress: (copy: boolean, cur: number, total: number, name: string) => `${copy ? 'Copying' : 'Moving'} ${cur} of ${total}: ${name}`,
  movingNToTrash: (n: number) => `Moving ${n} file${s(n)} to Trash...`,
  tagsCount: (n: number) => `Tags (${n})`,
  pillTitle: (move: boolean, n: number) => `${move ? 'Move' : 'Copy'} ${n} item${s(n)} into…`,
  movingNToVault: (n: number) => `Moving ${n} file${s(n)} to Vault...`,
  creatingPdfProgress: (cur: number, total: number) => `Creating PDF... ${cur} of ${total}`,
  extractingPageProgress: (cur: number, total: number) => `Extracting page ${cur} of ${total}...`,
  mergingPdfProgress: (cur: number, total: number) => `Merging PDF ${cur} of ${total}...`,
  renameNFiles: (n: number) => `Rename ${n} file${s(n)}`,
  filesWillBeNamed: (base: string) => `Files will be named: ${base}_1, ${base}_2...`,
};

const AR: FilesText = {
  noImagesSelected: 'لم يتم تحديد صور',
  selectOneImage: 'حدّد صورة واحدة على الأقل لإنشاء ملف PDF.',
  pdfCreated: 'تم إنشاء PDF',
  couldNotCreatePdf: 'تعذّر إنشاء ملف PDF.',
  extracted: 'تم الاستخراج',
  couldNotExtractPages: 'تعذّر استخراج صفحات PDF.',
  notEnoughPdfs: 'ملفات PDF غير كافية',
  selectTwoPdfs: 'حدّد ملفَّي PDF على الأقل للدمج.',
  merged: 'تم الدمج',
  couldNotMergePdfs: 'تعذّر دمج ملفات PDF.',
  mixedSelection: 'تحديد مختلط',
  mergePdfs: 'دمج ملفات PDF',
  couldNotExtractText: 'تعذّر استخراج النص من هذه الصورة.',
  noWifi: 'لا يوجد Wi-Fi',
  connectWifi: 'اتصل بشبكة Wi-Fi أو شغّل نقطة الاتصال لمشاركة الملفات.',
  couldNotStartWifi: 'تعذّر تشغيل خادم WiFi',
  copied: 'تم النسخ',
  imageCopied: 'تم نسخ الصورة إلى الحافظة.',
  couldNotCopyImage: 'تعذّر نسخ الصورة إلى الحافظة.',
  textCopied: 'تم نسخ النص إلى الحافظة.',
  removed: 'تمت الإزالة',
  added: 'تمت الإضافة',
  printFailed: 'فشلت الطباعة',
  couldNotPrint: 'تعذّرت طباعة هذا الملف. تأكد من إعداد طابعة على جهازك.',
  couldNotSummarise: 'تعذّر إنشاء ملخص الفيديو.',
  nameTaken: 'الاسم مستخدم بالفعل',
  hideFolder: 'إخفاء المجلد',
  hideFile: 'إخفاء الملف',
  hide: 'إخفاء',
  unhide: 'إظهار',
  moveToVault: 'نقل إلى الخزنة',
  alreadyInVault: 'موجود بالفعل في الخزنة',
  movedToVault: 'تم النقل إلى الخزنة',
  couldNotVault: 'تعذّر نقل الملف إلى الخزنة. حاول مرة أخرى.',
  folderNotEmpty: 'المجلد ليس فارغاً',
  deleteFolder: 'حذف المجلد',
  deleteFolders: 'حذف المجلدات',
  permissionNeeded: 'مطلوب إذن',
  needFullAccessDelete: 'يحتاج AskFiles إلى الوصول الكامل إلى التخزين لحذف المجلدات.',
  openSettings: 'فتح الإعدادات',
  moveToTrash: 'نقل إلى المهملات',
  couldNotTrash: 'تعذّر نقل الملف إلى المهملات.',
  incorrectPassword: 'كلمة المرور غير صحيحة',
  wrongPassword: 'كلمة المرور التي أدخلتها خاطئة. حاول مرة أخرى.',
  tryAgain: 'حاول مرة أخرى',
  couldNotExtract7z: 'تعذّر استخراج ملف 7z هذا.',
  couldNotExtractZip: 'تعذّر استخراج ملف zip.',
  noFilesToZip: 'لا توجد ملفات للضغط',
  cantZip: 'لا يمكن ضغط ملفات ZIP والمجلدات.',
  zipped: 'تم الضغط',
  couldNotZip: 'تعذّر إنشاء ملف zip.',
  proVaultMsg: 'قم بالترقية إلى AskFiles Pro لنقل الملفات إلى الخزنة.',
  notNow: 'ليس الآن',
  upgrade: 'ترقية',
  cantVaultFolders: 'لا يمكن نقل المجلدات إلى الخزنة',
  vaultFilesOnly: 'الخزنة تحفظ الملفات فقط. حدّد ملفاً واحداً على الأقل.',
  move: 'نقل',
  nothingMoved: 'لم يُنقل شيء',
  renamed: 'تمت إعادة التسمية',
  couldNotRenameFiles: 'تعذّرت إعادة تسمية الملفات.',
  invalidName: 'اسم غير صالح',
  folderNameChars: 'لا يمكن أن تحتوي أسماء المجلدات على: * \\ : ? " < > |',
  fileNameChars: 'لا يمكن أن تحتوي أسماء الملفات على: * / \\ : ? " < > |',
  alreadyExists: 'موجود بالفعل',
  alreadyExistPlural: 'موجودة بالفعل',
  couldNotCreateFolder: 'تعذّر إنشاء المجلد. تحقّق من أذونات التخزين.',
  couldNotSaveFile: 'تعذّر حفظ الملف.',
  couldNotCreateFile: 'تعذّر إنشاء الملف.',
  couldNotOpenForEdit: 'تعذّر فتح الملف للتعديل.',
  success: 'تم بنجاح',
  renameFailed: 'فشلت إعادة التسمية',
  couldNotRenameAccess: 'تعذّرت إعادة تسمية هذا الملف. تأكد من تفعيل «الوصول إلى جميع الملفات» في الإعدادات.',
  skipExisting: 'تخطي الموجود',
  replace: 'استبدال',
  nothingToDo: 'لا شيء للقيام به',
  allSkipped: 'كل الملفات المحددة موجودة بالفعل في الوجهة وتم تخطيها.',
  folderNotFound: 'المجلد غير موجود',
  removeBookmark: 'إزالة الإشارة المرجعية',
  someFoldersSkipped: 'تم تخطي بعض المجلدات',
  couldNotUpdatePins: 'تعذّر تحديث المجلدات المثبتة.',
  unknown: 'غير معروف',
  internalStorage: 'التخزين الداخلي',
  storage: 'التخزين',
  browse: 'تصفّح',
  copyTo: 'نسخ إلى...',
  copyHere: 'انسخ هنا',
  copying: 'جارٍ نسخ',
  moving: 'جارٍ نقل',
  folder: 'مجلد',
  folderInfo: 'معلومات المجلد',
  location: 'المكان',
  timesOpened: 'مرات الفتح',
  lastOpened: 'آخر فتح',
  nameAZ: 'الاسم (أ ← ي)',
  nameZA: 'الاسم (ي ← أ)',
  dateNewest: 'التاريخ (الأحدث أولاً)',
  dateOldest: 'التاريخ (الأقدم أولاً)',
  sizeLargest: 'الحجم (الأكبر أولاً)',
  sizeSmallest: 'الحجم (الأصغر أولاً)',
  save: 'حفظ',
  create: 'إنشاء',
  deletingFolder: 'جارٍ حذف المجلد...',
  analysingVideo: 'جارٍ تحليل الفيديو...',
  bookmarks: 'الإشارات المرجعية',
  chooseLocation: 'اختر المكان',
  copyText: 'نسخ النص',
  copyImage: 'نسخ الصورة',
  copy: 'نسخ',
  createNew: 'إنشاء جديد',
  createPdf: 'إنشاء PDF',
  createZip: 'إنشاء ZIP',
  detected: 'ما تم التعرّف عليه',
  editImage: 'تعديل الصورة',
  edit: 'تعديل',
  micAccess: 'فعّل الوصول إلى الميكروفون في الإعدادات لاستخدام الإملاء الصوتي',
  extractText: 'استخراج النص',
  extractPages: 'استخراج الصفحات كصور',
  extract: 'استخراج',
  extractedText: 'النص المستخرج',
  leaveBlankPw: 'اتركه فارغاً إن لم يكن محمياً بكلمة مرور',
  more: 'المزيد',
  multiRename: 'إعادة تسمية متعددة',
  newFolder: 'مجلد جديد',
  newTextFile: 'ملف نصي جديد',
  noTextFound: 'لم يُعثر على نص في هذه الصورة.',
  zipOptional: 'اختياري — اتركه فارغاً لملف zip عادي',
  preparingShare: 'جارٍ تجهيز الملفات للمشاركة...',
  print: 'طباعة',
  processing: 'جارٍ المعالجة...',
  protectPw: 'حماية بكلمة مرور',
  readingText: 'جارٍ قراءة النص...',
  rename: 'إعادة تسمية',
  renamingFiles: 'جارٍ إعادة تسمية الملفات...',
  scanSameWifi: 'امسح الرمز بأي جهاز على شبكة WiFi نفسها',
  selectAll: 'تحديد الكل',
  shareViaQr: 'مشاركة عبر QR',
  showHidden: 'إظهار المجلدات والملفات المخفية',
  sortBy: 'ترتيب حسب',
  vault: 'الخزنة',
  videoSummary: 'ملخص الفيديو',
  zip: 'ضغط',
  addTag: 'إضافة وسم',
  addToFavourites: 'إضافة إلى المفضلة',
  removeFromFavourites: 'إزالة من المفضلة',
  bookmarkFolder: 'إضافة المجلد إلى الإشارات المرجعية',
  pinToHome: 'تثبيت في الرئيسية',
  unpinFromHome: 'إلغاء التثبيت من الرئيسية',
  extractZip: 'استخراج ZIP',
  extract7z: 'استخراج 7Z',
  baseNamePh: 'الاسم الأساسي، مثل: عطلة',
  enterPasswordPh: 'أدخل كلمة المرور...',
  fileNamePh: 'اسم الملف...',
  folderNamePh: 'اسم المجلد...',
  newNamePh: 'الاسم الجديد...',
  rootOfInternal: 'المجلد الرئيسي للتخزين الداخلي',
  saveRenamed: 'حفظ الملفات بعد إعادة تسميتها',
  searchFolderPh: 'ابحث في هذا المجلد...',
  startTypingPh: 'ابدأ الكتابة...',
  tagNamePh: 'اسم الوسم...',
  createApply: 'إنشاء وتطبيق',
  newTag: 'وسم جديد',
  tags: 'الوسوم',
  saveHere: 'احفظ هنا',
  couldNotCreateFolderShort: 'تعذّر إنشاء المجلد.',
  defaultSaveLocation: 'مكان الحفظ الافتراضي',
  cannotPlayVideo: 'تعذّر تشغيل الفيديو',
  fileCouldNotOpen: 'تعذّر فتح هذا الملف. ربما تم نقله أو حذفه.',
  docs: 'المستندات',
  downloads: 'التنزيلات',
  namePlaceholder: 'الاسم',
  imagesSavedScans: (n: number) => `تم حفظ ${n} ${A(n,'صورة','صور')} في Documents/Scans`,
  pagesSaved: (n: number, name: string) => `تم حفظ ${n} ${A(n,'صفحة','صفحات')} في Documents/Scans/${name}_pages`,
  pdfsMerged: (n: number) => `تم دمج ${n} ${A(n,'ملف PDF','ملفات PDF')} بنجاح. حُفظت في Documents/Scans.`,
  mixedPdfMsg: (pdfs: number, others: number) => `سيتم دمج ملفات PDF فقط. تم تحديد ${pdfs} ${A(pdfs,'ملف PDF','ملفات PDF')}، وسيتم تخطي ${others} ${A(others,'ملف','ملفات')}. هل تريد المتابعة؟`,
  removedFromFav: (name: string) => `تمت إزالة «${name}» من المفضلة.`,
  addedToFav: (name: string) => `تمت إضافة «${name}» إلى المفضلة.`,
  fileNamedExistsFolder: (name: string) => `يوجد بالفعل ملف باسم «${name}» في هذا المجلد.`,
  couldNotHideMsg: (unhide: boolean) => unhide ? 'تعذّر إظهار هذا الملف.' : 'تعذّر إخفاء هذا الملف.',
  hideMsg: (name: string, isFolder: boolean) => `سيتم إخفاء «${name}» من المعرض و${isFolder ? 'قوائم المجلدات مع كل ما بداخله' : 'قوائم الملفات'}. للعثور عليه مجدداً، فعّل «إظهار المجلدات والملفات المخفية» من قائمة الترتيب، ثم اختر «إظهار».`,
  moveOneToVaultMsg: (name: string) => `نقل «${name}» إلى خزنتك الآمنة؟ ستتم إزالة الملف الأصلي من مكانه الحالي.`,
  alreadyInVaultMsg: (name: string) => `يوجد ملف باسم «${name}» في الخزنة بالفعل. أعد تسمية هذا الملف أولاً، أو احذف النسخة الموجودة هناك.`,
  isNowSecured: (name: string) => `«${name}» أصبح محمياً الآن.`,
  folderNotEmptyMsg: (name: string, n: number) => `يحتوي «${name}» على ${n} ${A(n,'عنصر','عناصر')}. احذف كل الملفات أو انقلها أولاً، ثم احذف المجلد الفارغ.`,
  deleteOneMsg: (name: string) => `حذف «${name}»؟ لا يمكن التراجع عن ذلك.`,
  trashOneMsg: (name: string) => `سيتم نقل «${name}» إلى المهملات وحذفه بعد 30 يوماً.`,
  extractedTo: (folder: string) => `تم استخراج الملفات إلى المجلد «${folder}».`,
  zippedMsg: (name: string, n: number, pw: boolean) => `تم إنشاء «${name}» من ${n} ${A(n,'ملف','ملفات')}.${pw ? ' محمي بكلمة مرور.' : ''}`,
  moveNToVault: (n: number) => `نقل ${n} ${A(n,'ملف','ملفات')} إلى خزنتك الآمنة؟`,
  moveNToVaultSkip: (n: number, folders: number) => `نقل ${n} ${A(n,'ملف','ملفات')} إلى خزنتك الآمنة؟ سيتم تخطي ${folders} ${A(folders,'مجلد','مجلدات')} — الخزنة تحفظ الملفات فقط.`,
  nMovedToVault: (n: number) => `تم نقل ${n} ${A(n,'ملف','ملفات')} إلى الخزنة.`,
  nAlreadyInVault: (n: number, names: string, more: number) => `${n} ${A(n,'ملف','ملفات')} في الخزنة بالفعل: ${names}${more > 0 ? ` و${more} أخرى` : ''}.`,
  nCouldNotMove: (n: number) => `تعذّر نقل ${n}.`,
  nSecured: (n: number) => `تم تأمين ${n} ${A(n,'ملف','ملفات')}.`,
  trashNFiles: (n: number) => `نقل ${n} ${A(n,'ملف','ملفات')} إلى المهملات؟ تُحذف بعد 30 يوماً.`,
  deleteNFolders: (n: number) => `حذف ${n} ${A(n,'مجلد','مجلدات')}؟ لا يمكن التراجع عن ذلك.`,
  trashAndDelete: (files: number, folders: number) => `نقل ${files} ${A(files,'ملف','ملفات')} إلى المهملات وحذف ${folders} ${A(folders,'مجلد','مجلدات')} نهائياً؟ يمكن استعادة الملفات خلال 30 يوماً.`,
  foldersSkippedMsg: (n: number, first: string) => `${n === 1 ? `تعذّر حذف «${first}» لأنه ليس فارغاً.` : `تعذّر حذف ${n} ${A(n,'مجلد','مجلدات')} لأنها ليست فارغة.`}`,
  nItemsSelected: (n: number) => `تم تحديد ${n} ${A(n,'عنصر','عناصر')}`,
  nFiles: (n: number) => `${n} ${A(n,'ملف','ملفات')}`,
  nFolders: (n: number) => `${n} ${A(n,'مجلد','مجلدات')}`,
  totalSize: (size: string) => `الحجم الإجمالي: ${size}`,
  renamedWithFails: (ok: number, failed: number, where: string) => `تمت إعادة تسمية ${ok} ${A(ok,'ملف','ملفات')}. فشل ${failed}.\nحُفظت في ${where}`,
  renamedAs: (ok: number, base: string, where: string) => `تمت إعادة تسمية ${ok} ${A(ok,'ملف','ملفات')} إلى ${base}_1، ${base}_2...\nحُفظت في ${where}`,
  folderExistsHere: (name: string) => `يوجد بالفعل مجلد باسم «${name}» هنا.`,
  fileExistsHere: (name: string) => `يوجد بالفعل ملف باسم «${name}» هنا.`,
  existsInFolder: (name: string) => `«${name}» موجود بالفعل في هذا المجلد.`,
  copiedOk: (name: string) => `تم نسخ «${name}» بنجاح.`,
  movedOk: (name: string) => `تم نقل «${name}» بنجاح.`,
  couldNotCopyOrMoveFile: (copy: boolean) => copy ? 'تعذّر نسخ الملف.' : 'تعذّر نقل الملف.',
  couldNotCopyOrMoveFiles: (copy: boolean) => copy ? 'تعذّر نسخ الملفات.' : 'تعذّر نقل الملفات.',
  dupesExistMsg: (names: string, more: number, total: number) => `${names}${more > 0 ? ` و${more} أخرى` : ''} ${total === 1 ? 'موجود' : 'موجودة'} بالفعل في هذا المجلد.`,
  multiDoneMsg: (n: number, copy: boolean, skipped: number) => `تم ${copy ? 'نسخ' : 'نقل'} ${n} ${A(n,'عنصر','عناصر')} بنجاح.${skipped > 0 ? ` تم تخطي ${skipped} (أسماء مكررة).` : ''}`,
  bookmarkGoneMsg: (name: string) => `تعذّر العثور على «${name}». ربما تم نقله أو حذفه.`,
  movingToTrash: (done: number, total: number) => `جارٍ نقل ${done} من ${total} إلى المهملات...`,
  copyProgress: (copy: boolean, cur: number, total: number, name: string) => `جارٍ ${copy ? 'نسخ' : 'نقل'} ${cur} من ${total}: ${name}`,
  movingNToTrash: (n: number) => `جارٍ نقل ${n} ${A(n,'ملف','ملفات')} إلى المهملات...`,
  tagsCount: (n: number) => `الوسوم (${n})`,
  pillTitle: (move: boolean, n: number) => `${move ? 'نقل' : 'نسخ'} ${n} ${A(n,'عنصر','عناصر')} إلى…`,
  movingNToVault: (n: number) => `جارٍ نقل ${n} ${A(n,'ملف','ملفات')} إلى الخزنة...`,
  creatingPdfProgress: (cur: number, total: number) => `جارٍ إنشاء PDF... ${cur} من ${total}`,
  extractingPageProgress: (cur: number, total: number) => `جارٍ استخراج الصفحة ${cur} من ${total}...`,
  mergingPdfProgress: (cur: number, total: number) => `جارٍ دمج ملف PDF ${cur} من ${total}...`,
  renameNFiles: (n: number) => `إعادة تسمية ${n} ${A(n,'ملف','ملفات')}`,
  filesWillBeNamed: (base: string) => `ستُسمّى الملفات: ${base}_1، ${base}_2...`,
};

const HI: FilesText = {
  noImagesSelected: 'कोई इमेज नहीं चुनी गई',
  selectOneImage: 'PDF बनाने के लिए कम से कम एक इमेज चुनें।',
  pdfCreated: 'PDF बन गई',
  couldNotCreatePdf: 'PDF नहीं बन सकी।',
  extracted: 'निकाल लिया गया',
  couldNotExtractPages: 'PDF के पेज नहीं निकाले जा सके।',
  notEnoughPdfs: 'पर्याप्त PDF नहीं',
  selectTwoPdfs: 'जोड़ने के लिए कम से कम 2 PDF फ़ाइलें चुनें।',
  merged: 'जुड़ गईं',
  couldNotMergePdfs: 'PDF नहीं जोड़ी जा सकीं।',
  mixedSelection: 'मिला-जुला चयन',
  mergePdfs: 'PDF जोड़ें',
  couldNotExtractText: 'इस इमेज से टेक्स्ट नहीं निकाला जा सका।',
  noWifi: 'Wi-Fi नहीं है',
  connectWifi: 'फ़ाइलें शेयर करने के लिए Wi-Fi से जुड़ें या हॉटस्पॉट चालू करें।',
  couldNotStartWifi: 'WiFi सर्वर शुरू नहीं हो सका',
  copied: 'कॉपी हो गया',
  imageCopied: 'इमेज क्लिपबोर्ड पर कॉपी हो गई।',
  couldNotCopyImage: 'इमेज क्लिपबोर्ड पर कॉपी नहीं हो सकी।',
  textCopied: 'टेक्स्ट क्लिपबोर्ड पर कॉपी हो गया।',
  removed: 'हटा दिया गया',
  added: 'जोड़ दिया गया',
  printFailed: 'प्रिंट नहीं हो सका',
  couldNotPrint: 'यह फ़ाइल प्रिंट नहीं हो सकी। पक्का करें कि आपके डिवाइस पर प्रिंटर सेट है।',
  couldNotSummarise: 'वीडियो सारांश नहीं बन सका।',
  nameTaken: 'यह नाम पहले से लिया गया है',
  hideFolder: 'फ़ोल्डर छिपाएँ',
  hideFile: 'फ़ाइल छिपाएँ',
  hide: 'छिपाएँ',
  unhide: 'दिखाएँ',
  moveToVault: 'Vault में मूव करें',
  alreadyInVault: 'पहले से Vault में है',
  movedToVault: 'Vault में मूव हो गया',
  couldNotVault: 'फ़ाइल Vault में मूव नहीं हो सकी। फिर से कोशिश करें।',
  folderNotEmpty: 'फ़ोल्डर खाली नहीं है',
  deleteFolder: 'फ़ोल्डर हटाएँ',
  deleteFolders: 'फ़ोल्डर हटाएँ',
  permissionNeeded: 'अनुमति चाहिए',
  needFullAccessDelete: 'फ़ोल्डर हटाने के लिए AskFiles को पूरे स्टोरेज की अनुमति चाहिए।',
  openSettings: 'सेटिंग्स खोलें',
  moveToTrash: 'ट्रैश में डालें',
  couldNotTrash: 'फ़ाइल ट्रैश में नहीं डाली जा सकी।',
  incorrectPassword: 'गलत पासवर्ड',
  wrongPassword: 'आपका डाला गया पासवर्ड गलत है। फिर से कोशिश करें।',
  tryAgain: 'फिर से कोशिश करें',
  couldNotExtract7z: 'यह 7z फ़ाइल नहीं निकाली जा सकी।',
  couldNotExtractZip: 'zip फ़ाइल नहीं निकाली जा सकी।',
  noFilesToZip: 'zip करने के लिए कोई फ़ाइल नहीं',
  cantZip: 'ZIP फ़ाइलें और फ़ोल्डर zip नहीं किए जा सकते।',
  zipped: 'zip हो गया',
  couldNotZip: 'zip फ़ाइल नहीं बन सकी।',
  proVaultMsg: 'फ़ाइलें Vault में मूव करने के लिए AskFiles Pro में अपग्रेड करें।',
  notNow: 'अभी नहीं',
  upgrade: 'अपग्रेड करें',
  cantVaultFolders: 'फ़ोल्डर Vault में नहीं जा सकते',
  vaultFilesOnly: 'Vault में केवल फ़ाइलें रहती हैं। कम से कम एक फ़ाइल चुनें।',
  move: 'मूव करें',
  nothingMoved: 'कुछ भी मूव नहीं हुआ',
  renamed: 'नाम बदल गया',
  couldNotRenameFiles: 'फ़ाइलों के नाम नहीं बदले जा सके।',
  invalidName: 'अमान्य नाम',
  folderNameChars: 'फ़ोल्डर के नाम में ये नहीं हो सकते: * \\ : ? " < > |',
  fileNameChars: 'फ़ाइल के नाम में ये नहीं हो सकते: * / \\ : ? " < > |',
  alreadyExists: 'पहले से मौजूद है',
  alreadyExistPlural: 'पहले से मौजूद हैं',
  couldNotCreateFolder: 'फ़ोल्डर नहीं बन सका। स्टोरेज अनुमतियाँ जाँचें।',
  couldNotSaveFile: 'फ़ाइल सेव नहीं हो सकी।',
  couldNotCreateFile: 'फ़ाइल नहीं बन सकी।',
  couldNotOpenForEdit: 'फ़ाइल एडिट के लिए नहीं खुल सकी।',
  success: 'सफल',
  renameFailed: 'नाम नहीं बदला जा सका',
  couldNotRenameAccess: 'इस फ़ाइल का नाम नहीं बदला जा सका। पक्का करें कि Settings में "All files access" चालू है।',
  skipExisting: 'मौजूदा छोड़ें',
  replace: 'बदलें',
  nothingToDo: 'करने को कुछ नहीं',
  allSkipped: 'चुनी गई सभी फ़ाइलें पहले से वहाँ मौजूद हैं, इसलिए छोड़ दी गईं।',
  folderNotFound: 'फ़ोल्डर नहीं मिला',
  removeBookmark: 'बुकमार्क हटाएँ',
  someFoldersSkipped: 'कुछ फ़ोल्डर छोड़ दिए गए',
  couldNotUpdatePins: 'पिन किए गए फ़ोल्डर अपडेट नहीं हो सके।',
  unknown: 'अज्ञात',
  internalStorage: 'इंटरनल स्टोरेज',
  storage: 'स्टोरेज',
  browse: 'ब्राउज़',
  copyTo: 'यहाँ कॉपी करें...',
  copyHere: 'यहाँ कॉपी करें',
  copying: 'कॉपी हो रहा है',
  moving: 'मूव हो रहा है',
  folder: 'फ़ोल्डर',
  folderInfo: 'फ़ोल्डर की जानकारी',
  location: 'जगह',
  timesOpened: 'कितनी बार खोला',
  lastOpened: 'आख़िरी बार खोला',
  nameAZ: 'नाम A → Z',
  nameZA: 'नाम Z → A',
  dateNewest: 'तारीख़ (नई पहले)',
  dateOldest: 'तारीख़ (पुरानी पहले)',
  sizeLargest: 'साइज़ (बड़ी पहले)',
  sizeSmallest: 'साइज़ (छोटी पहले)',
  save: 'सेव करें',
  create: 'बनाएँ',
  deletingFolder: 'फ़ोल्डर हट रहा है...',
  analysingVideo: 'वीडियो का विश्लेषण हो रहा है...',
  bookmarks: 'बुकमार्क',
  chooseLocation: 'जगह चुनें',
  copyText: 'टेक्स्ट कॉपी करें',
  copyImage: 'इमेज कॉपी करें',
  copy: 'कॉपी करें',
  createNew: 'नया बनाएँ',
  createPdf: 'PDF बनाएँ',
  createZip: 'ZIP बनाएँ',
  detected: 'पहचाना गया',
  editImage: 'इमेज एडिट करें',
  edit: 'एडिट करें',
  micAccess: 'वॉइस डिक्टेशन के लिए Settings में माइक्रोफ़ोन की अनुमति चालू करें',
  extractText: 'टेक्स्ट निकालें',
  extractPages: 'पेजों को इमेज के रूप में निकालें',
  extract: 'निकालें',
  extractedText: 'निकाला गया टेक्स्ट',
  leaveBlankPw: 'पासवर्ड न हो तो खाली छोड़ें',
  more: 'और',
  multiRename: 'एक साथ नाम बदलें',
  newFolder: 'नया फ़ोल्डर',
  newTextFile: 'नई टेक्स्ट फ़ाइल',
  noTextFound: 'इस इमेज में कोई टेक्स्ट नहीं मिला।',
  zipOptional: 'वैकल्पिक — सामान्य zip के लिए खाली छोड़ें',
  preparingShare: 'फ़ाइलें शेयर के लिए तैयार हो रही हैं...',
  print: 'प्रिंट करें',
  processing: 'प्रोसेस हो रहा है...',
  protectPw: 'पासवर्ड से सुरक्षित करें',
  readingText: 'टेक्स्ट पढ़ा जा रहा है...',
  rename: 'नाम बदलें',
  renamingFiles: 'फ़ाइलों के नाम बदल रहे हैं...',
  scanSameWifi: 'उसी WiFi पर किसी भी डिवाइस से स्कैन करें',
  selectAll: 'सभी चुनें',
  shareViaQr: 'QR से शेयर करें',
  showHidden: 'छिपे फ़ोल्डर और फ़ाइलें दिखाएँ',
  sortBy: 'क्रम',
  vault: 'Vault',
  videoSummary: 'वीडियो सारांश',
  zip: 'Zip',
  addTag: 'टैग जोड़ें',
  addToFavourites: 'पसंदीदा में जोड़ें',
  removeFromFavourites: 'पसंदीदा से हटाएँ',
  bookmarkFolder: 'फ़ोल्डर बुकमार्क करें',
  pinToHome: 'होम पर पिन करें',
  unpinFromHome: 'होम से अनपिन करें',
  extractZip: 'ZIP निकालें',
  extract7z: '7Z निकालें',
  baseNamePh: 'मूल नाम, जैसे holiday',
  enterPasswordPh: 'पासवर्ड डालें...',
  fileNamePh: 'फ़ाइल का नाम...',
  folderNamePh: 'फ़ोल्डर का नाम...',
  newNamePh: 'नया नाम...',
  rootOfInternal: 'इंटरनल स्टोरेज का मुख्य फ़ोल्डर',
  saveRenamed: 'नाम बदली फ़ाइलें सेव करें',
  searchFolderPh: 'इस फ़ोल्डर में खोजें...',
  startTypingPh: 'लिखना शुरू करें...',
  tagNamePh: 'टैग का नाम...',
  createApply: 'बनाएँ और लगाएँ',
  newTag: 'नया टैग',
  tags: 'टैग',
  saveHere: 'यहाँ सेव करें',
  couldNotCreateFolderShort: 'फ़ोल्डर नहीं बन सका।',
  defaultSaveLocation: 'डिफ़ॉल्ट सेव लोकेशन',
  cannotPlayVideo: 'वीडियो नहीं चल सकता',
  fileCouldNotOpen: 'यह फ़ाइल नहीं खुल सकी। हो सकता है इसे मूव या डिलीट किया गया हो।',
  docs: 'डॉक्स',
  downloads: 'डाउनलोड',
  namePlaceholder: 'नाम',
  imagesSavedScans: (n: number) => `${n} ${H(n,'इमेज','इमेज')} Documents/Scans में सेव ${n === 1 ? 'हुई' : 'हुईं'}`,
  pagesSaved: (n: number, name: string) => `${n} पेज Documents/Scans/${name}_pages में सेव ${n === 1 ? 'हुआ' : 'हुए'}`,
  pdfsMerged: (n: number) => `${n} PDF सफलतापूर्वक जुड़ गईं। Documents/Scans में सेव की गईं।`,
  mixedPdfMsg: (pdfs: number, others: number) => `केवल PDF फ़ाइलें जोड़ी जाएँगी। ${pdfs} PDF चुनी गईं, ${others} ${H(others,'फ़ाइल','फ़ाइलें')} छोड़ दी जाएँगी। जारी रखें?`,
  removedFromFav: (name: string) => `"${name}" पसंदीदा से हटा दी गई।`,
  addedToFav: (name: string) => `"${name}" पसंदीदा में जोड़ दी गई।`,
  fileNamedExistsFolder: (name: string) => `"${name}" नाम की फ़ाइल इस फ़ोल्डर में पहले से मौजूद है।`,
  couldNotHideMsg: (unhide: boolean) => unhide ? 'यह फ़ाइल दिखाई नहीं जा सकी।' : 'यह फ़ाइल छिपाई नहीं जा सकी।',
  hideMsg: (name: string, isFolder: boolean) => `"${name}" आपकी गैलरी और ${isFolder ? 'फ़ोल्डर सूची से, अंदर की हर चीज़ के साथ' : 'फ़ाइल सूची से'} छिप जाएगी। इसे फिर से देखने के लिए क्रम मेन्यू में "छिपे फ़ोल्डर और फ़ाइलें दिखाएँ" चालू करें, फिर "दिखाएँ" चुनें।`,
  moveOneToVaultMsg: (name: string) => `"${name}" को अपने सुरक्षित Vault में मूव करें? मूल फ़ाइल अपनी मौजूदा जगह से हट जाएगी।`,
  alreadyInVaultMsg: (name: string) => `"${name}" नाम की फ़ाइल पहले से Vault में है। पहले इसका नाम बदलें, या वहाँ मौजूद कॉपी हटाएँ।`,
  isNowSecured: (name: string) => `"${name}" अब सुरक्षित है।`,
  folderNotEmptyMsg: (name: string, n: number) => `"${name}" में ${n} ${H(n,'आइटम','आइटम')} हैं। पहले सभी फ़ाइलें हटाएँ या मूव करें, फिर खाली फ़ोल्डर हटाएँ।`,
  deleteOneMsg: (name: string) => `"${name}" हटाएँ? इसे वापस नहीं किया जा सकता।`,
  trashOneMsg: (name: string) => `"${name}" ट्रैश में चली जाएगी और 30 दिन बाद हट जाएगी।`,
  extractedTo: (folder: string) => `फ़ाइलें "${folder}" फ़ोल्डर में निकाल दी गईं।`,
  zippedMsg: (name: string, n: number, pw: boolean) => `"${name}" ${n} ${H(n,'फ़ाइल','फ़ाइलों')} से बनी।${pw ? ' पासवर्ड से सुरक्षित।' : ''}`,
  moveNToVault: (n: number) => `${n} ${H(n,'फ़ाइल','फ़ाइलें')} अपने सुरक्षित Vault में मूव करें?`,
  moveNToVaultSkip: (n: number, folders: number) => `${n} ${H(n,'फ़ाइल','फ़ाइलें')} अपने सुरक्षित Vault में मूव करें? ${folders} फ़ोल्डर छोड़ दिए जाएँगे — Vault में केवल फ़ाइलें रहती हैं।`,
  nMovedToVault: (n: number) => `${n} ${H(n,'फ़ाइल','फ़ाइलें')} Vault में मूव हुईं।`,
  nAlreadyInVault: (n: number, names: string, more: number) => `${n} पहले से Vault में ${n === 1 ? 'है' : 'हैं'}: ${names}${more > 0 ? ` और ${more} अन्य` : ''}।`,
  nCouldNotMove: (n: number) => `${n} मूव नहीं हो सकीं।`,
  nSecured: (n: number) => `${n} ${H(n,'फ़ाइल','फ़ाइलें')} सुरक्षित।`,
  trashNFiles: (n: number) => `${n} ${H(n,'फ़ाइल','फ़ाइलें')} ट्रैश में डालें? 30 दिन बाद हट जाएँगी।`,
  deleteNFolders: (n: number) => `${n} फ़ोल्डर हटाएँ? इसे वापस नहीं किया जा सकता।`,
  trashAndDelete: (files: number, folders: number) => `${files} ${H(files,'फ़ाइल','फ़ाइलें')} ट्रैश में डालें और ${folders} फ़ोल्डर हमेशा के लिए हटाएँ? फ़ाइलें 30 दिनों के अंदर वापस लाई जा सकती हैं।`,
  foldersSkippedMsg: (n: number, first: string) => `${n === 1 ? `"${first}" नहीं हटाया जा सका क्योंकि यह खाली नहीं है।` : `${n} फ़ोल्डर नहीं हटाए जा सके क्योंकि वे खाली नहीं हैं।`}`,
  nItemsSelected: (n: number) => `${n} ${H(n,'आइटम','आइटम')} चुने गए`,
  nFiles: (n: number) => `${n} ${H(n,'फ़ाइल','फ़ाइलें')}`,
  nFolders: (n: number) => `${n} फ़ोल्डर`,
  totalSize: (size: string) => `कुल साइज़: ${size}`,
  renamedWithFails: (ok: number, failed: number, where: string) => `${ok} ${H(ok,'फ़ाइल','फ़ाइलों')} के नाम बदले। ${failed} नहीं बदले।\n${where} में सेव`,
  renamedAs: (ok: number, base: string, where: string) => `${ok} ${H(ok,'फ़ाइल','फ़ाइलों')} के नाम ${base}_1, ${base}_2... रखे गए\n${where} में सेव`,
  folderExistsHere: (name: string) => `"${name}" नाम का फ़ोल्डर यहाँ पहले से मौजूद है।`,
  fileExistsHere: (name: string) => `"${name}" नाम की फ़ाइल यहाँ पहले से मौजूद है।`,
  existsInFolder: (name: string) => `"${name}" इस फ़ोल्डर में पहले से मौजूद है।`,
  copiedOk: (name: string) => `"${name}" सफलतापूर्वक कॉपी हो गई।`,
  movedOk: (name: string) => `"${name}" सफलतापूर्वक मूव हो गई।`,
  couldNotCopyOrMoveFile: (copy: boolean) => copy ? 'फ़ाइल कॉपी नहीं हो सकी।' : 'फ़ाइल मूव नहीं हो सकी।',
  couldNotCopyOrMoveFiles: (copy: boolean) => copy ? 'फ़ाइलें कॉपी नहीं हो सकीं।' : 'फ़ाइलें मूव नहीं हो सकीं।',
  dupesExistMsg: (names: string, more: number, total: number) => `${names}${more > 0 ? ` और ${more} अन्य` : ''} इस फ़ोल्डर में पहले से ${total === 1 ? 'मौजूद है' : 'मौजूद हैं'}।`,
  multiDoneMsg: (n: number, copy: boolean, skipped: number) => `${n} ${H(n,'आइटम','आइटम')} सफलतापूर्वक ${copy ? 'कॉपी' : 'मूव'} हुए।${skipped > 0 ? ` ${skipped} छोड़े गए (एक जैसे नाम)।` : ''}`,
  bookmarkGoneMsg: (name: string) => `"${name}" नहीं मिला। हो सकता है इसे मूव या डिलीट किया गया हो।`,
  movingToTrash: (done: number, total: number) => `${total} में से ${done} फ़ाइलें ट्रैश में जा रही हैं...`,
  copyProgress: (copy: boolean, cur: number, total: number, name: string) => `${total} में से ${cur} ${copy ? 'कॉपी' : 'मूव'} हो रहा है: ${name}`,
  movingNToTrash: (n: number) => `${n} ${H(n,'फ़ाइल','फ़ाइलें')} ट्रैश में जा रही हैं...`,
  tagsCount: (n: number) => `टैग (${n})`,
  pillTitle: (move: boolean, n: number) => `${n} ${H(n,'आइटम','आइटम')} यहाँ ${move ? 'मूव' : 'कॉपी'} करें…`,
  movingNToVault: (n: number) => `${n} ${H(n,'फ़ाइल','फ़ाइलें')} Vault में जा रही हैं...`,
  creatingPdfProgress: (cur: number, total: number) => `PDF बन रही है... ${total} में से ${cur}`,
  extractingPageProgress: (cur: number, total: number) => `${total} में से पेज ${cur} निकाला जा रहा है...`,
  mergingPdfProgress: (cur: number, total: number) => `${total} में से PDF ${cur} जोड़ी जा रही है...`,
  renameNFiles: (n: number) => `${n} ${H(n,'फ़ाइल','फ़ाइलों')} के नाम बदलें`,
  filesWillBeNamed: (base: string) => `फ़ाइलों के नाम होंगे: ${base}_1, ${base}_2...`,
};

const TEXT: Record<AppLang, FilesText> = { en: EN, ar: AR, hi: HI };

export function filesText(lang: AppLang): FilesText { return TEXT[lang]; }
