import React, { useState, useEffect, useRef, useCallback } from 'react';
import { StyleSheet, Text, View, FlatList, TouchableOpacity, Image, ActivityIndicator, Modal, Animated, PanResponder, Pressable, Alert, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { isImageFile, getMimeType } from '@/utils/files';
import { addRecent } from '@/hooks/useRecents';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { addFavourite, removeFavourite, isFavourite } from '@/hooks/useFavourites';
import RNFS from 'react-native-fs';
import { useVault } from '@/hooks/useVault';
import { usePro } from '@/hooks/usePro';
import { useTheme } from '@/hooks/useTheme';
import * as VideoThumbnails from 'expo-video-thumbnails';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import { shareFiles } from '@/modules/share-module';

type Category = 'images' | 'videos' | 'documents' | 'downloads';

interface FileItem {
  name: string;
  uri: string;
  size?: number;
  date?: number;
}

function formatSize(bytes: number): string {
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + ' GB';
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
  if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return bytes + ' B';
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
}

function isVideoFile(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return ['mp4', 'mkv', 'avi', 'mov', 'webm', '3gp'].includes(ext);
}

function VideoThumb({ uri, style }: { uri: string; style: any }) {
  const [thumb, setThumb] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const result = await VideoThumbnails.getThumbnailAsync(uri, { time: 5010 });
        setThumb(result.uri);
      } catch {}
    })();
  }, [uri]);
  if (!thumb) return null;
  return <Image source={{ uri: thumb }} style={style} resizeMode="cover" />;
}

const CATEGORY_CONFIG: Record<Category, { title: string; icon: string; color: string }> = {
  images: { title: 'Images', icon: 'image-outline', color: '#185FA5' },
  videos: { title: 'Videos', icon: 'videocam-outline', color: '#993C1D' },
  documents: { title: 'Documents', icon: 'document-outline', color: '#534AB7' },
  downloads: { title: 'Downloads', icon: 'download-outline', color: '#3B6D11' },
};

const DOCUMENT_EXTENSIONS = [
  '.pdf', '.doc', '.docx', '.xls', '.xlsx',
  '.ppt', '.pptx', '.txt', '.csv', '.rtf',
  '.odt', '.ods', '.odp', '.pages', '.numbers',
];

function ensureTrailingSlash(uri: string): string {
  return uri.endsWith('/') ? uri : uri + '/';
}

async function scanDirForDocs(path: string): Promise<FileItem[]> {
  const found: FileItem[] = [];
  try {
    const dir = new FileSystem.Directory(ensureTrailingSlash(path));
    const contents = dir.list();
    for (const item of contents) {
      if (item instanceof FileSystem.File) {
        const lower = item.name.toLowerCase();
        if (DOCUMENT_EXTENSIONS.some(ext => lower.endsWith(ext))) {
          found.push({ name: item.name, uri: item.uri, size: item.size ?? 0 });
        }
      } else if (item instanceof FileSystem.Directory) {
        const subDocs = await scanDirForDocs(ensureTrailingSlash(item.uri));
        found.push(...subDocs);
      }
    }
  } catch {}
  return found;
}

async function scanDirForDownloads(path: string): Promise<FileItem[]> {
  const found: FileItem[] = [];
  try {
    const dir = new FileSystem.Directory(ensureTrailingSlash(path));
    const contents = dir.list();
    for (const item of contents) {
      if (item instanceof FileSystem.File) {
        if (!item.name.startsWith('.')) {
          found.push({ name: item.name, uri: item.uri, size: item.size ?? 0 });
        }
      } else if (item instanceof FileSystem.Directory) {
        const subItems = await scanDirForDownloads(ensureTrailingSlash(item.uri));
        found.push(...subItems);
      }
    }
  } catch {}
  return found;
}

const DOC_TABS = ['All', 'PDF', 'Word', 'Excel', 'Other'] as const;
const DL_TABS  = ['All', 'APK', 'PDF', 'Docs', 'Other'] as const;

function getDocTab(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'pdf') return 'PDF';
  if (['doc', 'docx', 'txt', 'rtf', 'odt', 'pages'].includes(ext)) return 'Word';
  if (['xls', 'xlsx', 'csv', 'ods', 'numbers'].includes(ext)) return 'Excel';
  if (['ppt', 'pptx', 'odp'].includes(ext)) return 'Other';
  return 'Other';
}

function getDlTab(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'apk') return 'APK';
  if (ext === 'pdf') return 'PDF';
  if (['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv'].includes(ext)) return 'Docs';
  return 'Other';
}

const SCREEN_WIDTH = require('react-native').Dimensions.get('window').width;
const GRID_COLS = 3;
const GRID_ITEM_SIZE = (SCREEN_WIDTH - 32 - (GRID_COLS - 1) * 3) / GRID_COLS;

export default function CategoryScreen() {
  const { colors } = useTheme();
  const { category } = useLocalSearchParams<{ category: Category }>();
  const [items, setItems] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('All');
  const [selectedItem, setSelectedItem] = useState<FileItem | null>(null);
  const [showSheet, setShowSheet] = useState(false);
  const [fileSize, setFileSize] = useState<string | null>(null);
  const [isFav, setIsFav] = useState(false);
  const insets = useSafeAreaInsets();
  const sheetAnim = useRef(new Animated.Value(400)).current;
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy > 10,
      onPanResponderMove: (_, g) => { if (g.dy > 0) sheetAnim.setValue(g.dy); },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 80 || g.vy > 0.5) {
          Animated.timing(sheetAnim, { toValue: 400, duration: 200, useNativeDriver: true }).start(() => {
            setShowSheet(false); setSelectedItem(null);
          });
        } else {
          Animated.spring(sheetAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }).start();
        }
      },
    })
  ).current;
  const sharingRef = useRef(false);
  const [showRename, setShowRename] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [pickerMode, setPickerMode] = useState<'copy' | 'move'>('copy');
  const [pickerPath, setPickerPath] = useState('file:///storage/emulated/0/');
  const [pickerItems, setPickerItems] = useState<{ name: string; uri: string }[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const pendingItem = useRef<FileItem | null>(null);
  const router = useRouter();
  const config = CATEGORY_CONFIG[category ?? 'images'];
  const { addToVault } = useVault();
  const { isPro } = usePro();
  type SortKey = 'name' | 'size' | 'date';
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [showSortSheet, setShowSortSheet] = useState(false);
  const [gridView, setGridView] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedUris, setSelectedUris] = useState<Set<string>>(new Set());
  const [selectedItemsMap, setSelectedItemsMap] = useState<Map<string, FileItem>>(new Map());
  const [sharing, setSharing] = useState(false);
  const isMediaCategory = category === 'images' || category === 'videos';

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
        .map((item: any) => ({
          name: (() => { try { return decodeURIComponent(item.uri.split('/').filter(Boolean).pop() ?? ''); } catch { return item.uri.split('/').filter(Boolean).pop() ?? ''; } })(),
          uri: item.uri,
        }))
        .filter((f: any) => !f.name.startsWith('.'))
        .sort((a: any, b: any) => a.name.localeCompare(b.name));
      setPickerItems(folders);
    } catch { setPickerItems([]); }
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
    try {
      const src = toPath(item.uri);
      const dst = toPath(destUri);
      if (pickerMode === 'copy') {
        const alreadyExists = await RNFS.exists(dst);
        if (alreadyExists){
          setShowPicker(false);
          Alert.alert('File already exists', `"${item.name}" already exists in this folder.`);
          return;
        }
        await RNFS.copyFile(src, dst);
        setShowPicker(false);
        Alert.alert('Success', `"${item.name}" copied successfully.`);
      } else {
        const moveExists = await RNFS.exists(dst);
        if (moveExists) {
          setShowPicker(false);
          Alert.alert('File already exists', `"${item.name}" already exists in this folder.`);
          return;
        }
        await RNFS.moveFile(src, dst);
        try {
          const sourceFilename = decodeURIComponent(item.uri.split('/').pop() ?? '');
          const allAssets = await MediaLibrary.getAssetsAsync({ first: 5000, mediaType: ['photo', 'video', 'unknown'] });
          const ghost = allAssets.assets.find((a: any) => a.filename === sourceFilename && toPath(a.uri) === src);
          if (ghost) await MediaLibrary.deleteAssetsAsync([ghost]);
        } catch {}
        setItems(prev => prev.filter(f => f.uri !== item.uri));
        setShowPicker(false);
        Alert.alert('Success', `"${item.name}" moved successfully.`);
      }
    } catch (e: any) {
      Alert.alert('Error', `Could not ${pickerMode} file.`);
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
      try {
        const sourceFilename = decodeURIComponent(selectedItem.uri.split('/').pop() ?? '');
        const allAssets = await MediaLibrary.getAssetsAsync({ first: 5000, mediaType: ['photo', 'video', 'unknown'] });
        const ghost = allAssets.assets.find((a: any) => a.filename === sourceFilename && toPath(a.uri) === toPath(selectedItem.uri));
        if (ghost) await MediaLibrary.deleteAssetsAsync([ghost]);
      } catch {}
      setItems(prev => prev.map(f => f.uri === selectedItem.uri ? { ...f, name: renameValue.trim(), uri: newUri } : f));
      closeSheet();
    } catch (e: any) {
      Alert.alert('Rename failed', 'Could not rename this file.');
    }
  }

  useEffect(() => {
    loadCategory();
  }, [category]);

  async function openSheet(item: FileItem) {
    setSelectedItem(item);
    setFileSize(item.size && item.size > 0 ? formatSize(item.size) : 'Calculating...');
    setIsFav(await isFavourite(item.uri));
    setShowSheet(true);
    Animated.spring(sheetAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }).start();
    if (!item.size || item.size === 0) {
      try {
        const file = new FileSystem.File(item.uri);
        if (file.size && file.size > 0) { setFileSize(formatSize(file.size)); return; }
      } catch {}
      setFileSize('Unknown');
    }
  }

  function closeSheet() {
    Animated.timing(sheetAnim, { toValue: 400, duration: 200, useNativeDriver: true }).start(() => {
      setShowSheet(false); setSelectedItem(null); setShowRename(false); setRenameValue('');
    });
  }

  async function handleDelete() {
    if (!selectedItem) return;
    Alert.alert('Delete', `Delete "${selectedItem.name}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        closeSheet();
        try {
          const assets = await MediaLibrary.getAssetsAsync({ first: 1000 });
          const match = assets.assets.find(a => selectedItem.uri.includes(a.filename));
          if (match) { await MediaLibrary.deleteAssetsAsync([match]); }
          else { const f = new FileSystem.File(selectedItem.uri); f.delete(); }
          setItems(prev => prev.filter(f => f.uri !== selectedItem.uri));
        } catch (e) { Alert.alert('Error', 'Could not delete file.'); }
      }},
    ]);
  }

  async function loadCategory() {
    setLoading(true);
    try {
      if (category === 'images' || category === 'videos') {
        const mediaType = category === 'images' ? 'photo' : 'video';
        const all: MediaLibrary.Asset[] = [];
        let after: string | undefined;
        for (let page = 0; page < 100; page++) {
          const result = await MediaLibrary.getAssetsAsync({ mediaType, first: 50, after });
          all.push(...result.assets);
          if (!result.hasNextPage || !result.endCursor || result.assets.length === 0) break;
          after = result.endCursor;
        }
        const sorted = all.sort((a, b) => {
          const at = a.creationTime > 0 ? a.creationTime : a.modificationTime;
          const bt = b.creationTime > 0 ? b.creationTime : b.modificationTime;
          return bt - at;
        });
        setItems(sorted.map(a => ({
          name: a.filename,
          uri: a.uri,
          date: a.creationTime > 0 ? a.creationTime : a.modificationTime,
        })));
      } else if (category === 'downloads') {
        const dlItems = await scanDirForDownloads('file:///storage/emulated/0/Download/');
        setItems(dlItems.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '')));
      } else if (category === 'documents') {
        const docPaths = [
          'file:///storage/emulated/0/Documents/',
          'file:///storage/emulated/0/Download/',
          'file:///storage/emulated/0/Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Documents/',
          'file:///storage/emulated/0/Android/media/com.whatsapp.w4b/WhatsApp Business/Media/WhatsApp Business Documents/',
          'file:///storage/emulated/0/Android/media/org.telegram.messenger/Telegram/Telegram Documents/',
        ];
        const STANDARD_ROOT = ['Download', 'Documents', 'Pictures', 'Movies', 'Music', 'DCIM', 'Recordings', 'Android'];
        try {
          const rootItems = await RNFS.readDir('/storage/emulated/0/');
          for (const item of rootItems) {
            if (!item.isDirectory()) continue;
            if (item.name.startsWith('.')) continue;
            if (STANDARD_ROOT.includes(item.name)) continue;
            docPaths.push(`file://${item.path}/`);
          }
        } catch {}
        const results = await Promise.all(docPaths.map(p => scanDirForDocs(p)));
        const all = results.flat();
        const unique = all.filter((f, i, arr) => arr.findIndex(x => x.uri === f.uri) === i);
        setItems(unique.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '')));
      }
    } catch (e) {
    } finally {
      setLoading(false);
    }
  }

  async function openItem(item: FileItem) {
    await addRecent({ name: item.name, uri: item.uri, openedAt: Date.now() });
    try {
      const cachePath = `${RNFS.CachesDirectoryPath}/${item.name}`;
      const srcPath = item.uri.replace('file://', '');
      await RNFS.copyFile(srcPath, cachePath);
      const contentUri = await FileSystemLegacy.getContentUriAsync('file://' + cachePath);
      await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
        data: contentUri,
        flags: 1,
        type: getMimeType(item.name),
      });
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
          closeSheet();
          const ok = await addToVault(selectedItem.uri, selectedItem.name);
          if (ok) { setItems(prev => prev.filter(f => f.uri !== selectedItem.uri)); }
          else Alert.alert('Error', 'Could not move file to Vault. Try again.');
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

  async function handleMultiShare() {
    if (sharingRef.current) return;
    sharingRef.current = true;
    setSharing(true);
    const files = Array.from(selectedItemsMap.values());
    try {
      const paths: string[] = [];
      for (const file of files) {
        const isPng = file.name.toLowerCase().endsWith('.png');
        if (isPng) {
          const cacheDir = FileSystem.Paths.cache.uri.endsWith('/') ? FileSystem.Paths.cache.uri : FileSystem.Paths.cache.uri + '/';
          const cacheName = file.name.replace(/\.png$/i, '.jpg');
          const cacheUri = cacheDir + cacheName;
          const cacheFile = new FileSystem.File(cacheUri);
          if (cacheFile.exists) cacheFile.delete();
          const result = await ImageManipulator.manipulate(file.uri)
            .renderAsync()
            .then(img => img.saveAsync({ compress: 0.98, format: SaveFormat.JPEG }));
          const convertedFile = new FileSystem.File(result.uri);
          convertedFile.copy(cacheFile);
          paths.push(cacheUri.replace('file://', ''));
        } else {
          const cachePath = `${RNFS.CachesDirectoryPath}/${file.name}`;
          await RNFS.copyFile(file.uri.replace('file://', ''), cachePath);
          paths.push(cachePath);
        }
      }
      const mimeType = files.length === 1 ? getMimeType(files[0].name) : '*/*';
      await shareFiles(paths, mimeType);
    } catch (e) {}
    finally { sharingRef.current = false; setSharing(false); }
  }

  async function handleMultiVault() {
    if (!isPro) {
      Alert.alert('Pro Feature', 'Upgrade to AskFiles Pro to move files to the Vault.', [
        { text: 'Not now', style: 'cancel' },
        { text: 'Upgrade', onPress: () => router.push('/(tabs)/cloud') },
      ]);
      return;
    }
    const files = Array.from(selectedItemsMap.values());
    Alert.alert('Move to Vault', `Move ${files.length} file${files.length !== 1 ? 's' : ''} to your Secure Vault?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Move', onPress: async () => {
        for (const file of files) { await addToVault(file.uri, file.name); }
        setItems(prev => prev.filter(f => !selectedUris.has(f.uri)));
        setSelectMode(false); setSelectedUris(new Set()); setSelectedItemsMap(new Map());
      }},
    ]);
  }
  
  async function handleMultiDelete() {
    const files = Array.from(selectedItemsMap.values());
    Alert.alert('Delete', `Delete ${files.length} file${files.length !== 1 ? 's' : ''}? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        for (const file of files) {
          try {
            const assets = await MediaLibrary.getAssetsAsync({ first: 1000 });
            const match = assets.assets.find(a => file.uri.includes(a.filename));
            if (match) { await MediaLibrary.deleteAssetsAsync([match]); }
            else { const f = new FileSystem.File(file.uri); f.delete(); }
          } catch {}
        }
        setItems(prev => prev.filter(f => !selectedUris.has(f.uri)));
        setSelectMode(false); setSelectedUris(new Set()); setSelectedItemsMap(new Map());
      }},
    ]);
  }
  
  async function handleMultiInfo() {
    const files = Array.from(selectedItemsMap.values());
    let totalSize = 0;
    for (const file of files) {
      try {
        const f = new FileSystem.File(file.uri);
        totalSize += f.size ?? 0;
      } catch {}
    }
    Alert.alert(`${files.length} file${files.length !== 1 ? 's' : ''} selected`, `Total size: ${formatSize(totalSize)}`);
  }

  const tabs = category === 'documents' ? DOC_TABS : category === 'downloads' ? DL_TABS : null;

  const filteredItems = (tabs && activeTab !== 'All'
    ? items.filter(item => {
        const tab = category === 'documents' ? getDocTab(item.name) : getDlTab(item.name);
        return tab === activeTab;
      })
    : items
  ).slice().sort((a, b) => {
    if (sortKey === 'name') return a.name.localeCompare(b.name);
    if (sortKey === 'size') return (b.size ?? 0) - (a.size ?? 0);
    if (sortKey === 'date') return (b.date ?? 0) - (a.date ?? 0);
    return 0;
  });

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.background }]}>
        {selectMode ? (
          <>
            <TouchableOpacity onPress={() => { setSelectMode(false); setSelectedUris(new Set()); setSelectedItemsMap(new Map()); }} style={styles.backBtn}>
              <Ionicons name="close" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={[styles.title, { color: colors.textPrimary }]}>{selectedUris.size} selected</Text>
            <View style={{ width: 40 }} />
          </>
        ) : (
          <>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={[styles.title, { color: colors.textPrimary }]}>{config.title}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <TouchableOpacity onPress={() => { setSelectMode(true); setSelectedUris(new Set()); setSelectedItemsMap(new Map()); }} style={{ width: 40, height: 40, justifyContent: 'center', alignItems: 'center' }}>
                <Ionicons name="checkmark-circle-outline" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
              {isMediaCategory && (
                <TouchableOpacity onPress={() => setGridView(v => !v)} style={{ width: 40, height: 40, justifyContent: 'center', alignItems: 'center' }}>
                  <Ionicons name={gridView ? 'list-outline' : 'grid-outline'} size={22} color={colors.textSecondary} />
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => setShowSortSheet(true)} style={{ width: 40, height: 40, justifyContent: 'center', alignItems: 'center' }}>
                <Ionicons name="swap-vertical-outline" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
      {tabs && (
        <View style={styles.tabsRow}>
          {tabs.map(tab => (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, { backgroundColor: colors.surface }, activeTab === tab && { backgroundColor: colors.textPrimary }]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabText, { color: colors.textSecondary }, activeTab === tab && { color: colors.background }]}>{tab}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={config.color} />
        </View>
      ) : filteredItems.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name={config.icon as any} size={40} color={colors.textDisabled} />
          <Text style={[styles.empty, { color: colors.textMuted }]}>No {activeTab === 'All' ? config.title.toLowerCase() : activeTab + ' files'} found</Text>
        </View>
      ) : (
        <FlatList
          data={filteredItems}
          keyExtractor={item => item.uri}
          key={isMediaCategory && gridView ? 'grid' : 'list'}
          numColumns={isMediaCategory && gridView ? 3 : 1}
          renderItem={isMediaCategory && gridView
            ? ({ item }) => {
                const isSelected = selectedUris.has(item.uri);
                const isImg = isImageFile(item.name);
                const isVid = category === 'videos';
                return (
                  <TouchableOpacity
                    style={[styles.gridItem, { width: GRID_ITEM_SIZE, height: GRID_ITEM_SIZE, borderWidth: isSelected ? 3 : 0, borderColor: colors.blue }]}
                    onPress={() => {
                      if (selectMode) {
                        const newSet = new Set(selectedUris);
                        const newMap = new Map(selectedItemsMap);
                        if (isSelected) { newSet.delete(item.uri); newMap.delete(item.uri); }
                        else { newSet.add(item.uri); newMap.set(item.uri, item); }
                        setSelectedUris(newSet); setSelectedItemsMap(newMap);
                      } else { openItem(item); }
                    }}
                    onLongPress={() => !selectMode && openSheet(item)}
                    activeOpacity={0.8}
                  >
                    {isImg ? (
                      <Image source={{ uri: item.uri }} style={styles.gridThumb} resizeMode="cover" />
                    ) : isVid ? (
                      <VideoThumb uri={item.uri} style={styles.gridThumb} />
                    ) : (
                      <View style={[styles.gridThumb, { backgroundColor: config.color + '22', alignItems: 'center', justifyContent: 'center' }]}>
                        <Ionicons name="videocam" size={32} color={config.color} />
                      </View>
                    )}
                    {isVid && !selectMode && (
                      <View style={{ position: 'absolute', bottom: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 4, padding: 2 }}>
                        <Ionicons name="play" size={10} color="#fff" />
                      </View>
                    )}
                    {selectMode && isSelected && (
                      <View style={{ position: 'absolute', top: 4, right: 4, backgroundColor: colors.blue, borderRadius: 10, width: 20, height: 20, alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="checkmark" size={12} color="#fff" />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              }
            : ({ item }) => {
                const isSelected = selectedUris.has(item.uri);
                const isImg = isImageFile(item.name);
                const ext = item.name.split('.').pop()?.toUpperCase() ?? '?';
                return (
                  <TouchableOpacity
                    style={[styles.row, { borderBottomColor: colors.border, backgroundColor: isSelected ? colors.blueTint : 'transparent' }]}
                    onPress={() => {
                      if (selectMode) {
                        const newSet = new Set(selectedUris);
                        const newMap = new Map(selectedItemsMap);
                        if (isSelected) { newSet.delete(item.uri); newMap.delete(item.uri); }
                        else { newSet.add(item.uri); newMap.set(item.uri, item); }
                        setSelectedUris(newSet); setSelectedItemsMap(newMap);
                      } else { openItem(item); }
                    }}
                    onLongPress={() => !selectMode && openSheet(item)}
                    activeOpacity={0.7}
                  >
                    {selectMode && (
                      <View style={{ marginRight: 12 }}>
                        <Ionicons name={isSelected ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={isSelected ? colors.blue : colors.textMuted} />
                      </View>
                    )}
                    <View style={[styles.icon, { backgroundColor: config.color + '22', overflow: 'hidden' }]}>
                      {isImg ? (
                        <Image source={{ uri: item.uri }} style={styles.thumb} resizeMode="cover" />
                      ) : isVideoFile(item.name) ? (
                        <VideoThumb uri={item.uri} style={styles.thumb} />
                      ) : (
                        <Text style={[styles.ext, { color: config.color }]}>{ext.slice(0, 4)}</Text>
                      )}
                    </View>
                    <View style={styles.info}>
                      <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>{item.name}</Text>
                      <Text style={[styles.meta, { color: colors.textMuted }]}>
                        {item.size ? formatSize(item.size) : ''}
                        {item.size && item.date ? ' · ' : ''}
                        {item.date ? timeAgo(item.date) : ''}
                      </Text>
                    </View>
                    {!selectMode && (
                      <TouchableOpacity onPress={() => openSheet(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Ionicons name="chevron-forward" size={16} color={colors.textDisabled} />
                      </TouchableOpacity>
                    )}
                  </TouchableOpacity>
                );
              }
          }
          contentContainerStyle={isMediaCategory && gridView ? styles.gridContainer : styles.list}
          columnWrapperStyle={isMediaCategory && gridView ? styles.gridRow : undefined}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <Text style={[styles.count, { color: colors.textMuted }]}>{filteredItems.length} {activeTab === 'All' ? config.title.toLowerCase() : activeTab.toLowerCase() + ' files'}</Text>
          }
        />
      )}
      <Modal visible={showSheet} transparent animationType="none" onRequestClose={closeSheet}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'android' ? 'height' : 'padding'}>
        <Pressable style={styles.overlay} onPress={closeSheet}>
          <Animated.View
            style={[styles.sheet, { backgroundColor: colors.card, transform: [{ translateY: sheetAnim }], paddingBottom: insets.bottom + 16 }]}
            {...panResponder.panHandlers}
          >
            <Pressable>
              <View style={[styles.sheetHandle, { backgroundColor: colors.textDisabled }]} />
              <View style={styles.sheetHeader}>
              <View style={[styles.sheetIcon, { backgroundColor: config.color + '22', overflow: 'hidden' }]}>
                {isImageFile(selectedItem?.name ?? '') ? (
                  <Image source={{ uri: selectedItem?.uri }} style={styles.sheetThumb} resizeMode="cover" />
                ) : isVideoFile(selectedItem?.name ?? '') ? (
                  <VideoThumb uri={selectedItem?.uri ?? ''} style={styles.sheetThumb} />
                ) : (
                  <Text style={[styles.ext, { color: config.color }]}>
                    {selectedItem?.name.split('.').pop()?.toUpperCase().slice(0, 4)}
                  </Text>
                )}
              </View>
                <View style={styles.sheetInfo}>
                  <Text style={[styles.sheetName, { color: colors.textPrimary }]} numberOfLines={2}>{selectedItem?.name}</Text>
                  {fileSize && <Text style={[styles.sheetMeta, { color: colors.textMuted }]}>{fileSize}</Text>}
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
          </Animated.View>
        </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={showPicker} transparent={false} animationType="slide" onRequestClose={() => setShowPicker(false)}>
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
          <View style={[styles.header, { backgroundColor: colors.background }]}>
            <TouchableOpacity
              onPress={() => {
                if (pickerPath === ROOT_PATH) { setShowPicker(false); }
                else {
                  const parent = pickerPath.endsWith('/') ? pickerPath.slice(0, -1) : pickerPath;
                  const up = parent.substring(0, parent.lastIndexOf('/') + 1);
                  setPickerPath(up);
                  loadPickerDir(up);
                }
              }}
              style={styles.backBtn}
            >
              <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
              {pickerMode === 'copy' ? 'Copy to...' : 'Move to...'}
            </Text>
            <View style={{ width: 40 }} />
          </View>
          <Text style={{ fontSize: 12, color: colors.textMuted, paddingHorizontal: 16, paddingBottom: 8 }}>
            {(() => { try { return decodeURIComponent(pickerPath.replace('file:///storage/emulated/0/', 'Storage/')); } catch { return pickerPath.replace('file:///storage/emulated/0/', 'Storage/'); } })()}
          </Text>
          {pickerLoading ? (
            <View style={styles.centered}><ActivityIndicator color={colors.blue} /></View>
          ) : pickerItems.length === 0 ? (
            <View style={styles.centered}><Text style={[styles.empty, { color: colors.textMuted }]}>No folders here</Text></View>
          ) : (
            <FlatList
              data={pickerItems}
              keyExtractor={item => item.uri}
              contentContainerStyle={[styles.list, { paddingBottom: 100 }]}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.row, { borderBottomColor: colors.border }]}
                  onPress={() => { setPickerPath(item.uri); loadPickerDir(item.uri); }}
                  activeOpacity={0.6}
                >
                  <View style={[styles.icon, { backgroundColor: colors.yellow + '22' }]}>
                    <Ionicons name="folder" size={22} color={colors.yellow} />
                  </View>
                  <View style={styles.info}>
                    <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>{item.name}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.textDisabled} />
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

      <Modal visible={showSortSheet} transparent animationType="fade" onRequestClose={() => setShowSortSheet(false)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }} activeOpacity={1} onPress={() => setShowSortSheet(false)}>
          <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, gap: 8, paddingBottom: insets.bottom + 24 }}>
            <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textMuted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Sort by</Text>
            {(['name', ...(category === 'documents' || category === 'downloads' ? ['size'] : []), 'date'] as SortKey[]).map(key => (
              <TouchableOpacity
                key={key}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: colors.border }}
                onPress={() => { setSortKey(key); setShowSortSheet(false); }}
              >
                <Text style={{ fontSize: 15, color: sortKey === key ? colors.blue : colors.textPrimary, fontWeight: sortKey === key ? '600' : '400' }}>
                  {key === 'name' ? 'Name' : key === 'size' ? 'Size (largest first)' : 'Date (newest first)'}
                </Text>
                {sortKey === key && <Ionicons name="checkmark" size={18} color={colors.blue} />}
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={{ alignItems: 'center', paddingVertical: 14, backgroundColor: colors.surface, borderRadius: 10, marginTop: 4 }} onPress={() => setShowSortSheet(false)}>
              <Text style={{ fontSize: 14, fontWeight: '500', color: colors.textSecondary }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
      {selectMode && selectedUris.size > 0 && (
        <View style={{ flexDirection: 'row', padding: 12, gap: 8, borderTopWidth: 0.5, borderTopColor: colors.border, backgroundColor: colors.background, paddingBottom: insets.bottom + 12 }}>
          <TouchableOpacity
            onPress={handleMultiShare}
            disabled={sharing}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: sharing ? colors.surface : colors.blue, borderRadius: 12, paddingVertical: 12 }}
          >
            <Ionicons name="share-outline" size={20} color={sharing ? colors.textMuted : '#fff'} />
            <Text style={{ fontSize: 11, color: sharing ? colors.textMuted : '#fff', marginTop: 2 }}>Share</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleMultiVault}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderRadius: 12, paddingVertical: 12 }}
          >
            <Ionicons name="shield-checkmark-outline" size={20} color={isPro ? colors.blue : colors.textMuted} />
            <Text style={{ fontSize: 11, color: isPro ? colors.blue : colors.textMuted, marginTop: 2 }}>Vault</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleMultiInfo}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderRadius: 12, paddingVertical: 12 }}
          >
            <Ionicons name="information-circle-outline" size={20} color={colors.textPrimary} />
            <Text style={{ fontSize: 11, color: colors.textPrimary, marginTop: 2 }}>Info</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleMultiDelete}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderRadius: 12, paddingVertical: 12 }}
          >
            <Ionicons name="trash-outline" size={20} color={colors.deleteRed} />
            <Text style={{ fontSize: 11, color: colors.deleteRed, marginTop: 2 }}>Delete</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  title: { flex: 1, fontSize: 20, fontWeight: '500', textAlign: 'center', letterSpacing: -0.5 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  empty: { fontSize: 14 },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  tabsRow: { flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  tab: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },
  tabText: { fontSize: 12, fontWeight: '500' },
  count: { fontSize: 11, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 0.5 },
  icon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  thumb: { width: 40, height: 40 },
  ext: { fontSize: 9, fontWeight: '500' },
  info: { flex: 1 },
  name: { fontSize: 14, fontWeight: '500', marginBottom: 2 },
  meta: { fontSize: 11 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 16 },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 16 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 12 },
  sheetIcon: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  sheetThumb: { width: 44, height: 44 },
  sheetInfo: { flex: 1 },
  sheetName: { fontSize: 14, fontWeight: '500', marginBottom: 2 },
  sheetMeta: { fontSize: 12 },
  sheetDivider: { height: 0.5, marginVertical: 8 },
  sheetAction: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 },
  sheetActionText: { fontSize: 15 },
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
  gridContainer: { paddingHorizontal: 16, paddingBottom: 24 },
  gridRow: { gap: 3, marginBottom: 3 },
  gridItem: { borderRadius: 4, overflow: 'hidden' },
  gridThumb: { width: '100%', height: '100%' },
});
