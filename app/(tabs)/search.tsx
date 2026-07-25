import React, { useState, useRef, useCallback, useEffect } from 'react';
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
import { isImageFile, getMimeType, getFileColor, formatSize, getFileIcon, toPath, getFriendlyPath, formatDate } from '@/utils/files';
import { useBottomSheet } from '@/hooks/useBottomSheet';
import { getMediaInfo } from 'media-store';
import FileDetailsModal from '@/components/FileDetailsModal';
import { addRecent } from '@/hooks/useRecents';
import * as Sharing from 'expo-sharing';
import { useStorage } from '@/hooks/useStorage';
import { usePro } from '@/hooks/usePro';
import * as IntentLauncher from 'expo-intent-launcher';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import { useVault } from '@/hooks/useVault';
import * as FileSystem from 'expo-file-system/next';
import * as MediaLibrary from 'expo-media-library';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { addFavourite, removeFavourite, isFavourite } from '@/hooks/useFavourites';
import RNFS from 'react-native-fs';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { useTheme } from '@/hooks/useTheme';
import { useTrash } from '@/hooks/useTrash';
import { openFile as openFileNative, shareFiles, copyImageToClipboard } from '@/modules/share-module';
import { DocIndexer, IndexedFile } from '@/modules/doc-indexer';
import { scanFile } from '@/modules/share-module';
import { startWifiServer, copyFileStream, moveFileStream, addCopyProgressListener, readTextPreview } from 'file-reader';
import { getStorageVolumes } from '@/modules/storage-stats';
import { syncPathReferences } from '@/hooks/usePathSync';
import { useTags } from '@/hooks/useTags';
import { getTagsForFile } from '@/hooks/useFileTags';
import { MediaViewerView } from 'media-viewer';
import VideoPlayerModal from '@/components/VideoPlayerModal';
import { recordOpen, getStats } from 'file-stats';
import * as Haptics from 'expo-haptics';
import QRCode from 'react-native-qrcode-svg';
import { getRecentSearches, addRecentSearch, removeRecentSearch, clearRecentSearches, RecentSearch } from 'recent-searches';
import { getDateGroup } from '@/hooks/useRecents';

type Mode = 'search' | 'ask' | 'smart';

const SUGGESTIONS = [
  'What images do I have?',
  'Find my downloaded files',
  'What videos are on my phone?',
  "What's taking up the most space?",
  'How much storage do I have left?',
  'Should I free up some space?',
];

function friendlyFolder(folder: string): string {
  const map: Record<string, string> = {
    'Camera': 'Camera Roll',
    'Download': 'Downloads',
    'Pictures': 'Pictures',
    'Movies': 'Videos',
    'Documents': 'Documents',
    'Music': 'Music',
    'My Files': 'My Files',
  };
  return map[folder] ?? folder;
}

function buildContext(
  storageInfo: any,
  fileCounts: any,
  folderSizes: any,
  mediaContext: any,
  largestFiles: any,
): string {

  const freeSpace = storageInfo?.freeBytes ? formatSize(storageInfo.freeBytes) : 'unknown';

  const imageCounts: Record<string, number> = {};
  for (const name of mediaContext.recentImages) {
    const ext = name.split('.').pop()?.toLowerCase() ?? 'unknown';
    imageCounts[ext] = (imageCounts[ext] ?? 0) + 1;
  }
  const imageBreakdown = Object.entries(imageCounts).map(([ext, count]) => `${count} ${ext}`).join(', ');

  const videoCounts: Record<string, number> = {};
  for (const name of mediaContext.recentVideos) {
    const ext = name.split('.').pop()?.toLowerCase() ?? 'unknown';
    videoCounts[ext] = (videoCounts[ext] ?? 0) + 1;
  }
  const videoBreakdown = Object.entries(videoCounts).map(([ext, count]) => `${count} ${ext}`).join(', ');


  return `
Device storage: ${storageInfo?.usedReadable} used of ${storageInfo?.totalReadable} total. ${freeSpace} free.
File counts: ${fileCounts.images} images total, ${fileCounts.videos} videos total, ${fileCounts.documents} documents, ${fileCounts.downloads} downloads. Format sample from ${Math.min(500, fileCounts.images)} most recent images: ${imageBreakdown}; ${Math.min(500, fileCounts.videos)} most recent videos: ${videoBreakdown}.
Screenshots: exactly ${mediaContext.screenshotCount} files (do not count manually, use this number).
Folder sizes: DCIM/Camera ${folderSizes.dcim}, Pictures ${folderSizes.pictures}, Videos total ${folderSizes.videos}, Downloads ${folderSizes.downloads}, Documents ${folderSizes.documents}.
Note: PNG files are image files. Files with 1970 date have corrupted/missing timestamps from WhatsApp. Always use the exact file counts stated in the File counts line.
Largest images by size: ${largestFiles.images.map((f: any) => `${f.name} (${f.size}, in ${friendlyFolder(f.folder)})`).join(', ') || 'none'}.
Largest videos by size: ${largestFiles.videos.map((f: any) => `${f.name} (${f.size}, in ${friendlyFolder(f.folder)})`).join(', ') || 'none'}.
Largest documents by size: ${largestFiles.documents.map((f: any) => `${f.name} (${f.size}, in ${friendlyFolder(f.folder)})`).join(', ') || 'none'}.
Largest downloads by size: ${largestFiles.downloads.map((f: any) => `${f.name} (${f.size}, in ${friendlyFolder(f.folder)})`).join(', ') || 'none'}.
Top 10 largest files across all storage (use this to answer "what's my largest file"): ${largestFiles.overall.map((f: any) => `${f.name} (${f.size}, in ${friendlyFolder(f.folder)})`).join(', ') || 'none'}.
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
  const router = useRouter();
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

  const { fileCounts, storageInfo, folderSizes, mediaContext, largestFiles } = useStorage();
  const { isPro } = usePro();
  const { addToVault } = useVault();
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
  const [fileTagsMap, setFileTagsMap] = useState<Record<string, string[]>>({});
  const pendingItem = useRef<{ name: string; uri: string; inFolder?: boolean } | null>(null);
  const [volumes, setVolumes] = useState<{ name: string; path: string; type: string }[]>([]);
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  const [playerUri, setPlayerUri] = useState<string | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [detailsData, setDetailsData] = useState<{ label: string; value: string }[]>([]);
  const [detailsName, setDetailsName] = useState('');
  const [qrModalVisible, setQrModalVisible] = useState(false);
  const [qrUrl, setQrUrl] = useState('');
  const { sheetAnim, panResponder, animateOpen, closeSheet } = useBottomSheet(() => {
    setShowSheet(false);
    setSelectedItem(null);
  });

  useEffect(() => { getStorageVolumes().then(setVolumes); }, []);

  useEffect(() => {
    if (!results.length) { setFileTagsMap({}); return; }
    Promise.all(
      results.map(async item => ({ uri: item.uri, tags: await getTagsForFile(item.uri) }))
    ).then(entries => {
      const map: Record<string, string[]> = {};
      entries.forEach(e => { if (e.tags.length) map[e.uri] = e.tags; });
      setFileTagsMap(map);
    });
  }, [results]);

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
    setTxtPreview(null);
    setSelectedItem(item);
    setFileSize(null);
    setShowSheet(true);
    setShowRename(false);
    setRenameValue('');
    setIsFav(await isFavourite(item.uri));
    animateOpen();
    try {
      const file = new FileSystem.File(item.uri);
      setFileSize(formatSize(file.size ?? 0));
    } catch { setFileSize('Unknown'); }
    const lowerName = item.name.toLowerCase();
    if (lowerName.endsWith('.txt')) {
      readTextPreview(toPath(item.uri)).then(setTxtPreview).catch(() => setTxtPreview(null));
    } else if (lowerName.endsWith('.pdf')) {
      DocIndexer.getPdfPreview(toPath(item.uri)).then(text => setTxtPreview(text || null)).catch(() => setTxtPreview(null));
    }
  }

  const ROOT_PATH = 'file:///storage/emulated/0/';

  async function loadPickerDir(path: string) {
    setPickerLoading(true);
    try {
      const dir = new FileSystem.Directory(path.endsWith('/') ? path : path + '/');
      const contents = dir.list();
      const folders = contents
        .filter((item: any) => item instanceof FileSystem.Directory)
        .map((item: any) => { const raw = item.uri.split('/').filter(Boolean).pop() ?? ''; let name = raw; try { name = decodeURIComponent(raw); } catch {} return { name, uri: item.uri, isDirectory: true }; })
        .filter((f: any) => !f.name.startsWith('.'))
        .sort((a: any, b: any) => a.name.localeCompare(b.name));
      const files = contents
        .filter((item: any) => item instanceof FileSystem.File)
        .map((item: any) => ({ name: (() => { try { return decodeURIComponent(item.name); } catch { return item.name; } })(), uri: item.uri, isDirectory: false }))
        .filter((f: any) => !f.name.startsWith('.'))
        .sort((a: any, b: any) => a.name.localeCompare(b.name));
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
      Alert.alert('File already exists', `"${item.name}" already exists in this folder.`);
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
        Alert.alert('Success', `"${item.name}" copied successfully.`);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        await moveFileStream(src, dst);
        await syncPathReferences(item.uri, destUri, item.name);
        await scanFile(dst).catch(() => {});
        if (item.inFolder) { removeFolderItem(item.uri); }
        else { removeResult(item.uri); }
        Alert.alert('Success', `"${item.name}" moved successfully.`);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch {
      Alert.alert('Error', `Could not ${pickerMode} file.`);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      sub.remove();
      setCopyProgress(null);
      setPasting(false);
    }
  }

  async function handleRename() {
    if (!selectedItem || !renameValue.trim()) return;
    const uri = selectedItem.uri.endsWith('/') ? selectedItem.uri.slice(0, -1) : selectedItem.uri;
    const parentPath = uri.substring(0, uri.lastIndexOf('/') + 1);
    const newUri = parentPath + renameValue.trim();
    try {
      const invalidChars = /[*\/\\:?"<>|]/;
      if (invalidChars.test(renameValue.trim())) {
        Alert.alert('Invalid name', 'File names cannot contain: * / \\ : ? " < > |');
        return;
      }
      const destExists = await RNFS.exists(toPath(newUri));
      if (destExists) {
        Alert.alert('Name already taken', `A file named "${renameValue.trim()}" already exists in this folder.`);
        return;
      }
      await RNFS.moveFile(toPath(selectedItem.uri), toPath(newUri));
      await syncPathReferences(selectedItem.uri, newUri, renameValue.trim());
      await scanFile(toPath(newUri)).catch(() => {});
      try {
        const sourceFilename = decodeURIComponent(selectedItem.uri.split('/').pop() ?? '');
        const allAssets = await MediaLibrary.getAssetsAsync({ first: 5000, mediaType: ['photo', 'video', 'unknown'] });
        const ghost = allAssets.assets.find((a: any) => a.filename === sourceFilename && toPath(a.uri) === toPath(selectedItem.uri));
        if (ghost) await MediaLibrary.deleteAssetsAsync([ghost]);
      } catch {}
      if (selectedItem.inFolder) {
        setFolderStack(prev => prev.map((f, i) =>
          i === prev.length - 1
            ? { ...f, items: f.items.map(item => item.uri === selectedItem.uri ? { ...item, name: renameValue.trim(), uri: newUri } : item) }
            : f
        ));
      } else {
        setResults(prev => prev.map(f => f.uri === selectedItem.uri ? { ...f, name: renameValue.trim(), uri: newUri } : f));
      }
      closeSheet();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert('Rename failed', 'Could not rename this file.');
    }
  }

  async function handleShare() {
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
      let url: string;
      try {
        url = await startWifiServer('/storage/emulated/0/');
      } catch {
        await new Promise(res => setTimeout(res, 500));
        url = await startWifiServer('/storage/emulated/0/');
      }
      const ip = url.replace('http://', '').replace(':8080', '');
      const encodedPath = encodeURIComponent(selectedItem.uri.replace('file://', ''));
      const fileUrl = `http://${ip}:8080/file?path=${encodedPath}`;
      setQrUrl(fileUrl);
      setQrModalVisible(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (e: any) {
      Alert.alert('Error', 'Could not start WiFi server');
    }
  }

  async function handleCopyImage() {
    if (!selectedItem) return;
    try {
      await copyImageToClipboard(toPath(selectedItem.uri), 'image/*');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Copied', 'Image copied to clipboard.');
      closeSheet();
    } catch {
      Alert.alert('Error', 'Could not copy image to clipboard.');
    }
  }

  async function handleMoveToVault() {
    if (!selectedItem) return;
    Alert.alert(
      'Move to Vault',
      `Move "${selectedItem.name}" to your Secure Vault? The original file will be removed from its current location.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Move to Vault', onPress: async () => {
          const uri = selectedItem.uri;
          const name = selectedItem.name;
          const inFolder = selectedItem.inFolder;
          closeSheet();
          setMovingUri(uri);
          const ok = await addToVault(uri, name);
          setMovingUri(null);
          if (ok) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            DocIndexer.removeFromIndex(uri);
            if (inFolder) { removeFolderItem(uri); }
            else { removeResult(uri); }
          } else {
            Alert.alert('Error', 'Could not move file to Vault. Try again.');
          }
        }},
    ]);
  }

  async function handleDelete() {
    if (!selectedItem) return;
    Alert.alert('Move to Trash', `"${selectedItem.name}" will be moved to Trash and deleted after 30 days.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Move to Trash', style: 'destructive', onPress: async () => {
        closeSheet();
        const ok = await moveToTrash(selectedItem.uri, selectedItem.name);
        if (ok) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          await removeFavourite(selectedItem.uri);
          DocIndexer.removeFromIndex(selectedItem.uri);
          if (selectedItem.inFolder) { removeFolderItem(selectedItem.uri); }
          else { removeResult(selectedItem.uri); }
        } else {
          Alert.alert('Error', 'Could not move file to Trash.');
        }
      }},
    ]);
  }

  async function handleToggleFavourite() {
    if (!selectedItem) return;
    if (isFav) {
      await removeFavourite(selectedItem.uri);
      setIsFav(false);
      Alert.alert('Removed from Favourites', `"${selectedItem.name}" removed.`);
    } else {
      await addFavourite({ name: selectedItem.name, uri: selectedItem.uri });
      setIsFav(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      Alert.alert('Added to Favourites', `"${selectedItem.name}" added.`);
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
          return a.name.localeCompare(b.name);
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
    Keyboard.dismiss();
    const context = buildContext(storageInfo, fileCounts, folderSizes, mediaContext, largestFiles);
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
        const contentUri = await FileSystemLegacy.getContentUriAsync('file://' + cachePath);
        await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
          data: contentUri,
          flags: 1,
          type: mime,
        });
      } catch (e2) {}
    }
    setOpeningUri(null);
  }

  function handleSuggestion(s: string) {
    setAiQuery(s);
    handleAsk(s);
  }

  function handleAskAgain() {
    setAiQuery('');
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
        <Text style={[styles.title, { color: colors.textPrimary }]}>Search</Text>
      </View>
      {pasting && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: colors.surface }}>
          <ActivityIndicator size="small" color={colors.blue} />
          <Text style={{ fontSize: 13, color: colors.textSecondary }}>
            {pickerMode === 'copy' ? 'Copying' : 'Moving'} {pendingItem.current?.name}
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
          <Text style={[styles.modeBtnText, { color: colors.textMuted }, mode === 'search' && { color: colors.blue }]}>Search</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeBtn, mode === 'ask' && [styles.modeBtnActive, { backgroundColor: colors.card }]]}
          onPress={() => {
            if (!isPro) { router.push('/(tabs)/cloud'); return; }
            setMode('ask');
          }}
        >
          <Ionicons name="sparkles-outline" size={14} color={mode === 'ask' ? colors.blue : colors.textMuted} style={{ marginRight: 4 }} />
          <Text style={[styles.modeBtnText, { color: colors.textMuted }, mode === 'ask' && { color: colors.blue }]}>Ask AI</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeBtn, mode === 'smart' && [styles.modeBtnActive, { backgroundColor: colors.card }]]}
          onPress={() => {
            if (!isPro) { router.push('/(tabs)/cloud'); return; }
            setMode('smart');
          }}
        >
            <Ionicons name="document-text-outline" size={14} color={mode === 'smart' ? colors.blue : colors.textMuted} style={{ marginRight: 4 }} />
            <Text style={[styles.modeBtnText, { color: colors.textMuted }, mode === 'smart' && { color: colors.blue }]}>Smart</Text>
          </TouchableOpacity>
      </View>

      {mode === 'search' ? (
        <>
          <View style={[styles.inputWrap, { backgroundColor: colors.surface }]}>
            <Ionicons name="search-outline" size={16} color={colors.textMuted} style={{ marginRight: 8 }} />
            <TextInput
              ref={searchInputRef}
              style={[styles.input, { color: colors.textPrimary }]}
              placeholder="Search files..."
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
                        <Text style={{ fontSize: 12, fontWeight: '500', color: active ? '#fff' : colors.textSecondary }} numberOfLines={1}>{label}</Text>
                      </TouchableOpacity>
                    );
                  })}
              </ScrollView>
            )}
          {searching ? (
            <View style={styles.centered}>
              <ActivityIndicator color={colors.blue} />
              <Text style={[styles.hint, { color: colors.textMuted }]}>Searching...</Text>
            </View>
          ) : query.length < 2 ? (
            recentSearches.length === 0 || historyHidden ? (
              <View style={styles.centered}>
                <Ionicons name="search-outline" size={40} color={colors.textDisabled} />
                <Text style={[styles.hint, { color: colors.textMuted }]}>
                  {historyHidden ? 'Search history hidden' : 'Type at least 2 characters'}
                </Text>
                {historyHidden && recentSearches.length > 0 && (
                  <TouchableOpacity onPress={() => setHistoryHidden(false)} style={{ marginTop: 8 }}>
                    <Text style={[styles.hint, { color: colors.blue }]}>Show history</Text>
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
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <Text style={[styles.resultCount, { color: colors.textMuted }]}>Recent searches</Text>
                    <View style={{ flexDirection: 'row', gap: 16 }}>
                      <TouchableOpacity onPress={() => setHistoryHidden(true)}>
                        <Text style={{ fontSize: 12, color: colors.textMuted }}>Hide</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => {
                        clearRecentSearches();
                        setRecentSearches([]);
                      }}>
                        <Text style={{ fontSize: 12, color: colors.blue }}>Clear</Text>
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
              <Text style={[styles.hint, { color: colors.textMuted }]}>No files found for "{query}"</Text>
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
                  {results.length} result{results.length !== 1 ? 's' : ''}
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
                        <Image source={{ uri: item.uri }} style={styles.thumbnail} resizeMode="cover" />
                      ) : isVideoFile(item.name) ? (
                        <VideoThumb uri={item.uri} style={styles.thumbnail} />
                      ) : (
                        <Ionicons name={getFileIcon(item.name) as any} size={20} color={color} />
                      )}
                    </View>
                    <View style={styles.fileInfo}>
                      <Text style={[styles.fileName, { color: colors.textPrimary }]} numberOfLines={1}>{item.name}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <Text style={[styles.fileMeta, { color: colors.textMuted }]}>{item.isDirectory ? 'Folder' : ext + ' file'}</Text>
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
          <View style={[styles.inputWrap, { backgroundColor: colors.surface }]}>
            <Ionicons name="sparkles-outline" size={16} color={colors.textMuted} style={{ marginRight: 8 }} />
            <TextInput
              style={[styles.input, { color: colors.textPrimary }]}
              placeholder="Ask anything about your files..."
              placeholderTextColor={colors.textMuted}
              value={aiQuery}
              onChangeText={setAiQuery}
              onSubmitEditing={() => cooldown === 0 && handleAsk()}
              returnKeyType="send"
              editable={true}
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
                    🎤 Microphone access needed
                  </Text>
                  <Text style={{ color: dark ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.75)', fontSize: 11 }}>
                    Enable microphone access in Settings to use voice search
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

          {thinking ? (
            <View style={styles.centered}>
              <ActivityIndicator color={colors.blue} />
              <Text style={[styles.hint, { color: colors.textMuted }]}>Thinking...</Text>
            </View>
          ) : answer.length > 0 ? (
            <ScrollView style={styles.answerScroll} contentContainerStyle={styles.answerScrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={[styles.answerWrap, { backgroundColor: colors.blueBg }]}>
                <View style={styles.answerHeader}>
                  <Ionicons name="sparkles-outline" size={16} color={colors.blue} />
                  <Text style={[styles.answerLabel, { color: colors.blue }]}>AskFiles AI</Text>
                </View>
                <Text style={[styles.answerText, { color: colors.textPrimary }]}>{answer}</Text>
              </View>
              <TouchableOpacity style={[styles.askAgainBtn, { backgroundColor: colors.surface }]} onPress={handleAskAgain}>
                <Ionicons name="sparkles-outline" size={14} color={colors.textSecondary} style={{ marginRight: 6 }} />
                <Text style={[styles.askAgainText, { color: colors.textSecondary }]}>Ask something else</Text>
              </TouchableOpacity>
              <>
                <Text style={[styles.suggestionsLabel, { color: colors.textMuted }]}>Try these</Text>
                <View style={styles.suggestions}>
                  {SUGGESTIONS.map(s => (
                    <TouchableOpacity key={s} style={[styles.suggestion, { backgroundColor: colors.surface }]} onPress={() => handleSuggestion(s)}>
                      <Text style={[styles.suggestionText, { color: colors.textSecondary }]}>{s}</Text>
                      <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            </ScrollView>
          ) : (
            <ScrollView contentContainerStyle={styles.suggestionsScroll} showsVerticalScrollIndicator={false}>
              <>
                <View style={styles.centeredContent}>
                  <Ionicons name="sparkles-outline" size={40} color={colors.textDisabled} />
                  <Text style={[styles.hint, { color: colors.textMuted }]}>Ask about your files in plain English</Text>
                </View>
                <View style={styles.suggestions}>
                  {SUGGESTIONS.map(s => (
                    <TouchableOpacity key={s} style={[styles.suggestion, { backgroundColor: colors.surface }]} onPress={() => handleSuggestion(s)}>
                      <Text style={[styles.suggestionText, { color: colors.textSecondary }]}>{s}</Text>
                      <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
                    </TouchableOpacity>
                  ))}
                </View>
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
              placeholder="Search inside documents..."
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
              <Text style={[styles.hint, { color: colors.textMuted }]}>Searching content...</Text>
            </View>
          ) : smartQuery.length < 2 ? (
            <View style={styles.centered}>
              {indexing ? (
                <>
                  <ActivityIndicator color={colors.blue} />
                  <Text style={[styles.hint, { color: colors.textMuted }]}>Reading your documents...</Text>
                </>
              ) : (
                <>
                  <Ionicons name="document-text-outline" size={40} color={colors.textDisabled} />
                  <Text style={[styles.hint, { color: colors.textMuted }]}>Search inside your documents</Text>
                  <Text style={[styles.hint, { color: colors.textMuted, fontSize: 11 }]}>
                    {indexCount > 0 ? `${indexCount} file${indexCount !== 1 ? 's' : ''} ready to search - scans up to 200 files per visit` : 'PDFs, Word, Excel and text files'}
                  </Text>
                </>
              )}
            </View>
          ) : smartResults.length === 0 ? (
            <View style={styles.centered}>
              <Ionicons name="search-outline" size={40} color={colors.textDisabled} />
              <Text style={[styles.hint, { color: colors.textMuted }]}>No documents contain "{smartQuery}"</Text>
              <Text style={[styles.hint, { color: colors.textMuted, fontSize: 11 }]}>Can't find your document? Make sure it's saved to Downloads or Documents.</Text>
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
                  {smartResults.length} document{smartResults.length !== 1 ? 's' : ''} match
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
                    <Text style={[styles.hint, { color: colors.textMuted }]}>Folder is empty</Text>
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
                              <Image source={{ uri: item.uri }} style={styles.thumbnail} resizeMode="cover" />
                            ) : isVideoFile(item.name) ? (
                              <VideoThumb uri={item.uri} style={styles.thumbnail} />
                            ) : (
                              <Ionicons name={getFileIcon(item.name) as any} size={20} color={color} />
                            )}
                          </View>
                          <View style={styles.fileInfo}>
                            <Text style={[styles.fileName, { color: colors.textPrimary }]} numberOfLines={1}>{item.name}</Text>
                            <Text style={[styles.fileMeta, { color: colors.textMuted }]}>{item.isDirectory ? 'Folder' : ext + ' file'}</Text>
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
                ? [styles.sheetLandscape, { backgroundColor: colors.card }]
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
                {txtPreview && (selectedItem?.name.toLowerCase().endsWith('.txt') || selectedItem?.name.toLowerCase().endsWith('.pdf')) && (
                  <View style={[styles.txtPreviewCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Text style={[styles.txtPreviewText, { color: colors.textSecondary }]} numberOfLines={3}>
                      {txtPreview}
                    </Text>
                  </View>
                )}
                <TouchableOpacity style={styles.sheetAction} onPress={handleShare}>
                  <Ionicons name="share-outline" size={20} color={colors.textPrimary} />
                  <Text style={[styles.sheetActionText, { color: colors.textPrimary }]}>Share</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.sheetAction} onPress={handleShareViaQr}>
                  <Ionicons name="qr-code-outline" size={20} color={colors.textPrimary} />
                  <Text style={[styles.sheetActionText, { color: colors.textPrimary }]}>Share via QR</Text>
                </TouchableOpacity>
                {isImageFile(selectedItem?.name ?? '') && (
                  <TouchableOpacity style={styles.sheetAction} onPress={handleCopyImage}>
                    <Ionicons name="copy-outline" size={20} color={colors.textPrimary} />
                    <Text style={[styles.sheetActionText, { color: colors.textPrimary }]}>Copy image</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.sheetAction} onPress={isPro ? handleMoveToVault :
                  () => Alert.alert('Pro Feature', 'Upgrade to AskFiles Pro to move files to the Vault.', [
                    { text: 'Not now', style: 'cancel' },
                    { text: 'Upgrade', onPress: () => router.push('/(tabs)/cloud') },
                  ])}>
                  <Ionicons name="shield-checkmark-outline" size={20} color={isPro ? colors.blue : colors.textMuted} />
                  <Text style={[styles.sheetActionText, { color: isPro ? colors.blue : colors.textMuted }]}>
                    Move to Vault{!isPro ? '  🔒' : ''}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.sheetAction} onPress={handleToggleFavourite}>
                  <Ionicons name={isFav ? 'heart' : 'heart-outline'} size={20} color={isFav ? colors.deleteRed : colors.textPrimary} />
                  <Text style={[styles.sheetActionText, { color: isFav ? colors.deleteRed : colors.textPrimary }]}>
                    {isFav ? 'Remove from Favourites' : 'Add to Favourites'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.sheetAction} onPress={async () => {
                  if (!selectedItem) return;
                  closeSheet();
                  const lines: { label: string; value: string }[] = [];
                  if (fileSize) lines.push({ label: 'Size', value: fileSize });
                  lines.push({ label: 'Type', value: (selectedItem.name.split('.').pop()?.toUpperCase() ?? '?') + ' file' });
                  lines.push({ label: 'Location', value: getFriendlyPath(selectedItem.uri, volumes) });
                  const stats = getStats(selectedItem.uri);
                  if (stats && stats.count > 0) {
                    lines.push({ label: 'Times opened', value: `${stats.count}` });
                    lines.push({ label: 'Last opened', value: formatDate(stats.lastOpened) });
                  }
                  try {
                    const stat = await RNFS.stat(toPath(selectedItem.uri));
                    if (stat.mtime) lines.push({ label: 'Modified', value: formatDate(new Date(stat.mtime).getTime()) });
                    if (stat.ctime) lines.push({ label: 'Created', value: formatDate(new Date(stat.ctime).getTime()) });
                  } catch {}
                  if (isImageFile(selectedItem.name) || isVideoFile(selectedItem.name)) {
                    try {
                      const info = await getMediaInfo(toPath(selectedItem.uri));
                      if (info.width && info.height) lines.push({ label: 'Resolution', value: `${info.width}×${info.height}` });
                      if (info.duration) lines.push({ label: 'Duration', value: info.duration });
                    } catch {}
                  }
                  setDetailsName(selectedItem.name);
                  setDetailsData(lines);
                  setShowDetailsModal(true);
                }}>
                  <Ionicons name="information-circle-outline" size={20} color={colors.textPrimary} />
                  <Text style={[styles.sheetActionText, { color: colors.textPrimary }]}>Info</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.sheetAction} onPress={handleDelete}>
                  <Ionicons name="trash-outline" size={20} color={colors.deleteRed} />
                  <Text style={[styles.sheetActionText, { color: colors.deleteRed }]}>Delete</Text>
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
                      placeholder="New name..."
                      placeholderTextColor={colors.textMuted}
                      returnKeyType="done"
                      onSubmitEditing={handleRename}
                    />
                    <View style={styles.renameActions}>
                      <TouchableOpacity style={[styles.renameCancelBtn, { backgroundColor: colors.surface }]} onPress={() => { setShowRename(false); setRenameValue(''); }}>
                        <Text style={[styles.renameCancelText, { color: colors.textSecondary }]}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.renameConfirmBtn} onPress={handleRename}>
                        <Text style={styles.renameConfirmText}>Rename</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <>
                    <TouchableOpacity style={styles.sheetAction} onPress={() => openPicker('copy')}>
                      <Ionicons name="copy-outline" size={20} color={colors.textPrimary} />
                      <Text style={[styles.sheetActionText, { color: colors.textPrimary }]}>Copy</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.sheetAction} onPress={() => openPicker('move')}>
                      <Ionicons name="arrow-redo-outline" size={20} color={colors.textPrimary} />
                      <Text style={[styles.sheetActionText, { color: colors.textPrimary }]}>Move</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.sheetAction} onPress={() => { setRenameValue(selectedItem?.name ?? ''); setShowRename(true); }}>
                      <Ionicons name="pencil-outline" size={20} color={colors.textPrimary} />
                      <Text style={[styles.sheetActionText, { color: colors.textPrimary }]}>Rename</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.sheetAction} onPress={closeSheet}>
                      <Ionicons name="close-outline" size={20} color={colors.textMuted} />
                      <Text style={[styles.sheetActionText, { color: colors.textMuted }]}>Cancel</Text>
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
              {pickerMode === 'copy' ? 'Copy to...' : 'Move to...'}
            </Text>
            <View style={{ width: 40 }} />
          </View>
          <Text style={{ fontSize: 12, color: colors.textMuted, paddingHorizontal: 16, paddingBottom: 8 }}>
          {(() => {
              let display = pickerPath.replace('file:///storage/emulated/0/', 'Storage/');
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
            <View style={styles.centered}><Text style={[styles.hint, { color: colors.textMuted }]}>This folder is empty</Text></View>
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
              <Text style={[styles.pickerCancelText, { color: colors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.pickerPasteBtn} onPress={handlePaste}>
              <Ionicons name="checkmark" size={18} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.pickerPasteText}>{pickerMode === 'copy' ? 'Copy here' : 'Move here'}</Text>
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
            <Text style={[styles.qrTitle, { color: colors.textPrimary }]}>Share via QR</Text>
            <Text style={[styles.qrSub, { color: colors.textMuted }]}>{selectedItem?.name}</Text>
            <Text style={[styles.qrSub, { color: colors.textSecondary, marginBottom: 12 }]}>Scan with any device on the same WiFi</Text>
            <View style={{ padding: 16, backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden' }}>
              <QRCode value={qrUrl || 'http://localhost:8080'} size={200} />
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
      <VideoPlayerModal uri={playerUri} onClose={() => setPlayerUri(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
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
  hint: { fontSize: 13, textAlign: 'center', marginTop: 8 },
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
});
