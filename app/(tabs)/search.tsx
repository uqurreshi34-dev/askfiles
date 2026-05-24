import React, { useState, useRef, useCallback, useEffect } from 'react';
import { isVideoFile, VideoThumb } from '@/utils/videoThumb';
import {
  StyleSheet, Text, View, TextInput, TouchableOpacity,
  FlatList, ActivityIndicator, Image, Keyboard, ScrollView,
  Modal, Animated, PanResponder, Platform, Pressable, KeyboardAvoidingView, Alert, useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSearch } from '@/hooks/useSearch';
import { useAskAI } from '@/hooks/useAskAI';
import { isImageFile, getMimeType, getFileColor, formatSize } from '@/utils/files';
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
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { addFavourite, removeFavourite, isFavourite } from '@/hooks/useFavourites';
import RNFS from 'react-native-fs';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { setAiSearchListening } from '@/app/_layout';
import { useTheme } from '@/hooks/useTheme';
import { useTrash } from '@/hooks/useTrash';
import { openFile as openFileNative } from '@/modules/share-module';
import { DocIndexer, IndexedFile } from '@/modules/doc-indexer';
import { scanFile } from '@/modules/share-module';

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
File counts: ${fileCounts.images} images (${imageBreakdown}), ${fileCounts.videos} videos (${videoBreakdown}), ${fileCounts.documents} documents, ${fileCounts.downloads} downloads.
Screenshots: exactly ${mediaContext.screenshotCount} files (do not count manually, use this number).
Folder sizes: DCIM/Camera ${folderSizes.dcim}, Pictures ${folderSizes.pictures}, Videos total ${folderSizes.videos}, Downloads ${folderSizes.downloads}, Documents ${folderSizes.documents}, Music ${folderSizes.music}.
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
  const { colors } = useTheme();
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
  const [openingUri, setOpeningUri] = useState<string | null>(null);
  const [movingUri, setMovingUri] = useState<string | null>(null);
  const [smartQuery, setSmartQuery] = useState('');
  const [smartResults, setSmartResults] = useState<IndexedFile[]>([]);
  const [smartSearching, setSmartSearching] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const smartTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [indexCount, setIndexCount] = useState(0);

  useFocusEffect(
    useCallback(() => {
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
  const pendingItem = useRef<{ name: string; uri: string; inFolder?: boolean } | null>(null);
  const sheetAnim = useRef(new Animated.Value(400)).current;
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy > 10,
      onPanResponderMove: (_, g) => { if (g.dy > 0) sheetAnim.setValue(g.dy); },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 80 || g.vy > 0.5) {
          Animated.timing(sheetAnim, { toValue: 400, duration: 200, useNativeDriver: true }).start(() => {
            setShowSheet(false); setSelectedItem(null); setShowRename(false); setRenameValue(''); setShowRename(false); setRenameValue('');
          });
        } else {
          Animated.spring(sheetAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }).start();
        }
      },
    })
  ).current;

  useSpeechRecognitionEvent('result', (e) => {
    if (!listening) return;
    const text = e.results?.[0]?.transcript ?? '';
    if (text) setAiQuery(text);
  });
  useSpeechRecognitionEvent('end', () => { setListening(false); setAiSearchListening(false); });
  useSpeechRecognitionEvent('error', () => setListening(false));
  useSpeechRecognitionEvent('end', () => { setListening(false); setAiSearchListening(false); });
  useSpeechRecognitionEvent('error', () => setListening(false));
  
  async function toggleListening() {
    if (listening) {
      ExpoSpeechRecognitionModule.stop();
      setAiSearchListening(false);
      return;
    }
    const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!granted) {
      Alert.alert(
        'Microphone access needed',
        'To use voice search, please enable microphone access in your device Settings.',
        [{ text: 'OK' }]
      );
      return;
    }
    setAiQuery('');
    setListening(true);
    setAiSearchListening(true);
    ExpoSpeechRecognitionModule.start({ lang: 'en-US', interimResults: true });
  }

  async function openSheet(item: { name: string; uri: string; inFolder?: boolean }) {
    setSelectedItem(item);
    setFileSize(null);
    setShowSheet(true);
    setShowRename(false);
    setRenameValue('');
    setIsFav(await isFavourite(item.uri));
    Animated.spring(sheetAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }).start();
    try {
      const file = new FileSystem.File(item.uri);
      setFileSize(formatSize(file.size ?? 0));
    } catch { setFileSize('Unknown'); }
  }

  function closeSheet() {
    Animated.timing(sheetAnim, { toValue: 400, duration: 200, useNativeDriver: true }).start(() => {
      setShowSheet(false); setSelectedItem(null); setShowRename(false); setRenameValue('');
    });
  }

  const ROOT_PATH = 'file:///storage/emulated/0/';

  function toPath(uri: string): string { 
    try { return decodeURIComponent(uri.replace('file://', '')); }
    catch { return uri.replace('file://', ''); } 
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
    if (pickerMode === 'copy') {
      const alreadyExists = await RNFS.exists(dst);
      if (alreadyExists) {
        Alert.alert('File already exists', `"${item.name}" already exists in this folder.`);
        return;
      }
    } else {
      const moveExists = await RNFS.exists(dst);
      if (moveExists) {
        Alert.alert('File already exists', `"${item.name}" already exists in this folder.`);
        return;
      }
    }
    setShowPicker(false);
    setPasting(true);
    try {
      if (pickerMode === 'copy') {
        await RNFS.copyFile(src, dst);
        await scanFile(dst).catch(() => {});
        Alert.alert('Success', `"${item.name}" copied successfully.`);
      } else {
        await RNFS.moveFile(src, dst);
        await scanFile(dst).catch(() => {});
        try {
          const sourceFilename = decodeURIComponent(item.uri.split('/').pop() ?? '');
          const allAssets = await MediaLibrary.getAssetsAsync({ first: 5000, mediaType: ['photo', 'video', 'unknown'] });
          const ghost = allAssets.assets.find((a: any) => a.filename === sourceFilename && toPath(a.uri) === src);
          if (ghost) await MediaLibrary.deleteAssetsAsync([ghost]);
        } catch {}
        if (item.inFolder) { removeFolderItem(item.uri); }
        else { removeResult(item.uri); }
        Alert.alert('Success', `"${item.name}" moved successfully.`);
      }
    } catch (e: any) {
      Alert.alert('Error', `Could not ${pickerMode} file.`);
    } finally {
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
    } catch (e: any) {
      Alert.alert('Rename failed', 'Could not rename this file.');
    }
  }

  async function handleShare() {
    if (!selectedItem) return;
    closeSheet();
    try {
      const isPng = selectedItem.name.toLowerCase().endsWith('.png');
      if (isPng) {
        const cacheDir = FileSystem.Paths.cache.uri.endsWith('/') ? FileSystem.Paths.cache.uri : FileSystem.Paths.cache.uri + '/';
        const cacheName = selectedItem.name.replace(/\.png$/i, '.jpg');
        const cacheUri = cacheDir + cacheName;
        const cacheFile = new FileSystem.File(cacheUri);
        if (cacheFile.exists) cacheFile.delete();
        const result = await ImageManipulator.manipulate(selectedItem.uri)
          .renderAsync()
          .then(img => img.saveAsync({ compress: 0.98, format: SaveFormat.JPEG }));
        const convertedFile = new FileSystem.File(result.uri);
        convertedFile.copy(cacheFile);
        await Sharing.shareAsync(cacheUri, { dialogTitle: selectedItem.name, mimeType: 'image/jpeg' });
      } else {
        await Sharing.shareAsync(selectedItem.uri, { mimeType: getMimeType(selectedItem.name), dialogTitle: selectedItem.name });
      }
    } catch (e) {}
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
      Alert.alert('Added to Favourites', `"${selectedItem.name}" added.`);
    }
  }

  const [folderStack, setFolderStack] = useState<{ name: string; uri: string; items: { name: string; uri: string; isDirectory: boolean }[] }[]>([]);
  const [folderLoading, setFolderLoading] = useState(false);

  async function openFolder(item: { name: string; uri: string }) {
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
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => search(text), 300);
  }

  async function handleAsk(question?: string) {
    const q = question ?? aiQuery;
    if (q.trim().length < 3) return;
    Keyboard.dismiss();
    const context = buildContext(storageInfo, fileCounts, folderSizes, mediaContext, largestFiles);
    await ask(q, context);
  }

  async function openFile(name: string, uri: string) {
    setOpeningUri(uri);
    await addRecent({ name, uri, openedAt: Date.now() });
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

  async function scanDir(base: string, extensions: string[], results: { uri: string; name: string }[], remaining: { count: number }) {
    if (remaining.count <= 0) return;
    try {
      const dir = new FileSystem.Directory(base);
      const contents = dir.list();
      for (const item of contents) {
        if (remaining.count <= 0) return;
        if (item instanceof FileSystem.File) {
          const lower = item.name.toLowerCase();
          if (!extensions.some(ext => lower.endsWith(ext))) continue;
          if (remaining.count <= 0) break;
          const alreadyIndexed = await DocIndexer.isIndexed(item.uri);
          if (!alreadyIndexed && remaining.count > 0) {
            results.push({ uri: item.uri, name: item.name });
            remaining.count--;
          }
        }else if (item instanceof FileSystem.Directory && remaining.count > 0) {
          await scanDir(item.uri, extensions, results, remaining);
        }
      }
    } catch {}
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
          <Text style={{ fontSize: 13, color: colors.textSecondary }}>{pickerMode === 'copy' ? 'Copying...' : 'Moving...'} {pendingItem.current?.name}</Text>
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
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => { setQuery(''); search(''); }}>
                <Ionicons name="close-circle" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          {searching ? (
            <View style={styles.centered}>
              <ActivityIndicator color={colors.blue} />
              <Text style={[styles.hint, { color: colors.textMuted }]}>Searching...</Text>
            </View>
          ) : query.length < 2 ? (
            <View style={styles.centered}>
              <Ionicons name="search-outline" size={40} color={colors.textDisabled} />
              <Text style={[styles.hint, { color: colors.textMuted }]}>Type at least 2 characters</Text>
            </View>
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
                    onLongPress={() => !item.isDirectory && openSheet(item)}
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
                        <Text style={[styles.extLabel, { color }]}>{ext.slice(0, 4)}</Text>
                      )}
                    </View>
                    <View style={styles.fileInfo}>
                      <Text style={[styles.fileName, { color: colors.textPrimary }]} numberOfLines={1}>{item.name}</Text>
                      <Text style={[styles.fileMeta, { color: colors.textMuted }]}>{item.isDirectory ? 'Folder' : ext + ' file'}</Text>
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
                <TouchableOpacity onPress={toggleListening} style={{ opacity: thinking ? 0.4 : 1 }} disabled={thinking}>
                  <Ionicons name={listening ? 'stop-circle' : 'mic-outline'} size={18} color={listening ? colors.deleteRed : colors.textMuted} />
                </TouchableOpacity>
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
                const ext = item.name.split('.').pop()?.toUpperCase() ?? '?';
                return (
                  <TouchableOpacity
                    style={[styles.smartRow, { borderBottomColor: colors.border }]}
                    onPress={() => openFile(item.name, item.uri)}
                    onLongPress={() => openSheet(item)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.fileIcon, { backgroundColor: color + '22' }]}>
                      <Text style={[styles.extLabel, { color }]}>{ext.slice(0, 4)}</Text>
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
                              <Text style={[styles.extLabel, { color }]}>{ext.slice(0, 4)}</Text>
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
                : [styles.sheet, { backgroundColor: colors.card, transform: [{ translateY: sheetAnim }], paddingBottom: insets.bottom + 16, paddingLeft: insets.left + 16, paddingRight: insets.right + 16 }]
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
                    <Text style={[styles.extLabel, { color: getFileColor(selectedItem?.name ?? '') }]}>
                      {selectedItem?.name.split('.').pop()?.toUpperCase().slice(0, 4)}
                    </Text>
                  )}
                </View>
                  <View style={styles.sheetFileInfo}>
                    <Text style={[styles.sheetFileName, { color: colors.textPrimary }]} numberOfLines={2}>{selectedItem?.name}</Text>
                    {fileSize && <Text style={[styles.sheetFileMeta, { color: colors.textMuted }]}>{fileSize}</Text>}
                  </View>
                </View>
                <View style={[styles.sheetDivider, { backgroundColor: colors.border }]} />
                <TouchableOpacity style={styles.sheetAction} onPress={handleShare}>
                  <Ionicons name="share-outline" size={20} color={colors.textPrimary} />
                  <Text style={[styles.sheetActionText, { color: colors.textPrimary }]}>Share</Text>
                </TouchableOpacity>
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
                <TouchableOpacity style={styles.sheetAction} onPress={() => {
                  closeSheet();
                  const locationRaw = selectedItem?.uri.replace('file:///storage/emulated/0/', '').split('/').slice(0, -1).join('/') || 'Storage';
                  const location = (() => { try { return decodeURIComponent(locationRaw); } catch { return locationRaw; } })();
                  Alert.alert(selectedItem?.name ?? '', [
                    fileSize ? `Size: ${fileSize}` : null,
                    `Type: ${selectedItem?.name.split('.').pop()?.toUpperCase()} file`,
                    `Location: /${location}`,
                  ].filter(Boolean).join('\n'));
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
                if (pickerPath === ROOT_PATH) { setShowPicker(false); }
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
            {(() => { try { return decodeURIComponent(pickerPath.replace('file:///storage/emulated/0/', 'Storage/')); } catch { return pickerPath.replace('file:///storage/emulated/0/', 'Storage/'); } })()}
          </Text>
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
                      <Text style={[styles.extLabel, { color: getFileColor(item.name) }]}>{item.name.split('.').pop()?.toUpperCase().slice(0, 4)}</Text>
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
});
