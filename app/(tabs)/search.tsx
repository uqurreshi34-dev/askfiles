import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { isVideoFile, VideoThumb } from '@/utils/videoThumb';
import {
  StyleSheet, Text, View, TextInput, TouchableOpacity,
  FlatList, ActivityIndicator, Image, Keyboard, ScrollView,
  Modal, Animated, Platform, Pressable, KeyboardAvoidingView, Alert, useWindowDimensions, StatusBar
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSearch } from '@/hooks/useSearch';
import { useAskAI } from '@/hooks/useAskAI';
import { isImageFile, getMimeType, getFileColor, formatSize, getFileIcon, toPath, getFriendlyPath, formatDate, exifLines, ROOT_PATH } from '@/utils/files';
import { useBottomSheet } from '@/hooks/useBottomSheet';
import { getMediaInfo } from 'media-store';
import FileDetailsModal from '@/components/FileDetailsModal';
import { addRecent } from '@/hooks/useRecents';
import * as Sharing from 'expo-sharing';
import { useStorage } from '@/hooks/useStorage';
import { usePro } from '@/hooks/usePro';
import { useVault } from '@/hooks/useVault';
import * as FileSystem from 'expo-file-system/next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { addFavourite, removeFavourite, isFavourite, useFavourites } from '@/hooks/useFavourites';
import RNFS from 'react-native-fs';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { useTheme } from '@/hooks/useTheme';
import { keyboardClosed } from '@/utils/keyboard';
import { useLanguage } from '@/modules/appLanguage';
import { commonText } from '@/modules/i18n/common';
import { filesText } from '@/modules/i18n/files';
import { categoryText } from '@/modules/i18n/categoryText';
import { searchText } from '@/modules/i18n/searchText';
import { useTrash } from '@/hooks/useTrash';
import { openFile as openFileNative, shareFiles, copyImageToClipboard } from '@/modules/share-module';
import { DocIndexer, IndexedFile } from '@/modules/doc-indexer';
import { scanFile } from '@/modules/share-module';
import { shareFileViaWifi, WIFI_NO_NETWORK, copyFileStream, moveFileStream, addCopyProgressListener, readTextPreview, readDocxPreview } from 'file-reader';
import { recordActivity, readableFolder } from '@/modules/activityLog';
import { getStorageVolumes } from '@/modules/storage-stats';
import { syncPathReferences } from '@/hooks/usePathSync';
import { useTags } from '@/hooks/useTags';
import { useFileTags } from '@/hooks/useFileTags';
import TagPickerModal from '@/components/TagPickerModal';
import { MediaViewerView } from 'media-viewer';
import VideoPlayerModal from '@/components/VideoPlayerModal';
import { recordOpen, getStats } from 'file-stats';
import * as Haptics from 'expo-haptics';
import QRCode from 'react-native-qrcode-svg';
import { getRecentSearches, addRecentSearch, removeRecentSearch, clearRecentSearches, RecentSearch } from 'recent-searches';
import { getDateGroup } from '@/hooks/useRecents';
import Thumb from '@/components/Thumb';
import { answerLocally } from '@/modules/askLocal';
import { FREE_QUESTIONS, PRO_EXAMPLES, isFreeQuestion, STILL_READING } from '@/modules/askFree';
import { recentActivity } from '@/modules/activityLog';
import { storageChange } from '@/modules/storageTrend';

type Mode = 'search' | 'ask' | 'smart';

const nameCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

const SUGGESTIONS = [
  'What images do I have?',
  'Find my downloaded files',
  'What videos are on my phone?',
  "What's taking up the most space?",
  'How much storage do I have left?',
  'Should I free up some space?',
];

function buildContext(
  storageInfo: any,
  fileCounts: any,
  folderSizes: any,
  largestFiles: any,
): string {

  const freeSpace = storageInfo?.freeBytes ? formatSize(storageInfo.freeBytes) : 'unknown';

  return `
Device storage: ${storageInfo?.usedReadable} used of ${storageInfo?.totalReadable} total. ${freeSpace} free.
File counts: ${fileCounts.images} images, ${fileCounts.videos} videos, ${fileCounts.documents} documents, ${fileCounts.downloads} downloads.
Folder sizes: DCIM/Camera ${folderSizes.dcim}, Pictures ${folderSizes.pictures}, Videos total ${folderSizes.videos}, Downloads ${folderSizes.downloads}, Documents ${folderSizes.documents}.
Files with 1970 date have corrupted/missing timestamps from WhatsApp.
Largest images by size: ${largestFiles.images.map((f: any) => `${f.name} (${f.size}, in ${f.folder})`).join(', ') || 'none'}.
Largest videos by size: ${largestFiles.videos.map((f: any) => `${f.name} (${f.size}, in ${f.folder})`).join(', ') || 'none'}.
Largest documents by size: ${largestFiles.documents.map((f: any) => `${f.name} (${f.size}, in ${f.folder})`).join(', ') || 'none'}.
Largest downloads by size: ${largestFiles.downloads.map((f: any) => `${f.name} (${f.size}, in ${f.folder})`).join(', ') || 'none'}.
Largest files across all storage (use this to answer "what's my largest file"): ${largestFiles.overall.map((f: any) => `${f.name} (${f.size}, in ${f.folder})`).join(', ') || 'none'}.
Note: 'Other' storage is system and app data the user cannot access — never mention it when answering questions about largest files or folders.
Note: always use the folder name provided in brackets when stating where a file is located — never guess or assume a file's location based on its type.
  `.trim();
}

export default function SearchScreen() {
  const { colors, dark } = useTheme();
  const { moveToTrash } = useTrash();
  const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = useWindowDimensions();
  const [mode, setMode] = useState<Mode>('search');
  const [query, setQuery] = useState('');
  const [aiQuery, setAiQuery] = useState('');
  const { results, setResults, searching, search, removeResult } = useSearch();
  const { answer, thinking, cooldown, ask, reset } = useAskAI();
  const [localAnswer, setLocalAnswer] = useState('');
  const router = useRouter();
  const lang = useLanguage();
  const tc = commonText(lang);
  const tf = filesText(lang);
  const tk = categoryText(lang);
  const ts = searchText(lang);
  const { autofocus } = useLocalSearchParams<{ autofocus?: string }>();
  const searchInputRef = useRef<TextInput>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [listening, setListening] = useState(false);
  const [micTooltip, setMicTooltip] = useState(false);
  const [openingUri, setOpeningUri] = useState<string | null>(null);
  const [movingUri, setMovingUri] = useState<string | null>(null);
  const [smartQuery, setSmartQuery] = useState('');
  const [smartResults, setSmartResults] = useState<IndexedFile[]>([]);
  const [smartSearching, setSmartSearching] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const smartTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [indexCount, setIndexCount] = useState(0);
  const [copyProgress, setCopyProgress] = useState<number | null>(null);
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([]);
  const [historyHidden, setHistoryHidden] = useState(false);
  const [typeFilter, setTypeFilter] = useState<'' | 'image' | 'video' | 'audio' | 'doc' | 'other'>('');
  const [renaming, setRenaming] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setRecentSearches(getRecentSearches());
      if (autofocus === '1') {
        const t = setTimeout(() => searchInputRef.current?.focus(), 400);
        return () => clearTimeout(t);
      }
    }, [autofocus])
  );

  useEffect(() => {
    if (mode !== 'smart') return;
    handleIndexNow();
  }, [mode]);

  const { fileCounts, storageInfo, folderSizes, mediaContext, largestFiles, documentExtensions, folderBytes, silentReload, loading: storageLoading } = useStorage();
  const { isPro, loading: proLoading } = usePro();
  // Free users ask the questions answered on the phone; their own, typed or spoken, are Pro.
  const askSuggestions = isPro ? SUGGESTIONS : FREE_QUESTIONS;
  const { addToVault, vaultHas } = useVault();
  const insets = useSafeAreaInsets();
  const [selectedItem, setSelectedItem] = useState<{ name: string; uri: string; inFolder?: boolean } | null>(null);
  const [showSheet, setShowSheet] = useState(false);
  const [txtPreview, setTxtPreview] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<string | null>(null);
  const [showRename, setShowRename] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [pickerMode, setPickerMode] = useState<'copy' | 'move'>('copy');
  const [pickerPath, setPickerPath] = useState('file:///storage/emulated/0/');
  const [pickerItems, setPickerItems] = useState<{ name: string; uri: string; isDirectory: boolean }[]>([]);
  const [pickerFiles, setPickerFiles] = useState<{ name: string; uri: string; isDirectory: boolean }[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pasting, setPasting] = useState(false);
  const [isFav, setIsFav] = useState(false);
  const { tags } = useTags();
  const pendingItem = useRef<{ name: string; uri: string; inFolder?: boolean } | null>(null);
  const [volumes, setVolumes] = useState<{ name: string; path: string; type: string }[]>([]);
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  const [playerUri, setPlayerUri] = useState<string | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [detailsData, setDetailsData] = useState<{ label: string; value: string }[]>([]);
  const [detailsName, setDetailsName] = useState('');
  const [qrModalVisible, setQrModalVisible] = useState(false);
  const [qrUrl, setQrUrl] = useState('');
  const { favourites } = useFavourites();
  const favSet = useMemo(() => new Set(favourites.map(f => f.uri)), [favourites]);
  const [showTagPicker, setShowTagPicker] = useState(false);
  const { sheetAnim, panResponder, animateOpen, closeSheet } = useBottomSheet(() => {
    setShowSheet(false);
    setSelectedItem(null);
  });

  // The storage cache is only rebuilt by the home tab's reload(), so a file
  // moved in browse is still reported at its old location here. Separate
  // from the focus effect above because useStorage is called below it.
  useFocusEffect(
    useCallback(() => {
      void silentReload();
    }, [silentReload])
  );

  useEffect(() => { getStorageVolumes().then(setVolumes); }, []);

  const { fileTags } = useFileTags();
  const fileTagsMap = useMemo(() => {
    const m: Record<string, string[]> = {};
    fileTags.forEach(f => { if (f.tagIds.length) m[f.uri] = f.tagIds; });
    return m;
  }, [fileTags]);

  useSpeechRecognitionEvent('result', (e) => {
    if (!listening) return;
    const text = e.results?.[0]?.transcript ?? '';
    if (text) setAiQuery(text);
  });

  useSpeechRecognitionEvent('end', () => { setListening(false); });
  useSpeechRecognitionEvent('error', () => setListening(false));
  
  async function toggleListening() {
    if (listening) {
      ExpoSpeechRecognitionModule.stop();
      return;
    }
    const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!granted) {
      setMicTooltip(true);
      setTimeout(() => setMicTooltip(false), 2500);
      return;
    }
    setAiQuery('');
    setListening(true);
    ExpoSpeechRecognitionModule.start({ lang: 'en-US', interimResults: true });
  }

  async function openSheet(item: { name: string; uri: string; inFolder?: boolean }) {
    // Wait for a keyboard left open from searching to finish closing: a sheet
    // opened while it slid away measured itself too short in landscape, and
    // options like Delete could not be scrolled to.
    await keyboardClosed();
    setTxtPreview(null);
    setSelectedItem(item);
    pendingItem.current = item;
    setFileSize(null);
    setShowSheet(true);
    setShowRename(false);
    setRenameValue('');
    setIsFav(await isFavourite(item.uri));
    animateOpen();
    try {
      const file = new FileSystem.File(item.uri);
      setFileSize(formatSize(file.size ?? 0));
    } catch { setFileSize(tf.unknown); }
    const lowerName = item.name.toLowerCase();
    if (lowerName.endsWith('.txt')) {
      readTextPreview(toPath(item.uri)).then(setTxtPreview).catch(() => setTxtPreview(null));
    } else if (lowerName.endsWith('.pdf')) {
      DocIndexer.getPdfPreview(toPath(item.uri)).then(text => setTxtPreview(text || null)).catch(() => setTxtPreview(null));
    } else if (lowerName.endsWith('.docx')) {
      readDocxPreview(toPath(item.uri)).then(setTxtPreview).catch(() => setTxtPreview(null));
    }
  }

  async function loadPickerDir(path: string) {
    setPickerLoading(true);
    try {
      const dir = new FileSystem.Directory(path.endsWith('/') ? path : path + '/');
      const contents = dir.list();
      const folders = contents
        .filter((item: any) => item instanceof FileSystem.Directory)
        .map((item: any) => { const raw = item.uri.split('/').filter(Boolean).pop() ?? ''; let name = raw; try { name = decodeURIComponent(raw); } catch {} return { name, uri: item.uri, isDirectory: true }; })
        .filter((f: any) => !f.name.startsWith('.'))
        .sort((a: any, b: any) => nameCollator.compare(a.name, b.name));
      const files = contents
        .filter((item: any) => item instanceof FileSystem.File)
        .map((item: any) => ({ name: (() => { try { return decodeURIComponent(item.name); } catch { return item.name; } })(), uri: item.uri, isDirectory: false }))
        .filter((f: any) => !f.name.startsWith('.'))
        .sort((a: any, b: any) => nameCollator.compare(a.name, b.name));
      setPickerItems(folders);
      setPickerFiles(files);
    } catch { setPickerItems([]); setPickerFiles([]); }
    finally { setPickerLoading(false); }
  }

  function openPicker(mode: 'copy' | 'move') {
    pendingItem.current = selectedItem;
    setPickerMode(mode);
    setPickerPath(ROOT_PATH);
    loadPickerDir(ROOT_PATH);
    setShowPicker(true);
    closeSheet();
  }

  async function handlePaste() {
    const item = pendingItem.current;
    if (!item) return;
    const destDir = pickerPath.endsWith('/') ? pickerPath : pickerPath + '/';
    const destUri = destDir + item.name;
    const src = toPath(item.uri);
    const dst = toPath(destUri);
    const exists = await RNFS.exists(dst);
    if (exists) {
      Alert.alert(tc.fileExists, tf.existsInFolder(item.name));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    setShowPicker(false);
    setPasting(true);
    setCopyProgress(0);
    const sub = addCopyProgressListener(({ percent }) => setCopyProgress(percent));
    try {
      if (pickerMode === 'copy') {
        await copyFileStream(item.uri, dst);
        await scanFile(dst).catch(() => {});
        Alert.alert(tf.success, tf.copiedOk(item.name));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        await moveFileStream(src, dst);
        await syncPathReferences(item.uri, destUri, item.name);
        await scanFile(dst).catch(() => {});
        await recordActivity({
          action: 'moved',
          name: item.name,
          from: readableFolder(item.uri),
          to: readableFolder(dst),
          source: 'Search',
        });
        if (item.inFolder) { removeFolderItem(item.uri); }
        else { removeResult(item.uri); }
        Alert.alert(tf.success, tf.movedOk(item.name));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch {
      Alert.alert(tc.error, tf.couldNotCopyOrMoveFile(pickerMode === 'copy'));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      sub.remove();
      setCopyProgress(null);
      setPasting(false);
    }
  }

  async function handleRename() {
    if (!selectedItem || !renameValue.trim() || renaming) return;
    setRenaming(true);
    const uri = selectedItem.uri.endsWith('/') ? selectedItem.uri.slice(0, -1) : selectedItem.uri;
    const parentPath = uri.substring(0, uri.lastIndexOf('/') + 1);
    const newUri = parentPath + renameValue.trim();
    const oldUri = selectedItem.uri;
    const newName = renameValue.trim();
    const wasInFolder = selectedItem.inFolder;
    try {
      const invalidChars = /[*\/\\:?"<>|]/;
      if (invalidChars.test(newName)) {
        Alert.alert(tf.invalidName, 'File names cannot contain: * / \\ : ? " < > |');
        return;
      }
      const destExists = await RNFS.exists(toPath(newUri));
      if (destExists) {
        Alert.alert(tf.nameTaken, tf.fileNamedExistsFolder(newName));
        return;
      }
      await RNFS.moveFile(toPath(oldUri), toPath(newUri));
      await syncPathReferences(oldUri, newUri, newName);
      await recordActivity({
        action: 'renamed',
        name: oldUri.slice(oldUri.lastIndexOf('/') + 1),
        newName,
        to: readableFolder(newUri),
        source: 'Search',
      });
      // Register the new path, then clear the old one — scanning a path that
      // no longer exists makes MediaStore drop the stale row.
      await scanFile(toPath(newUri)).catch(() => {});
      await scanFile(toPath(oldUri)).catch(() => {});
      if (wasInFolder) {
        setFolderStack(prev => prev.map((f, i) =>
          i === prev.length - 1
            ? { ...f, items: f.items.map(item => item.uri === oldUri ? { ...item, name: newName, uri: newUri } : item) }
            : f
        ));
      } else {
        setResults(prev => prev.map(f => f.uri === oldUri ? { ...f, name: newName, uri: newUri } : f));
      }
      closeSheet();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert(tf.renameFailed, tk.couldNotRenameFile);
    } finally {
      setRenaming(false);
    }
  }

  async function handleShare() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!selectedItem) return;
    closeSheet();
    try {
      await Sharing.shareAsync(selectedItem.uri, { mimeType: getMimeType(selectedItem.name), dialogTitle: selectedItem.name });
    } catch (e) {}
  }

  async function handleShareViaQr() {
    if (!selectedItem) return;
    closeSheet();
    try {
      // A link to this one file only, not the whole phone, and it expires after an hour.
      const fileUrl = await shareFileViaWifi(selectedItem.uri.replace('file://', ''));
      setQrUrl(fileUrl);
      setQrModalVisible(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (e: any) {
      if (e?.code === WIFI_NO_NETWORK) {
        Alert.alert(tf.noWifi, tf.connectWifi);
      } else {
        Alert.alert(tc.error, tf.couldNotStartWifi);
      }
    }
  }

  async function handleCopyImage() {
    if (!selectedItem) return;
    try {
      await copyImageToClipboard(toPath(selectedItem.uri), 'image/*');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(tf.copied, tf.imageCopied);
      closeSheet();
    } catch {
      Alert.alert(tc.error, tf.couldNotCopyImage);
    }
  }

  async function handleMoveToVault() {
    if (!selectedItem) return;
    Alert.alert(
      tf.moveToVault,
      tf.moveOneToVaultMsg(selectedItem.name),
      [
        { text: tc.cancel, style: 'cancel' },
        { text: tf.moveToVault, onPress: async () => {
          const uri = selectedItem.uri;
          const name = selectedItem.name;
          const inFolder = selectedItem.inFolder;
          closeSheet();
          if (await vaultHas(name)) {
            Alert.alert(
              tf.alreadyInVault,
              tf.alreadyInVaultMsg(name)
            );
            return;
          }
          setMovingUri(uri);
          const ok = await addToVault(uri, name);
          setMovingUri(null);
          if (ok) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            DocIndexer.removeFromIndex(uri);
            if (inFolder) { removeFolderItem(uri); }
            else { removeResult(uri); }
            Alert.alert(tf.movedToVault, tf.isNowSecured(name));
          } else {
            Alert.alert(tc.error, tf.couldNotVault);
          }
        }},
    ]);
  }

  async function handleDelete() {
    if (!selectedItem) return;
    Alert.alert(tf.moveToTrash, tf.trashOneMsg(selectedItem.name), [
      { text: tc.cancel, style: 'cancel' },
      { text: tf.moveToTrash, style: 'destructive', onPress: async () => {
        closeSheet();
        const ok = await moveToTrash(selectedItem.uri, selectedItem.name);
        if (ok) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          await removeFavourite(selectedItem.uri);
          DocIndexer.removeFromIndex(selectedItem.uri);
          if (selectedItem.inFolder) { removeFolderItem(selectedItem.uri); }
          else { removeResult(selectedItem.uri); }
        } else {
          Alert.alert(tc.error, tf.couldNotTrash);
        }
      }},
    ]);
  }

  async function handleToggleFavourite() {
    if (!selectedItem) return;
    if (isFav) {
      await removeFavourite(selectedItem.uri);
      setIsFav(false);
      Alert.alert(tk.removedFromFavourites, tk.removedShort(selectedItem.name));
    } else {
      await addFavourite({ name: selectedItem.name, uri: selectedItem.uri });
      setIsFav(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      Alert.alert(tk.addedToFavourites, tk.addedShort(selectedItem.name));
    }
  }

  const [folderStack, setFolderStack] = useState<{ name: string; uri: string; items: { name: string; uri: string; isDirectory: boolean }[] }[]>([]);
  const [folderLoading, setFolderLoading] = useState(false);

  async function openFolder(item: { name: string; uri: string }) {
    if (query.trim().length >= 2) {
      addRecentSearch(query.trim());
      setRecentSearches(getRecentSearches());
    }
    setFolderLoading(true);
    try {
      const dir = new FileSystem.Directory(item.uri);
      const contents = dir.list();
      const items = contents
        .map(f => ({
          name: f instanceof FileSystem.File ? f.name : f.uri.split('/').filter(Boolean).pop() ?? '',
          uri: f.uri,
          isDirectory: f instanceof FileSystem.Directory,
        }))
        .filter(f => !f.name.startsWith('.'))
        .sort((a, b) => {
          if (a.isDirectory && !b.isDirectory) return -1;
          if (!a.isDirectory && b.isDirectory) return 1;
          return nameCollator.compare(a.name, b.name);
        });
      setFolderStack(prev => [...prev, { name: item.name, uri: item.uri, items }]);
    } catch (e) {}
    finally { setFolderLoading(false); }
  }

  function popFolder() {
    setFolderStack(prev => prev.slice(0, -1));
  }

  function removeFolderItem(uri: string) {
    setFolderStack(prev => prev.map((f, i) =>
      i === prev.length - 1 ? { ...f, items: f.items.filter(item => item.uri !== uri) } : f
    ));
  }

  function handleSearchChange(text: string) {
    setQuery(text);
    if (text.length === 0) setRecentSearches(getRecentSearches());
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => search(text, typeFilter), 300);
  }

  function handleSearchSubmit() {
    const q = query.trim();
    if (q.length >= 2) {
      addRecentSearch(q);
      setRecentSearches(getRecentSearches());   // refresh chips immediately
    }
  }

  async function handleAsk(question?: string) {
    const q = question ?? aiQuery;
    if (q.trim().length < 3) return;

    // A free user's question never reaches the backend: only the free
    // questions are asked, and only answered on the phone.
    const free = !isPro;

    if (free && !isFreeQuestion(q)) {
      router.push('/(tabs)/cloud');
      return;
    }

    Keyboard.dismiss();

    // Before the storage scan has found any files, the free questions would
    // be answered from empty lists: "I can't see any files on your device".
    if (free && (storageLoading || !largestFiles?.overall?.length)) {
      setLocalAnswer(ts.stillReading);
      return;
    }

    // Clear first. The answer box renders localAnswer || answer, so a
    // previous local answer would otherwise show while a new question is
    // still in flight -- or for ever, if that question fails.
    setLocalAnswer('');
    // 200 rather than the full 500: a week's window rarely needs more, and
    // it is an in-memory slice after the log's first read.
    const activity = await recentActivity(200);
    // null on a first run, a second ask the same day, or a change under
    // 500 MB -- in which case the trend matcher simply does not fire.
    const change = await storageChange(storageInfo?.usedBytes ?? 0);

    // The numbers are already exact on this device. Only questions that
    // need judgement rather than arithmetic should cost a request.
    const local = answerLocally(q, {
      storageInfo,
      fileCounts,
      folderSizes,
      mediaContext,
      largestFiles,
      documentExtensions,
      activity,
      storageTrend: change?.sentence ?? null,
    }, lang);

    if (local) {
      setLocalAnswer(local);
      return;
    }

    if (free) {
      // Answered on the phone or not at all: the storage scan has not finished.
      setLocalAnswer(ts.stillReading);
      return;
    }

    const context = buildContext(storageInfo, fileCounts, folderSizes, largestFiles);
    await ask(q, context);
  }

  async function openFile(name: string, uri: string) {
    if (query.trim().length >= 2) {
      addRecentSearch(query.trim());
      setRecentSearches(getRecentSearches());
    }
    await addRecent({ name, uri, openedAt: Date.now() });
    recordOpen(uri);
    if (isImageFile(name)) {
      setViewerUri(uri);
      return;
    }
    if (isVideoFile(name)) {
      setPlayerUri(uri);
      return;
    }
    setOpeningUri(uri);
    const mime = getMimeType(name);
    try {
      await openFileNative(toPath(uri), mime);
    } catch (e) {
      try {
        const cachePath = `${RNFS.CachesDirectoryPath}/${name}`;
        await RNFS.copyFile(toPath(uri), cachePath);
        await openFileNative(cachePath, mime);
      } catch (e2) {}
    }
    setOpeningUri(null);
  }

  function handleSuggestion(s: string) {
    // Shown in the user's language; the English question is what gets answered.
    setAiQuery(ts.question(s));
    handleAsk(s);
  }

  function handleAskAgain() {
    setAiQuery('');
    setLocalAnswer('');
    reset();
  }

  function handleSmartQueryChange(text: string) {
    setSmartQuery(text);
    if (smartTimeout.current) clearTimeout(smartTimeout.current);
    if (text.trim().length < 2) { setSmartResults([]); return; }
    smartTimeout.current = setTimeout(() => runSmartSearch(text), 400);
  }
  
  async function runSmartSearch(q: string) {
    setSmartSearching(true);
    try {
      const results = await DocIndexer.searchFiles(q);
      setSmartResults(results);
    } catch {
      setSmartResults([]);
    } finally {
      setSmartSearching(false);
    }
  }

  async function handleIndexNow() {
    if (indexing) return;
    setIndexing(true);
    try {
      const { queryDocuments } = require('media-store');
      const allDocs = await queryDocuments();
      const unindexed: { uri: string; name: string }[] = [];
      for (const doc of allDocs) {
        if (unindexed.length >= 200) break;
        const alreadyIndexed = await DocIndexer.isIndexed(doc.uri);
        if (!alreadyIndexed) {
          unindexed.push({ uri: doc.uri, name: doc.name });
        }
      }
      await DocIndexer.indexFiles(unindexed);
    } catch {} finally {
      setIndexing(false);
      try {
        const count = await DocIndexer.getIndexCount();
        setIndexCount(count);
      } catch {}
    }
  }
  
  function highlightSnippet(snippet: string, query: string): React.ReactElement {
    if (!query.trim()) return <Text style={[styles.smartSnippet, { color: colors.textMuted }]}>{snippet}</Text>;
    const lower = snippet.toLowerCase();
    const lowerQ = query.toLowerCase();
    const idx = lower.indexOf(lowerQ);
    if (idx < 0) return <Text style={[styles.smartSnippet, { color: colors.textMuted }]}>{snippet}</Text>;
    const before = snippet.slice(0, idx);
    const match = snippet.slice(idx, idx + query.length);
    const after = snippet.slice(idx + query.length);
    return (
      <Text style={[styles.smartSnippet, { color: colors.textMuted }]}>
        {before}<Text style={[styles.smartHighlight, { backgroundColor: colors.blue + '33', color: colors.blue }]}>{match}</Text>{after}
      </Text>
    );
  }

  return (
    <SafeAreaView edges={['left', 'right']} style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { flexDirection: 'row', alignItems: 'center' }]}>
        <TouchableOpacity onPress={() => router.push('/(tabs)')} style={{ width: 40, height: 40, justifyContent: 'center', marginRight: 8 }}>
          <Ionicons name="home-outline" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>{ts.search}</Text>
      </View>
      {pasting && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: colors.surface }}>
          <ActivityIndicator size="small" color={colors.blue} />
          <Text style={{ fontSize: 13, color: colors.textSecondary }}>
            {pickerMode === 'copy' ? tf.copying : tf.moving} {pendingItem.current?.name}
            {copyProgress !== null && copyProgress > 0 ? ` ${copyProgress}%` : '...'}
          </Text>
        </View>
      )}
      <View style={[styles.modeToggle, { backgroundColor: colors.surface }]}>
        <TouchableOpacity
          style={[styles.modeBtn, mode === 'search' && [styles.modeBtnActive, { backgroundColor: colors.card }]]}
          onPress={() => setMode('search')}
        >
          <Ionicons name="search-outline" size={14} color={mode === 'search' ? colors.blue : colors.textMuted} style={{ marginRight: 4 }} />
          <Text style={[styles.modeBtnText, { color: colors.textMuted }, mode === 'search' && { color: colors.blue }]}>{ts.search}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeBtn, mode === 'ask' && [styles.modeBtnActive, { backgroundColor: colors.card }]]}
          onPress={() => setMode('ask')}
        >
          <Ionicons name="sparkles-outline" size={14} color={mode === 'ask' ? colors.blue : colors.textMuted} style={{ marginRight: 4 }} />
          <Text style={[styles.modeBtnText, { color: colors.textMuted }, mode === 'ask' && { color: colors.blue }]}>{ts.askAi}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeBtn, mode === 'smart' && [styles.modeBtnActive, { backgroundColor: colors.card }]]}
          onPress={() => {
            if (!isPro) { router.push('/(tabs)/cloud'); return; }
            setMode('smart');
          }}
        >
            <Ionicons name="document-text-outline" size={14} color={mode === 'smart' ? colors.blue : colors.textMuted} style={{ marginRight: 4 }} />
            <Text style={[styles.modeBtnText, { color: colors.textMuted }, mode === 'smart' && { color: colors.blue }]}>{ts.smart}</Text>
          </TouchableOpacity>
      </View>

      {mode === 'search' ? (
        <>
          <View style={[styles.inputWrap, { backgroundColor: colors.surface }]}>
            <Ionicons name="search-outline" size={16} color={colors.textMuted} style={{ marginRight: 8 }} />
            <TextInput
              ref={searchInputRef}
              style={[styles.input, { color: colors.textPrimary }]}
              placeholder={ts.searchFilesPh}
              placeholderTextColor={colors.textMuted}
              value={query}
              onChangeText={handleSearchChange}
              autoCorrect={false}
              autoCapitalize="none"
              onSubmitEditing={handleSearchSubmit}
              returnKeyType="search"
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => { setQuery(''); search(''); setTypeFilter(''); setRecentSearches(getRecentSearches()); }}>
                <Ionicons name="close-circle" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>
          {query.length >= 2 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ flexGrow: 0, flexShrink: 0, height: 40 }}
                contentContainerStyle={{ paddingHorizontal: 16, gap: 8, alignItems: 'center' }}
                keyboardShouldPersistTaps="handled"
              >
                {([['', 'All'], ['image', 'Images'], ['video', 'Videos'], ['audio', 'Audio'], ['doc', 'Docs'], ['other', 'Other']] as const)
                  .map(([key, label]) => {
                    const active = typeFilter === key;
                    return (
                      <TouchableOpacity
                        key={key}
                        onPress={() => { setTypeFilter(key); search(query, key); }}
                        style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, flexShrink: 0, backgroundColor: active ? colors.blue : colors.surface }}
                        activeOpacity={0.7}
                      >
                        <Text style={{ fontSize: 12, fontWeight: '500', lineHeight: 16, color: active ? '#fff' : colors.textSecondary }} numberOfLines={1}>{ts.filter[label] ?? label}</Text>
                      </TouchableOpacity>
                    );
                  })}
              </ScrollView>
            )}
          {searching ? (
            <View style={styles.centered}>
              <ActivityIndicator color={colors.blue} />
              <Text style={[styles.hint, { color: colors.textMuted }]}>{ts.searching}</Text>
            </View>
          ) : query.length < 2 ? (
            recentSearches.length === 0 || historyHidden ? (
              <View style={styles.centered}>
                <Ionicons name="search-outline" size={40} color={colors.textDisabled} />
                <Text style={[styles.hint, { color: colors.textMuted }]}>
                  {historyHidden ? ts.historyHidden : ts.typeTwoChars}
                </Text>
                {historyHidden && recentSearches.length > 0 && (
                  <TouchableOpacity onPress={() => setHistoryHidden(false)} style={{ marginTop: 8 }}>
                    <Text style={[styles.hint, { color: colors.blue }]}>{ts.showHistory}</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <FlatList
                data={recentSearches}
                keyExtractor={item => item.query}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                ListHeaderComponent={
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 12 }}>
                    <Text style={[styles.resultCount, { color: colors.textMuted, flex: 1 }]} numberOfLines={1}>{ts.recentSearches}</Text>
                    <View style={{ flexDirection: 'row', gap: 16, flexShrink: 0 }}>
                      <TouchableOpacity onPress={() => setHistoryHidden(true)}>
                        <Text style={{ fontSize: 12, color: colors.textMuted }}>{tf.hide}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => {
                        clearRecentSearches();
                        setRecentSearches([]);
                      }}>
                        <Text style={{ fontSize: 12, color: colors.blue }}>{ts.clear}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                }
                renderItem={({ item, index }) => {
                  const group = getDateGroup(item.searchedAt);
                  const prevGroup = index > 0 ? getDateGroup(recentSearches[index - 1].searchedAt) : null;
                  const showHeader = group !== prevGroup;
                  return (
                    <View key={item.query}>
                      {showHeader && (
                        <Text style={[styles.suggestionsLabel, { color: colors.textMuted, marginTop: index === 0 ? 0 : 12 }]}>
                          {group}
                        </Text>
                      )}
                      <TouchableOpacity
                        style={[styles.row, { borderBottomColor: colors.border }]}
                        onPress={() => {
                          setQuery(item.query);
                          setTypeFilter('');
                          search(item.query, '');
                          addRecentSearch(item.query);
                          setRecentSearches(getRecentSearches());
                        }}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="time-outline" size={18} color={colors.textMuted} style={{ marginRight: 12 }} />
                        <Text style={[styles.fileName, { flex: 1, color: colors.textPrimary }]} numberOfLines={1}>{item.query}</Text>
                        <TouchableOpacity
                          onPress={() => {
                            removeRecentSearch(item.query);
                            setRecentSearches(getRecentSearches());
                          }}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Ionicons name="close" size={16} color={colors.textMuted} />
                        </TouchableOpacity>
                      </TouchableOpacity>
                    </View>
                  );
                }}
              />
            )
          ) : results.length === 0 ? (
            <View style={styles.centered}>
              <Ionicons name="document-outline" size={40} color={colors.textDisabled} />
              <Text style={[styles.hint, { color: colors.textMuted }]}>{ts.noFilesFor(query)}</Text>
            </View>
          ) : (
            <FlatList
              data={results}
              keyExtractor={item => item.uri}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              ListHeaderComponent={
                <Text style={[styles.resultCount, { color: colors.textMuted }]}>
                  {ts.nResults(results.length)}
                </Text>
              }
              renderItem={({ item }) => {
                const color = item.isDirectory ? colors.yellow : getFileColor(item.name);
                const ext = item.name.split('.').pop()?.toUpperCase() ?? '?';
                return (
                  <TouchableOpacity
                    style={[styles.row, { borderBottomColor: colors.border }]}
                    onPress={() => item.isDirectory ? openFolder(item) : openFile(item.name, item.uri)}
                    onLongPress={() => {
                      if (item.isDirectory) return;
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      openSheet(item);
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.fileIcon, { backgroundColor: color + '22', overflow: 'hidden' }]}>
                      {item.isDirectory ? (
                        <Ionicons name="folder" size={22} color={color} />
                      ) : isImageFile(item.name) ? (
                        <Thumb uri={item.uri} style={styles.thumbnail} bg={colors.surface} iconColor={colors.textSecondary} />
                      ) : isVideoFile(item.name) ? (
                        <VideoThumb uri={item.uri} style={styles.thumbnail} />
                      ) : (
                        <Ionicons name={getFileIcon(item.name) as any} size={20} color={color} />
                      )}
                    </View>
                    <View style={styles.fileInfo}>
                      <Text style={[styles.fileName, { color: colors.textPrimary }]} numberOfLines={1}>{item.name}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <Text style={[styles.fileMeta, { color: colors.textMuted }]}>{item.isDirectory ? tf.folder : ts.fileOfType(ext)}</Text>
                        {favSet.has(item.uri) && (
                          <Ionicons name="heart" size={12} color="#E24B4A" />
                        )}
                        {(fileTagsMap[item.uri] ?? []).map(tagId => {
                          const tag = tags.find(t => t.id === tagId);
                          if (!tag) return null;
                          return (
                            <View key={tagId} style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10, backgroundColor: tag.color + '22' }}>
                              <Ionicons name={tag.icon as any} size={10} color={tag.color} />
                              <Text style={{ fontSize: 10, color: tag.color, fontWeight: '500' }}>{tag.name}</Text>
                            </View>
                          );
                        })}
                      </View>
                    </View>
                    {!item.isDirectory && (
                      movingUri === item.uri
                        ? <ActivityIndicator size="small" color={colors.blue} />
                        : openingUri === item.uri
                        ? <ActivityIndicator size="small" color={colors.blue} />
                        : <TouchableOpacity onPress={() => openSheet(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <Ionicons name="ellipsis-vertical" size={16} color={colors.textMuted} />
                          </TouchableOpacity>
                    )}
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </>
      ) : mode === 'ask' ? (
        <>
          {!isPro && !proLoading ? (
            <TouchableOpacity
              style={[styles.inputWrap, { backgroundColor: colors.surface }]}
              onPress={() => router.push('/(tabs)/cloud')}
              activeOpacity={0.7}
            >
              <Ionicons name="sparkles-outline" size={16} color={colors.textMuted} style={{ marginRight: 8 }} />
              <Text style={[styles.input, { color: colors.textMuted, textAlignVertical: 'center' }]} numberOfLines={1}>
                {ts.askOwnWordsPro}
              </Text>
              <Ionicons name="lock-closed-outline" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          ) : (
          <View style={[styles.inputWrap, { backgroundColor: colors.surface }]}>
            <Ionicons name="sparkles-outline" size={16} color={colors.textMuted} style={{ marginRight: 8 }} />
            <TextInput
              style={[styles.input, { color: colors.textPrimary }]}
              placeholder={ts.askAnythingPh}
              placeholderTextColor={colors.textMuted}
              value={aiQuery}
              onChangeText={setAiQuery}
              onSubmitEditing={() => cooldown === 0 && handleAsk()}
              returnKeyType="send"
              editable={isPro}
            />
            <>
            {aiQuery.length > 0 ? (
                <TouchableOpacity onPress={() => handleAsk()} disabled={thinking || cooldown > 0} style={{ opacity: (thinking || cooldown > 0) ? 0.4 : 1 }}>
                  {cooldown > 0
                    ? <Text style={{ fontSize: 11, fontWeight: '600', color: colors.textMuted, width: 20, textAlign: 'center' }}>{cooldown}s</Text>
                    : <Ionicons name="send" size={16} color={colors.blue} />
                  }
                </TouchableOpacity>
              ) : (
                <View>
                {micTooltip && (
                  <View style={{
                    position: 'absolute',
                    bottom: 32,
                    right: 0,
                    backgroundColor: dark ? '#fff' : '#222',
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 10,
                    width: 200,
                    zIndex: 100,
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.15,
                    shadowRadius: 6,
                    elevation: 6,
                  }}>
                  <Text style={{ color: dark ? '#111' : '#fff', fontSize: 12, fontWeight: '600', marginBottom: 3 }}>
                    {ts.micNeeded}
                  </Text>
                  <Text style={{ color: dark ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.75)', fontSize: 11 }}>
                    {ts.micVoiceSearch}
                  </Text>
                    <View style={{
                      position: 'absolute',
                      bottom: -5,
                      right: 6,
                      width: 10,
                      height: 10,
                      backgroundColor: dark ? '#fff' : '#222',
                      transform: [{ rotate: '45deg' }],
                    }} />
                  </View>
                )}
                <TouchableOpacity onPress={toggleListening} style={{ opacity: thinking ? 0.4 : 1 }} disabled={thinking}>
                  <Ionicons name={listening ? 'stop-circle' : 'mic-outline'} size={18} color={listening ? colors.deleteRed : colors.textMuted} />
                </TouchableOpacity>
              </View>
              )}
            </>
          </View>
          )}

          {thinking ? (
            <View style={styles.centered}>
              <ActivityIndicator color={colors.blue} />
              <Text style={[styles.hint, { color: colors.textMuted }]}>{ts.thinking}</Text>
            </View>
          ) : (localAnswer || answer).length > 0 ? (
            <ScrollView style={styles.answerScroll} contentContainerStyle={styles.answerScrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={[styles.answerWrap, { backgroundColor: colors.blueBg }]}>
                <View style={styles.answerHeader}>
                  <Ionicons name="sparkles-outline" size={16} color={colors.blue} />
                  <Text style={[styles.answerLabel, { color: colors.blue }]}>{ts.askFilesAi}</Text>
                </View>
                <Text style={[styles.answerText, { color: colors.textPrimary }]}>{localAnswer || answer}</Text>
              </View>
              <TouchableOpacity style={[styles.askAgainBtn, { backgroundColor: colors.surface }]} onPress={handleAskAgain}>
                <Ionicons name="sparkles-outline" size={14} color={colors.textSecondary} style={{ marginRight: 6 }} />
                <Text style={[styles.askAgainText, { color: colors.textSecondary }]}>{ts.askSomethingElse}</Text>
              </TouchableOpacity>
              <>
                <Text style={[styles.suggestionsLabel, { color: colors.textMuted }]}>{ts.tryThese}</Text>
                <View style={styles.suggestions}>
                  {askSuggestions.map(s => (
                    <TouchableOpacity key={s} style={[styles.suggestion, { backgroundColor: colors.surface }]} onPress={() => handleSuggestion(s)}>
                      <Text style={[styles.suggestionText, { color: colors.textSecondary }]}>{ts.question(s)}</Text>
                      <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
                    </TouchableOpacity>
                  ))}
                </View>
                {!isPro && !proLoading && (
                  <>
                    <Text style={[styles.suggestionsLabel, { color: colors.textMuted, marginTop: 12 }]}>{ts.withPro}</Text>
                    <View style={styles.suggestions}>
                      {PRO_EXAMPLES.map(s => (
                        <TouchableOpacity key={s} style={[styles.suggestion, { backgroundColor: colors.surface }]} onPress={() => router.push('/(tabs)/cloud')}>
                          <Text style={[styles.suggestionText, { color: colors.textMuted }]}>{ts.question(s)}</Text>
                          <Ionicons name="lock-closed-outline" size={14} color={colors.textMuted} />
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                )}
              </>
            </ScrollView>
          ) : (
            <ScrollView contentContainerStyle={styles.suggestionsScroll} showsVerticalScrollIndicator={false}>
              <>
                <View style={styles.centeredContent}>
                  <Ionicons name="sparkles-outline" size={40} color={colors.textDisabled} />
                  <Text style={[styles.hint, { color: colors.textMuted }]}>
                    {isPro ? ts.askAboutPlain : ts.freeHint}
                  </Text>
                </View>
                <View style={styles.suggestions}>
                  {askSuggestions.map(s => (
                    <TouchableOpacity key={s} style={[styles.suggestion, { backgroundColor: colors.surface }]} onPress={() => handleSuggestion(s)}>
                      <Text style={[styles.suggestionText, { color: colors.textSecondary }]}>{ts.question(s)}</Text>
                      <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
                    </TouchableOpacity>
                  ))}
                </View>
                {!isPro && !proLoading && (
                  <>
                    <Text style={[styles.suggestionsLabel, { color: colors.textMuted, marginTop: 12 }]}>{ts.withPro}</Text>
                    <View style={styles.suggestions}>
                      {PRO_EXAMPLES.map(s => (
                        <TouchableOpacity key={s} style={[styles.suggestion, { backgroundColor: colors.surface }]} onPress={() => router.push('/(tabs)/cloud')}>
                          <Text style={[styles.suggestionText, { color: colors.textMuted }]}>{ts.question(s)}</Text>
                          <Ionicons name="lock-closed-outline" size={14} color={colors.textMuted} />
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                )}
              </>
            </ScrollView>
          )}
       </>
      ) : mode === 'smart' ? (
        /* ── Smart Search Tab ── */
        <>
          <View style={[styles.inputWrap, { backgroundColor: colors.surface }]}>
            <Ionicons name="document-text-outline" size={16} color={colors.textMuted} style={{ marginRight: 8 }} />
            <TextInput
              style={[styles.input, { color: colors.textPrimary }]}
              placeholder={ts.searchInsideDocsPh}
              placeholderTextColor={colors.textMuted}
              value={smartQuery}
              onChangeText={handleSmartQueryChange}
              autoCorrect={false}
              autoCapitalize="none"
            />
            {smartQuery.length > 0 && (
              <TouchableOpacity onPress={() => { setSmartQuery(''); setSmartResults([]); }}>
                <Ionicons name="close-circle" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>
          {smartSearching ? (
            <View style={styles.centered}>
              <ActivityIndicator color={colors.blue} />
              <Text style={[styles.hint, { color: colors.textMuted }]}>{ts.searchingContent}</Text>
            </View>
          ) : smartQuery.length < 2 ? (
            <View style={styles.centered}>
              {indexing ? (
                <>
                  <ActivityIndicator color={colors.blue} />
                  <Text style={[styles.hint, { color: colors.textMuted }]}>{ts.readingDocs}</Text>
                </>
              ) : (
                <>
                  <Ionicons name="document-text-outline" size={40} color={colors.textDisabled} />
                  <Text style={[styles.hint, { color: colors.textMuted }]}>{ts.searchInsideDocs}</Text>
                  <Text style={[styles.hint, { color: colors.textMuted, fontSize: 11 }]}>
                    {indexCount > 0 ? ts.readyToSearch(indexCount) : ts.docTypes}
                  </Text>
                </>
              )}
            </View>
          ) : smartResults.length === 0 ? (
            <View style={styles.centered}>
              <Ionicons name="search-outline" size={40} color={colors.textDisabled} />
              <Text style={[styles.hint, { color: colors.textMuted }]}>{ts.noDocsContain(smartQuery)}</Text>
              <Text style={[styles.hint, { color: colors.textMuted, fontSize: 11 }]}>{ts.cantFindDoc}</Text>
            </View>
          ) : (
            <FlatList
              data={smartResults}
              keyExtractor={item => item.uri}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              ListHeaderComponent={
                <Text style={[styles.resultCount, { color: colors.textMuted }]}>
                  {ts.nDocsMatch(smartResults.length)}
                </Text>
              }
              renderItem={({ item }) => {
                const color = getFileColor(item.name);
                return (
                  <TouchableOpacity
                    style={[styles.smartRow, { borderBottomColor: colors.border }]}
                    onPress={() => openFile(item.name, item.uri)}
                    onLongPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      openSheet(item);
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.fileIcon, { backgroundColor: color + '22' }]}>
                      <Ionicons name={getFileIcon(item.name) as any} size={20} color={color} />
                    </View>
                    <View style={styles.fileInfo}>
                      <Text style={[styles.fileName, { color: colors.textPrimary }]} numberOfLines={1}>{item.name}</Text>
                      {highlightSnippet(item.snippet, smartQuery)}
                    </View>
                    {openingUri === item.uri
                      ? <ActivityIndicator size="small" color={colors.blue} />
                      : <TouchableOpacity onPress={() => openSheet(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <Ionicons name="ellipsis-vertical" size={16} color={colors.textMuted} />
                        </TouchableOpacity>
                    }
                  </TouchableOpacity>
                );
              }}
            />
          )}
          </>
      ) : null}
  
      <Modal visible={folderStack.length > 0} transparent={false} animationType="slide" onRequestClose={popFolder}>
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
          {folderStack.length > 0 && (() => {
            const current = folderStack[folderStack.length - 1];
            return (
              <>
                <View style={[styles.folderHeader, { backgroundColor: colors.background }]}>
                  <TouchableOpacity onPress={popFolder} style={styles.folderBackBtn}>
                    <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
                  </TouchableOpacity>
                  <Text style={[styles.folderTitle, { color: colors.textPrimary }]} numberOfLines={1}>{current.name}</Text>
                  <View style={{ width: 40 }} />
                </View>
                {folderLoading ? (
                  <View style={styles.centered}><ActivityIndicator color={colors.blue} /></View>
                ) : current.items.length === 0 ? (
                  <View style={styles.centered}>
                    <Ionicons name="folder-open-outline" size={40} color={colors.textDisabled} />
                    <Text style={[styles.hint, { color: colors.textMuted }]}>{ts.folderIsEmpty}</Text>
                  </View>
                ) : (
                  <FlatList
                    data={current.items}
                    keyExtractor={item => item.uri}
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                    renderItem={({ item }) => {
                      const color = item.isDirectory ? colors.yellow : getFileColor(item.name);
                      const ext = item.name.split('.').pop()?.toUpperCase() ?? '?';
                      return (
                        <TouchableOpacity
                          style={[styles.row, { borderBottomColor: colors.border }]}
                          onPress={() => item.isDirectory ? openFolder(item) : openFile(item.name, item.uri)}
                          onLongPress={() => !item.isDirectory && openSheet({ ...item, inFolder: true })}
                          activeOpacity={0.7}
                        >
                          <View style={[styles.fileIcon, { backgroundColor: color + '22', overflow: 'hidden' }]}>
                            {item.isDirectory ? (
                              <Ionicons name="folder" size={22} color={color} />
                            ) : isImageFile(item.name) ? (
                              <Thumb uri={item.uri} style={styles.thumbnail} bg={colors.surface} iconColor={colors.textSecondary} />
                            ) : isVideoFile(item.name) ? (
                              <VideoThumb uri={item.uri} style={styles.thumbnail} />
                            ) : (
                              <Ionicons name={getFileIcon(item.name) as any} size={20} color={color} />
                            )}
                          </View>
                          <View style={styles.fileInfo}>
                            <Text style={[styles.fileName, { color: colors.textPrimary }]} numberOfLines={1}>{item.name}</Text>
                            <Text style={[styles.fileMeta, { color: colors.textMuted }]}>{item.isDirectory ? tf.folder : ts.fileOfType(ext)}</Text>
                          </View>
                          {!item.isDirectory && (
                            <TouchableOpacity onPress={() => openSheet({ ...item, inFolder: true })} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                              <Ionicons name="ellipsis-vertical" size={16} color={colors.textMuted} />
                            </TouchableOpacity>
                          )}
                        </TouchableOpacity>
                      );
                    }}
                  />
                )}
              </>
            );
          })()}
        </SafeAreaView>
      </Modal>

      <Modal visible={showSheet} transparent animationType="none" onRequestClose={closeSheet}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={SCREEN_WIDTH > SCREEN_HEIGHT ? undefined : Platform.OS === 'android' ? 'height' : 'padding'}>
          <Pressable style={styles.overlay} onPress={closeSheet}>
          <Animated.View
              style={SCREEN_WIDTH > SCREEN_HEIGHT
                ? [styles.sheetLandscape, { backgroundColor: colors.card, maxHeight: SCREEN_HEIGHT * 0.9 }]
                : [styles.sheet, { backgroundColor: colors.card, transform: [{ translateY: sheetAnim }], paddingBottom: insets.bottom + 16, paddingLeft: insets.left + 16, paddingRight: insets.right + 16, maxHeight: SCREEN_HEIGHT * 0.75 }]
              }
              {...(SCREEN_WIDTH > SCREEN_HEIGHT ? {} : panResponder.panHandlers)}
            >
              {SCREEN_WIDTH > SCREEN_HEIGHT
                ? <TouchableOpacity onPress={closeSheet} style={{ alignSelf: 'flex-end', padding: 4 }}><Ionicons name="close" size={20} color={colors.textMuted} /></TouchableOpacity>
                : <View style={[styles.sheetHandle, { backgroundColor: colors.textDisabled }]} />
              }
              <ScrollView showsVerticalScrollIndicator={true} contentContainerStyle={{ paddingBottom: 8 }} keyboardShouldPersistTaps="handled">
              <Pressable>
                <View style={styles.sheetHeader}>
                <View style={[styles.sheetIcon, { backgroundColor: getFileColor(selectedItem?.name ?? '') + '22' }]}>
                  {isImageFile(selectedItem?.name ?? '') ? (
                    <Image source={{ uri: selectedItem?.uri }} style={styles.sheetThumb} resizeMode="cover" />
                  ) : isVideoFile(selectedItem?.name ?? '') ? (
                    <VideoThumb uri={selectedItem?.uri ?? ''} style={styles.sheetThumb} />
                  ) : (
                    <Ionicons name={getFileIcon(selectedItem?.name ?? '') as any} size={22} color={getFileColor(selectedItem?.name ?? '')} />
                  )}
                </View>
                  <View style={styles.sheetFileInfo}>
                    <Text style={[styles.sheetFileName, { color: colors.textPrimary }]} numberOfLines={2}>{selectedItem?.name}</Text>
                    {fileSize && <Text style={[styles.sheetFileMeta, { color: colors.textMuted }]}>{fileSize}</Text>}
                  </View>
                  </View>
                <View style={[styles.sheetDivider, { backgroundColor: colors.border }]} />
                {txtPreview && (selectedItem?.name.toLowerCase().endsWith('.txt') || selectedItem?.name.toLowerCase().endsWith('.pdf') || selectedItem?.name.toLowerCase().endsWith('.docx')) && (
                  <View style={[styles.txtPreviewCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Text style={[styles.txtPreviewText, { color: colors.textSecondary }]} numberOfLines={3}>
                      {txtPreview}
                    </Text>
                  </View>
                )}
                <TouchableOpacity style={styles.sheetAction} onPress={handleShare}>
                  <Ionicons name="share-outline" size={20} color={colors.textPrimary} />
                  <Text style={[styles.sheetActionText, { color: colors.textPrimary }]}>{tc.share}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.sheetAction} onPress={handleShareViaQr}>
                  <Ionicons name="qr-code-outline" size={20} color={colors.textPrimary} />
                  <Text style={[styles.sheetActionText, { color: colors.textPrimary }]}>{tf.shareViaQr}</Text>
                </TouchableOpacity>
                {isImageFile(selectedItem?.name ?? '') && (
                  <TouchableOpacity style={styles.sheetAction} onPress={handleCopyImage}>
                    <Ionicons name="copy-outline" size={20} color={colors.textPrimary} />
                    <Text style={[styles.sheetActionText, { color: colors.textPrimary }]}>{tf.copyImage}</Text>
                  </TouchableOpacity>
                )}
                {isImageFile(selectedItem?.name ?? '') && (
                  <TouchableOpacity style={styles.sheetAction} onPress={() => {
                    if (!selectedItem) return;
                    const u = selectedItem.uri, n = selectedItem.name;
                    closeSheet();
                    router.push({ pathname: '/image-editor', params: { uri: u, name: n } });
                  }}>
                    <Ionicons name="create-outline" size={20} color={colors.textPrimary} />
                    <Text style={[styles.sheetActionText, { color: colors.textPrimary }]}>{tf.editImage}</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.sheetAction} onPress={isPro ? handleMoveToVault :
                  () => Alert.alert(tc.proFeature, tf.proVaultMsg, [
                    { text: tf.notNow, style: 'cancel' },
                    { text: tf.upgrade, onPress: () => router.push('/(tabs)/cloud') },
                  ])}>
                  <Ionicons name="shield-checkmark-outline" size={20} color={isPro ? colors.blue : colors.textMuted} />
                  <Text style={[styles.sheetActionText, { color: isPro ? colors.blue : colors.textMuted }]}>
                    {tf.moveToVault}{!isPro ? '  🔒' : ''}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.sheetAction} onPress={() => {
                  pendingItem.current = selectedItem;
                  closeSheet();
                  setTimeout(() => setShowTagPicker(true), 300);
                }}>
                  <Ionicons name="pricetag-outline" size={20} color={colors.purple} />
                  <Text style={[styles.sheetActionText, { color: colors.purple }]}>
                    {(fileTagsMap[selectedItem?.uri ?? '']?.length ?? 0) > 0
                      ? tf.tagsCount(fileTagsMap[selectedItem!.uri].length)
                      : tf.addTag}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.sheetAction} onPress={handleToggleFavourite}>
                  <Ionicons name={isFav ? 'heart' : 'heart-outline'} size={20} color={isFav ? colors.deleteRed : colors.textPrimary} />
                  <Text style={[styles.sheetActionText, { color: isFav ? colors.deleteRed : colors.textPrimary }]}>
                    {isFav ? tf.removeFromFavourites : tf.addToFavourites}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.sheetAction} onPress={async () => {
                  if (!selectedItem) return;
                  closeSheet();
                  const lines: { label: string; value: string }[] = [];
                  if (fileSize) lines.push({ label: tc.size, value: fileSize });
                  lines.push({ label: tc.type, value: tc.typeFile(selectedItem.name.split('.').pop()?.toUpperCase() ?? '?') });
                  lines.push({ label: tf.location, value: getFriendlyPath(selectedItem.uri, volumes) });
                  const stats = getStats(selectedItem.uri);
                  if (stats && stats.count > 0) {
                    lines.push({ label: tf.timesOpened, value: `${stats.count}` });
                    lines.push({ label: tf.lastOpened, value: formatDate(stats.lastOpened) });
                  }
                  const isMedia = isImageFile(selectedItem.name) || isVideoFile(selectedItem.name);
                  let info: any = null;
                  if (isMedia) {
                    try { info = await getMediaInfo(toPath(selectedItem.uri)); } catch {}
                  }
                  const exif = info ? exifLines(info) : [];
                  try {
                    const stat = await RNFS.stat(toPath(selectedItem.uri));
                    if (stat.mtime) lines.push({ label: tc.modified, value: formatDate(new Date(stat.mtime).getTime()) });
                    if (stat.ctime && exif.length === 0) lines.push({ label: tc.created, value: formatDate(new Date(stat.ctime).getTime()) });
                  } catch {}
                  if (info) {
                    if (info.width && info.height) lines.push({ label: tc.resolution, value: `${info.width}×${info.height}` });
                    if (info.duration) lines.push({ label: tc.duration, value: info.duration });
                  }
                  lines.push(...exif);
                  setDetailsName(selectedItem.name);
                  setDetailsData(lines);
                  setShowDetailsModal(true);
                }}>
                  <Ionicons name="information-circle-outline" size={20} color={colors.textPrimary} />
                  <Text style={[styles.sheetActionText, { color: colors.textPrimary }]}>{tc.info}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.sheetAction} onPress={handleDelete}>
                  <Ionicons name="trash-outline" size={20} color={colors.deleteRed} />
                  <Text style={[styles.sheetActionText, { color: colors.deleteRed }]}>{tc.delete}</Text>
                </TouchableOpacity>
                <View style={[styles.sheetDivider, { backgroundColor: colors.border }]} />
                {showRename ? (
                  <View style={styles.renameWrap}>
                    <TextInput
                      style={[styles.renameInput, { backgroundColor: colors.surface, color: colors.textPrimary }]}
                      value={renameValue}
                      onChangeText={setRenameValue}
                      autoFocus
                      selectTextOnFocus
                      placeholder={tf.newNamePh}
                      placeholderTextColor={colors.textMuted}
                      returnKeyType="done"
                      onSubmitEditing={handleRename}
                    />
                    <View style={styles.renameActions}>
                      <TouchableOpacity style={[styles.renameCancelBtn, { backgroundColor: colors.surface }]} onPress={() => { setShowRename(false); setRenameValue(''); }}>
                        <Text style={[styles.renameCancelText, { color: colors.textSecondary }]}>{tc.cancel}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.renameConfirmBtn, renaming && { opacity: 0.6 }]} onPress={handleRename} disabled={renaming}>
                        {renaming
                          ? <ActivityIndicator size="small" color="#fff" />
                          : <Text style={styles.renameConfirmText}>{tf.rename}</Text>
                        }
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <>
                    <TouchableOpacity style={styles.sheetAction} onPress={() => openPicker('copy')}>
                      <Ionicons name="copy-outline" size={20} color={colors.textPrimary} />
                      <Text style={[styles.sheetActionText, { color: colors.textPrimary }]}>{tf.copy}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.sheetAction} onPress={() => openPicker('move')}>
                      <Ionicons name="arrow-redo-outline" size={20} color={colors.textPrimary} />
                      <Text style={[styles.sheetActionText, { color: colors.textPrimary }]}>{tf.move}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.sheetAction} onPress={() => { setRenameValue(selectedItem?.name ?? ''); setShowRename(true); }}>
                      <Ionicons name="pencil-outline" size={20} color={colors.textPrimary} />
                      <Text style={[styles.sheetActionText, { color: colors.textPrimary }]}>{tf.rename}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.sheetAction} onPress={closeSheet}>
                      <Ionicons name="close-outline" size={20} color={colors.textMuted} />
                      <Text style={[styles.sheetActionText, { color: colors.textMuted }]}>{tc.cancel}</Text>
                    </TouchableOpacity>
                  </>
                )}
              </Pressable>
              </ScrollView>
            </Animated.View>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={showPicker} transparent={false} animationType="slide" onRequestClose={() => setShowPicker(false)}>
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, backgroundColor: colors.background }}>
            <TouchableOpacity
              onPress={() => {
                if (pickerPath === ROOT_PATH || volumes.some(v => pickerPath === `file://${v.path}/`)) { setShowPicker(false); }
                else {
                  const parent = pickerPath.endsWith('/') ? pickerPath.slice(0, -1) : pickerPath;
                  const up = parent.substring(0, parent.lastIndexOf('/') + 1);
                  setPickerPath(up); loadPickerDir(up);
                }
              }}
              style={{ width: 40, height: 40, justifyContent: 'center' }}
            >
              <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={{ flex: 1, fontSize: 20, fontWeight: '500', color: colors.textPrimary, textAlign: 'center', letterSpacing: -0.5 }} numberOfLines={1}>
              {pickerMode === 'copy' ? tf.copyTo : tc.moveTo}
            </Text>
            <View style={{ width: 40 }} />
          </View>
          <Text style={{ fontSize: 12, color: colors.textMuted, paddingHorizontal: 16, paddingBottom: 8 }}>
          {(() => {
              let display = pickerPath.replace('file:///storage/emulated/0/', tf.storage + '/');
              const sdVol = volumes.find(v => v.type === 'sdcard' && pickerPath.includes(v.path));
              if (sdVol) display = display.replace(`file://${sdVol.path}/`, `${sdVol.name}/`).replace(`file://${sdVol.path}`, sdVol.name);
              try { return decodeURIComponent(display); } catch { return display; }
            })()}
          </Text>
          {volumes.length > 1 && (
            <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 8, gap: 8 }}>
              {volumes.map(vol => (
                <TouchableOpacity key={vol.path} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: pickerPath.includes(vol.path) ? colors.blue : colors.surface }} onPress={() => { const newPath = `file://${vol.path}/`; setPickerPath(newPath); loadPickerDir(newPath); }}>
                  <Ionicons name={vol.type === 'sdcard' ? 'card-outline' : 'phone-portrait-outline'} size={14} color={pickerPath.includes(vol.path) ? '#fff' : colors.textSecondary} />
                  <Text style={{ fontSize: 12, fontWeight: '500', color: pickerPath.includes(vol.path) ? '#fff' : colors.textSecondary }}>{vol.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {pickerLoading ? (
            <View style={styles.centered}><ActivityIndicator color={colors.blue} /></View>
          ) : pickerItems.length === 0 && pickerFiles.length === 0 ? (
            <View style={styles.centered}><Text style={[styles.hint, { color: colors.textMuted }]}>{tc.folderEmpty}</Text></View>
          ) : (
            <FlatList
              data={[...pickerItems, ...pickerFiles]}
              keyExtractor={item => item.uri}
              contentContainerStyle={[styles.listContent, { paddingBottom: 100 }]}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.row, { borderBottomColor: colors.border }]}
                  onPress={() => { if (item.isDirectory) { setPickerPath(item.uri); loadPickerDir(item.uri); } }}
                  activeOpacity={item.isDirectory ? 0.6 : 1}
                >
                  <View style={[styles.fileIcon, { backgroundColor: (item.isDirectory ? colors.yellow : getFileColor(item.name)) + '22', overflow: 'hidden' }]}>
                    {item.isDirectory ? (
                      <Ionicons name="folder" size={22} color={colors.yellow} />
                    ) : isImageFile(item.name) ? (
                      <Image source={{ uri: item.uri }} style={styles.thumbnail} resizeMode="cover" />
                    ) : isVideoFile(item.name) ? (
                      <VideoThumb uri={item.uri} style={styles.thumbnail} />
                    ) : (
                      <Ionicons name={getFileIcon(item.name) as any} size={20} color={getFileColor(item.name)} />
                    )}
                  </View>
                  <View style={styles.fileInfo}>
                    <Text style={[styles.fileName, { color: colors.textPrimary }]} numberOfLines={1}>{item.name}</Text>
                  </View>
                  {item.isDirectory && <Ionicons name="chevron-forward" size={16} color={colors.textDisabled} />}
                </TouchableOpacity>
              )}
            />
          )}
          <View style={[styles.pickerFooter, { borderTopColor: colors.border }]}>
            <TouchableOpacity style={[styles.pickerCancelBtn, { backgroundColor: colors.surface }]} onPress={() => setShowPicker(false)}>
              <Text style={[styles.pickerCancelText, { color: colors.textSecondary }]}>{tc.cancel}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.pickerPasteBtn} onPress={handlePaste}>
              <Ionicons name="checkmark" size={18} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.pickerPasteText}>{pickerMode === 'copy' ? tf.copyHere : tc.moveHere}</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
      <FileDetailsModal visible={showDetailsModal} name={detailsName} data={detailsData} onClose={() => setShowDetailsModal(false)} />
      <Modal visible={viewerUri !== null} transparent={false} animationType="fade" onRequestClose={() => setViewerUri(null)} statusBarTranslucent>
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <StatusBar barStyle="light-content" backgroundColor="#000" />
          {viewerUri && (
            <MediaViewerView
              uri={viewerUri}
              onTap={() => setViewerUri(null)}
              style={StyleSheet.absoluteFill}
            />
          )}
          <SafeAreaView style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }} pointerEvents="box-none">
            <View style={{ alignItems: 'center', paddingBottom: 24 }}>
              <View style={{ flexDirection: 'row', gap: 0, backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 30, overflow: 'hidden' }}>
                <TouchableOpacity onPress={async () => {
                  if (!viewerUri) return;
                  try { await shareFiles([toPath(viewerUri)], 'image/*'); } catch {}
                }} style={{ paddingHorizontal: 20, paddingVertical: 12 }}>
                  <Ionicons name="share-outline" size={22} color="#222" />
                </TouchableOpacity>
                <View style={{ width: 0.5, backgroundColor: 'rgba(0,0,0,0.15)', marginVertical: 10 }} />
                <TouchableOpacity onPress={async () => {
                  if (!viewerUri) return;
                  try { await openFileNative(toPath(viewerUri), getMimeType(viewerUri.split('/').pop() ?? '')); } catch {}
                }} style={{ paddingHorizontal: 20, paddingVertical: 12 }}>
                  <Ionicons name="open-outline" size={22} color="#222" />
                </TouchableOpacity>
              </View>
            </View>
          </SafeAreaView>
        </View>
      </Modal>
      <Modal
        visible={qrModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setQrModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.qrOverlay}
          activeOpacity={1}
          onPress={() => setQrModalVisible(false)}
        >
          <View style={[styles.qrCard, { backgroundColor: colors.modalCard }]} onStartShouldSetResponder={() => true}>
            <TouchableOpacity
              onPress={() => setQrModalVisible(false)}
              style={{ position: 'absolute', top: 12, right: 12, zIndex: 10 }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </TouchableOpacity>
            <Text style={[styles.qrTitle, { color: colors.textPrimary }]}>{tf.shareViaQr}</Text>
            <Text style={[styles.qrSub, { color: colors.textMuted }]}>{selectedItem?.name}</Text>
            <Text style={[styles.qrSub, { color: colors.textSecondary, marginBottom: 12 }]}>{tf.scanSameWifi}</Text>
            <View style={{ padding: 16, backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden' }}>
              <QRCode value={qrUrl || 'http://localhost:8080'} size={200} />
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
      <TagPickerModal
        visible={showTagPicker}
        item={pendingItem.current}
        onClose={() => setShowTagPicker(false)}
      />
      <VideoPlayerModal uri={playerUri} onClose={() => setPlayerUri(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centeredOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-start', alignItems: 'center' },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  title: { fontSize: 20, fontWeight: '500', letterSpacing: -0.5 },
  modeToggle: { flexDirection: 'row', marginHorizontal: 16, marginVertical: 12, borderRadius: 10, padding: 4 },
  modeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 8, borderRadius: 8 },
  modeBtnActive: {},
  modeBtnText: { fontSize: 13, fontWeight: '500' },
  inputWrap: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 12, borderRadius: 10, padding: 12 },
  inputWrapDisabled: { opacity: 0.5 },
  input: { flex: 1, fontSize: 14 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  centeredContent: { alignItems: 'center', paddingVertical: 32, gap: 8 },
  hint: { fontSize: 13, textAlign: 'center', marginTop: 8, paddingHorizontal: 24 },
  listContent: { paddingHorizontal: 16 },
  resultCount: { fontSize: 11, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 0.5 },
  fileIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  thumbnail: { width: 40, height: 40 },
  extLabel: { fontSize: 9, fontWeight: '500' },
  fileInfo: { flex: 1 },
  fileName: { fontSize: 14, fontWeight: '500', marginBottom: 2 },
  fileMeta: { fontSize: 11 },
  answerScroll: { flex: 1 },
  answerScrollContent: { padding: 16, gap: 12 },
  answerWrap: { borderRadius: 12, padding: 16 },
  answerHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  answerLabel: { fontSize: 13, fontWeight: '500' },
  answerText: { fontSize: 14, lineHeight: 22 },
  askAgainBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 10, padding: 12 },
  askAgainText: { fontSize: 13, fontWeight: '500' },
  suggestionsLabel: { fontSize: 11, fontWeight: '500', letterSpacing: 0.5, textTransform: 'uppercase', marginTop: 4 },
  suggestionsScroll: { paddingHorizontal: 16, paddingBottom: 24 },
  suggestions: { gap: 8 },
  suggestion: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 10, padding: 14 },
  suggestionText: { fontSize: 13 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 16 },
  sheetLandscape: { borderRadius: 20, paddingHorizontal: 24, paddingVertical: 16, width: '60%', maxHeight: '90%', alignSelf: 'center', marginTop: 'auto', marginBottom: 'auto' },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 16 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 12 },
  sheetIcon: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  sheetThumb: { width: 44, height: 44 },
  sheetFileInfo: { flex: 1 },
  sheetFileName: { fontSize: 14, fontWeight: '500', marginBottom: 2 },
  sheetFileMeta: { fontSize: 12 },
  sheetDivider: { height: 0.5, marginVertical: 8 },
  sheetAction: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 },
  sheetActionText: { fontSize: 15 },
  folderHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  folderBackBtn: { width: 40, height: 40, justifyContent: 'center' },
  folderTitle: { flex: 1, fontSize: 18, fontWeight: '500', textAlign: 'center', letterSpacing: -0.3 },
  renameWrap: { paddingVertical: 12, gap: 12 },
  renameInput: { borderRadius: 10, padding: 12, fontSize: 14 },
  renameActions: { flexDirection: 'row', gap: 8 },
  renameCancelBtn: { flex: 1, padding: 12, borderRadius: 10, alignItems: 'center' },
  renameCancelText: { fontSize: 14 },
  renameConfirmBtn: { flex: 1, padding: 12, borderRadius: 10, backgroundColor: '#185FA5', alignItems: 'center' },
  renameConfirmText: { fontSize: 14, color: '#fff', fontWeight: '500' },
  pickerFooter: { flexDirection: 'row', gap: 8, padding: 16, borderTopWidth: 0.5 },
  pickerCancelBtn: { flex: 1, padding: 14, borderRadius: 12, alignItems: 'center' },
  pickerCancelText: { fontSize: 14, fontWeight: '500' },
  pickerPasteBtn: { flex: 2, flexDirection: 'row', padding: 14, borderRadius: 12, backgroundColor: '#185FA5', alignItems: 'center', justifyContent: 'center' },
  pickerPasteText: { fontSize: 14, color: '#fff', fontWeight: '600' },
  smartRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 12, borderBottomWidth: 0.5 },
  smartSnippet: { fontSize: 12, lineHeight: 18, marginTop: 2 },
  smartHighlight: { borderRadius: 2, paddingHorizontal: 1 },
  txtPreviewCard: { borderRadius: 8, borderWidth: 0.5, padding: 10, marginBottom: 8 },
  txtPreviewText: { fontSize: 12, lineHeight: 18, fontFamily: 'monospace' },
  qrOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  qrCard: { borderRadius: 16, padding: 16, paddingBottom: 24, alignItems: 'center', margin: 32, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 8, overflow: 'hidden' },
  qrTitle: { fontSize: 18, fontWeight: '600', marginBottom: 4, letterSpacing: -0.3 },
  qrSub: { fontSize: 12, textAlign: 'center', marginBottom: 4 },
  passwordModal: {
    width: '85%',
    maxWidth: 400,
    borderRadius: 16,
    padding: 20,
  },
  passwordModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  passwordModalTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
});
