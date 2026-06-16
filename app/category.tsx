import { copyFileStream, moveFileStream, addCopyProgressListener, startWifiServer } from 'file-reader';
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { StyleSheet, Text, View, FlatList, TouchableOpacity, Image, ActivityIndicator, Modal, Animated, PanResponder, Pressable, Alert, TextInput, KeyboardAvoidingView, Platform, useWindowDimensions, ScrollView, StatusBar } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { isImageFile, getMimeType, formatSize, getFileColor, formatDate, getFileIcon } from '@/utils/files';
import { addRecent } from '@/hooks/useRecents';
import { addFavourite, removeFavourite, isFavourite } from '@/hooks/useFavourites';
import RNFS from 'react-native-fs';
import { useVault } from '@/hooks/useVault';
import { usePro } from '@/hooks/usePro';
import { useTheme } from '@/hooks/useTheme';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import { shareFiles, openFile, printImage, printPdf } from '@/modules/share-module';
import { addMediaStoreChangeListener } from '@/modules/file-watcher';
import QRCode from 'react-native-qrcode-svg';
import { useTrash } from '@/hooks/useTrash';
import { MediaGridView } from 'media-grid';
import { isVideoFile, VideoThumb } from '@/utils/videoThumb';
import { DocIndexer } from '@/modules/doc-indexer';
import { queryDocuments, queryDownloads, queryDocumentsByMime, queryImages, queryVideos, getMediaInfo } from 'media-store';
import { scanFile } from '@/modules/share-module';
import { getStorageVolumes } from '@/modules/storage-stats';
import * as Haptics from 'expo-haptics';
import { createPdfFromImages, addPdfProgressListener, extractPdfPages, mergePdfs } from '@/modules/pdf-creator';
import { extractTextFromImage, extractVideoFrames, labelImage } from '@/modules/scan-module';
import { MediaSlideshowView } from 'media-slideshow';
import { MediaViewerView } from 'media-viewer';
import { MediaPlayerView } from 'media-player';
import * as ScreenOrientation from 'expo-screen-orientation';

type Category = 'images' | 'videos' | 'documents' | 'downloads';

interface FileItem {
  name: string;
  uri: string;
  size?: number;
  date?: number;
}

const CATEGORY_CONFIG: Record<Category, { title: string; icon: string; color: string }> = {
  images: { title: 'Images', icon: 'image-outline', color: '#185FA5' },
  videos: { title: 'Videos', icon: 'videocam-outline', color: '#993C1D' },
  documents: { title: 'Documents', icon: 'document-outline', color: '#534AB7' },
  downloads: { title: 'Downloads', icon: 'download-outline', color: '#3B6D11' },
};

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

const TAB_MIMES: Record<string, string[]> = {
  'PDF': ['application/pdf'],
  'Word': ['application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain', 'application/rtf', 'application/vnd.oasis.opendocument.text'],
  'Excel': ['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv', 'application/vnd.oasis.opendocument.spreadsheet'],
  'Other': ['application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/vnd.oasis.opendocument.presentation'],
  'APK': ['application/vnd.android.package-archive'],
  'Docs': ['application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'text/plain', 'text/csv'],
};

export default function CategoryScreen() {
  const { colors } = useTheme();
  const { moveToTrash } = useTrash();
  const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = useWindowDimensions();
  const { category } = useLocalSearchParams<{ category: Category }>();
  const [items, setItems] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('All');
  const [visibleCount, setVisibleCount] = useState(100);
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
  const suppressWatcherRef = useRef(false);
  const [deleting, setDeleting] = useState(false);
  const [deletingCount, setDeletingCount] = useState(0);
  const [showRename, setShowRename] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [pickerMode, setPickerMode] = useState<'copy' | 'move'>('copy');
  const [pickerPath, setPickerPath] = useState('file:///storage/emulated/0/');
  const [pickerItems, setPickerItems] = useState<{ name: string; uri: string; isDirectory: boolean }[]>([]);
  const [pickerFiles, setPickerFiles] = useState<{ name: string; uri: string; isDirectory: boolean }[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const pendingItem = useRef<FileItem | null>(null);
  const pendingMultiItems = useRef<FileItem[]>([]);
  const dupeAction = useRef<'skip' | 'replace'>('skip');
  const router = useRouter();
  const config = CATEGORY_CONFIG[category ?? 'images'];
  const { addToVault } = useVault();
  const { isPro } = usePro();
  type SortKey = 'name_asc' | 'name_desc' | 'size_desc' | 'size_asc' | 'date_desc' | 'date_asc';
  const [sortKey, setSortKey] = useState<SortKey>('name_asc');
  const [showSortSheet, setShowSortSheet] = useState(false);
  const [gridView, setGridView] = useState(true);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedUris, setSelectedUris] = useState<Set<string>>(new Set());
  const [selectedItemsMap, setSelectedItemsMap] = useState<Map<string, FileItem>>(new Map());
  const [sharing, setSharing] = useState(false);
  const [vaulting, setVaulting] = useState(false);
  const isMediaCategory = category === 'images' || category === 'videos';
  const [openingUri, setOpeningUri] = useState<string | null>(null);
  const [movingUri, setMovingUri] = useState<string | null>(null);
  const [pasting, setPasting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [copyProgress, setCopyProgress] = useState<number | null>(null);
  const [multiPasting, setMultiPasting] = useState(false);
  const [multiPasteMode, setMultiPasteMode] = useState<'copy' | 'move'>('copy');
  const [multiPasteProgress, setMultiPasteProgress] = useState<{ current: number; total: number; name: string } | null>(null);
  const [qrModalVisible, setQrModalVisible] = useState(false);
  const [qrUrl, setQrUrl] = useState('');
  const ROOT_PATH = 'file:///storage/emulated/0/';
  const [volumes, setVolumes] = useState<{ name: string; path: string; type: string }[]>([]);
  const [showMoreSheet, setShowMoreSheet] = useState(false);
  const [creatingPdf, setCreatingPdf] = useState(false);
  const [pdfProgress, setPdfProgress] = useState<{ current: number; total: number } | null>(null);
  const [extractingPdf, setExtractingPdf] = useState(false);
  const [mergingPdf, setMergingPdf] = useState(false);
  const [extractingText, setExtractingText] = useState(false);
  const [extractedText, setExtractedText] = useState<string | null>(null);
  const [videoSummaryVisible, setVideoSummaryVisible] = useState(false);
  const [videoFrames, setVideoFrames] = useState<{ path: string; timestampMs: number }[]>([]);
  const [videoLabels, setVideoLabels] = useState<string[]>([]);
  const [loadingVideoSummary, setLoadingVideoSummary] = useState(false);
  const [slideshowVisible, setSlideshowVisible] = useState(false);
  const [slideshowItems, setSlideshowItems] = useState<{ name: string; uri: string }[]>([]);
  const [ssPos, setSsPos] = useState(0);
  const [ssShuffle, setSsShuffle] = useState(true);
  const [ssOrder, setSsOrder] = useState<number[]>([]);
  const [ssPlaying, setSsPlaying] = useState(true);
  const [ssSpeed, setSsSpeed] = useState(4000);
  const [ssControlsVisible, setSsControlsVisible] = useState(false);
  const [ssIsFav, setSsIsFav] = useState(false);
  const ssTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  const [playerUri, setPlayerUri] = useState<string | null>(null);
  const [playerPaused, setPlayerPaused] = useState(false);
  const [playerControlsVisible, setPlayerControlsVisible] = useState(false);
  const [playerSpeed, setPlayerSpeed] = useState(1.0);
  const [playerDuration, setPlayerDuration] = useState<number>(0);

  const SS_SPEEDS = [2000, 4000, 7000, 10000];
  const SS_SPEED_LABELS: Record<number, string> = { 2000: '2s', 4000: '4s', 7000: '7s', 10000: '10s' };

  function ssShuffledIndices(n: number): number[] {
    const arr = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  const ssCurrent = slideshowItems.length > 0 ? slideshowItems[ssOrder[ssPos]] : null;

  const ssAdvance = useCallback(() => {
    setSsPos(prev => {
      const next = prev + 1;
      if (next >= ssOrder.length) {
        if (ssShuffle) setSsOrder(ssShuffledIndices(slideshowItems.length));
        return 0;
      }
      return next;
    });
  }, [ssOrder.length, ssShuffle, slideshowItems.length]);

  useEffect(() => {
    if (!slideshowVisible || slideshowItems.length === 0) return;
    setSsOrder(ssShuffle ? ssShuffledIndices(slideshowItems.length) : Array.from({ length: slideshowItems.length }, (_, i) => i));
    setSsPos(0);
  }, [ssShuffle, slideshowItems.length, slideshowVisible]);

  useEffect(() => {
    if (ssTimer.current) clearTimeout(ssTimer.current);
    if (slideshowVisible && ssPlaying && !ssControlsVisible && slideshowItems.length > 1) {
      ssTimer.current = setTimeout(ssAdvance, ssSpeed);
    }
    return () => { if (ssTimer.current) clearTimeout(ssTimer.current); };
  }, [slideshowVisible, ssPlaying, ssControlsVisible, ssPos, ssSpeed, ssAdvance, slideshowItems.length]);

  useEffect(() => {
    if (ssCurrent) isFavourite(ssCurrent.uri).then(setSsIsFav);
  }, [ssCurrent?.uri]);

  useEffect(() => {
    if (playerUri !== null) {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT);
      return () => { ScreenOrientation.unlockAsync(); setPlayerControlsVisible(false); setPlayerSpeed(1.0); };
    }
  }, [playerUri]);
  

function openSlideshow() {
  const seen = new Set<string>();
  const deduped = filteredItems.filter(it => {
    if (seen.has(it.name)) return false;
    seen.add(it.name);
    return true;
  }).map(i => ({ name: i.name, uri: i.uri }));
  setSlideshowItems(deduped);
  setSsPos(0);
  setSsShuffle(true);
  setSsPlaying(true);
  setSsSpeed(4000);
  setSsControlsVisible(false);
  setSlideshowVisible(true);
}

async function handleSsInfo() {
  if (!ssCurrent) return;
  const loc = decodeURIComponent(ssCurrent.uri.replace('file:///storage/emulated/0/', '/').split('/').slice(0, -1).join('/')) || '/';
  const lines: string[] = [`Location: ${loc}`];
  try {
    const info = await getMediaInfo(toPath(ssCurrent.uri));
    if (info.width && info.height) lines.push(`Resolution: ${info.width}×${info.height}`);
    if (info.size) lines.push(`Size: ${formatSize(info.size)}`);
  } catch {}
  Alert.alert(ssCurrent.name, lines.join('\n'));
}

  function toPath(uri: string): string {
    try { return decodeURIComponent(uri.replace('file://', '')); }
    catch { return uri.replace('file://', ''); }
  }

  function formatDuration(ms: number): string {
    const totalSecs = Math.floor(ms / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
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
          isDirectory: true,
        }))
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
    pendingMultiItems.current = [];
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
        await scanFile(dst).catch(() => {});
        setItems(prev => prev.filter(f => f.uri !== item.uri));
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
      await scanFile(toPath(newUri)).catch(() => {});
      try {
        const sourceFilename = decodeURIComponent(selectedItem.uri.split('/').pop() ?? '');
        const allAssets = await MediaLibrary.getAssetsAsync({ first: 5000, mediaType: ['photo', 'video', 'unknown'] });
        const ghost = allAssets.assets.find((a: any) => a.filename === sourceFilename && toPath(a.uri) === toPath(selectedItem.uri));
        if (ghost) await MediaLibrary.deleteAssetsAsync([ghost]);
      } catch {}
      setItems(prev => prev.map(f => f.uri === selectedItem.uri ? { ...f, name: renameValue.trim(), uri: newUri } : f));
      closeSheet();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert('Rename failed', 'Could not rename this file.');
    }
  }

  useEffect(() => {
    setSearchQuery('');
    loadCategory();
    const subscription = addMediaStoreChangeListener(() => {
      if (suppressWatcherRef.current) return;
      loadCategory();
    });
    return () => subscription.remove();
  }, [category]);

  useEffect(() => {
    getStorageVolumes().then(setVolumes);
  }, []);

  async function openSheet(item: FileItem) {
    setSelectedItem(item);
    setFileSize(null);
    setIsFav(await isFavourite(item.uri));
    setShowRename(false);
    setRenameValue('');
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
    Alert.alert('Move to Trash', `"${selectedItem.name}" will be moved to Trash and deleted after 30 days.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Move to Trash', style: 'destructive', onPress: async () => {
        closeSheet();
        const ok = await moveToTrash(selectedItem.uri, selectedItem.name);
        if (ok) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          await removeFavourite(selectedItem.uri);
          DocIndexer.removeFromIndex(selectedItem.uri);
          setItems(prev => prev.filter(f => f.uri !== selectedItem.uri));
        } else {
          Alert.alert('Error', 'Could not move file to Trash.');
        }
      }},
    ]);
  }

  function handleMultiCopy() {
    pendingMultiItems.current = Array.from(selectedItemsMap.values());
    setMultiPasteMode('copy');
    setPickerPath(ROOT_PATH);
    loadPickerDir(ROOT_PATH);
    setShowPicker(true);
  }

  function handleMultiMove() {
    pendingMultiItems.current = Array.from(selectedItemsMap.values());
    setMultiPasteMode('move');
    setPickerPath(ROOT_PATH);
    loadPickerDir(ROOT_PATH);
    setShowPicker(true);
  }

  async function handleMultiPaste() {
    const files = pendingMultiItems.current;
    if (!files.length) return;
    setShowPicker(false);

    const destDir = pickerPath.endsWith('/') ? pickerPath : pickerPath + '/';

    // Check all duplicates upfront
    const duplicates: string[] = [];
    for (const file of files) {
      const dst = toPath(destDir + file.name);
      if (await RNFS.exists(dst)) duplicates.push(file.name);
    }

    // If duplicates exist, ask once before starting
    if (duplicates.length > 0) {
      const dupeList = duplicates.slice(0, 3).join(', ') +
        (duplicates.length > 3 ? ` and ${duplicates.length - 3} more` : '');
      const action = await new Promise<'skip' | 'replace' | 'cancel'>((resolve) => {
        Alert.alert(
          duplicates.length === 1 ? 'File already exists' : 'Files already exist',
          `${dupeList} already ${duplicates.length === 1 ? 'exists' : 'exist'} in this folder.`,
          [
            { text: 'Skip existing', onPress: () => resolve('skip') },
            { text: 'Replace', style: 'destructive', onPress: () => resolve('replace') },
            { text: 'Cancel', style: 'cancel', onPress: () => resolve('cancel') },
          ]
        );
      });
      if (action === 'cancel') return;
      dupeAction.current = action;
    } else {
      dupeAction.current = 'skip';
    }

    const actualTotal = dupeAction.current === 'skip'
      ? files.length - duplicates.length
      : files.length;

    if (actualTotal === 0) {
      Alert.alert('Nothing to do', 'All selected files already exist at the destination and were skipped.');
      return;
    }

    setMultiPasting(true);
    let copiedCount = 0;
    const sub = addCopyProgressListener(() => {});
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const dst = toPath(destDir + file.name);
        const src = toPath(file.uri);
        setMultiPasteProgress({ current: copiedCount + 1, total: actualTotal, name: file.name });

        const exists = await RNFS.exists(dst);
        if (exists && dupeAction.current === 'skip') continue;

        if (multiPasteMode === 'copy') {
          await copyFileStream(file.uri, dst);
          await scanFile(dst).catch(() => {});
        } else {
          await moveFileStream(src, dst);
          await scanFile(dst).catch(() => {});
        }
        copiedCount++;
      }

      if (multiPasteMode === 'move') {
        setItems(prev => prev.filter(f => !files.some(mf => mf.uri === f.uri)));
      }
      setSelectMode(false);
      setSelectedUris(new Set());
      setSelectedItemsMap(new Map());
      Alert.alert(
        'Success',
        `${copiedCount} file${copiedCount !== 1 ? 's' : ''} ${multiPasteMode === 'copy' ? 'copied' : 'moved'} successfully.`
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert('Error', `Could not ${multiPasteMode} files.`);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      sub.remove();
      setMultiPasting(false);
      setMultiPasteProgress(null);
      pendingMultiItems.current = [];
    }
  }

  async function handleCreatePdf() {
    const files = Array.from(selectedItemsMap.values());
    const imagePaths = files.map(f => toPath(f.uri));
    const timestamp = Date.now();
    const outputPath = `/storage/emulated/0/Documents/Scans/AskFiles_${timestamp}.pdf`;
    setCreatingPdf(true);
    setPdfProgress({ current: 0, total: files.length });
    const sub = addPdfProgressListener((event) => {
      setPdfProgress({ current: event.current, total: event.total });
    });
    try {
      await createPdfFromImages(imagePaths, outputPath);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('PDF Created', `${files.length} image${files.length !== 1 ? 's' : ''} saved to Documents/Scans`);
      setSelectMode(false);
      setSelectedUris(new Set());
      setSelectedItemsMap(new Map());
    } catch (e) {
      Alert.alert('Error', 'Could not create PDF.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      sub.remove();
      setCreatingPdf(false);
      setPdfProgress(null);
    }
  }

  async function handleExtractPdf() {
    if (!selectedItem) return;
    const fileName = selectedItem.name.replace(/\.pdf$/i, '');
    const outputDir = `/storage/emulated/0/Documents/Scans/${fileName}_pages`;
    closeSheet();
    setExtractingPdf(true);
    setPdfProgress({ current: 0, total: 0 });
    const sub = addPdfProgressListener((event) => {
      setPdfProgress({ current: event.current, total: event.total });
    });
    try {
      const paths = await extractPdfPages(toPath(selectedItem.uri), outputDir);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Extracted', `${paths.length} page${paths.length !== 1 ? 's' : ''} saved to Documents/Scans/${fileName}_pages`);
    } catch (e) {
      Alert.alert('Error', 'Could not extract PDF pages.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      sub.remove();
      setExtractingPdf(false);
      setPdfProgress(null);
    }
  }

  async function handleMergePdfs() {
    const files = Array.from(selectedItemsMap.values());
    const pdfs = files.filter(f => f.name.toLowerCase().endsWith('.pdf'));
    const nonPdfs = files.filter(f => !f.name.toLowerCase().endsWith('.pdf'));
  
    if (pdfs.length < 2) {
      Alert.alert('Not enough PDFs', 'Select at least 2 PDF files to merge.');
      return;
    }
  
    const proceed = async () => {
      setShowMoreSheet(false);
      const timestamp = Date.now();
      const outputPath = `/storage/emulated/0/Documents/Scans/AskFiles_merged_${timestamp}.pdf`;
      setMergingPdf(true);
      setPdfProgress({ current: 0, total: pdfs.length });
      const sub = addPdfProgressListener((event) => {
        setPdfProgress({ current: event.current, total: event.total });
      });
      try {
        await mergePdfs(pdfs.map(f => toPath(f.uri)), outputPath);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('Merged', `${pdfs.length} PDFs merged successfully. Saved to Documents/Scans.`);
        setSelectMode(false);
        setSelectedUris(new Set());
        setSelectedItemsMap(new Map());
      } catch (e) {
        Alert.alert('Error', 'Could not merge PDFs.');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } finally {
        sub.remove();
        setMergingPdf(false);
        setPdfProgress(null);
      }
    };
  
    if (nonPdfs.length > 0) {
      Alert.alert(
        'Mixed selection',
        `Only PDF files will be merged. ${pdfs.length} PDF${pdfs.length !== 1 ? 's' : ''} selected, ${nonPdfs.length} file${nonPdfs.length !== 1 ? 's' : ''} will be skipped. Continue?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Merge PDFs', onPress: proceed },
        ]
      );
    } else {
      proceed();
    }
  }

  async function loadCategory() {
    setLoading(true);
    try {
      if (category === 'images' || category === 'videos') {
        const assets = category === 'images' ? await queryImages() : await queryVideos();
        setItems(assets.map(a => ({ name: a.name, uri: a.uri, date: a.date, size: a.size })));
      } else if (category === 'downloads') {
        const dlItems = await queryDownloads();
        setItems(dlItems);
      } else if (category === 'documents') {
        const docItems = await queryDocuments();
        setItems(docItems);
      }
    } catch (e) {
    } finally {
      setLoading(false);
    }
  }

  async function openItem(item: FileItem) {
    await addRecent({ name: item.name, uri: item.uri, openedAt: Date.now() });
    if (isImageFile(item.name)) {
      setViewerUri(item.uri);
      return;
    }
    if (isVideoFile(item.name)) {
      setPlayerPaused(false);
      setPlayerUri(item.uri);
      return;
    }
    setOpeningUri(item.uri);
    const mime = getMimeType(item.name);
    try {
      const filePath = toPath(item.uri);
      await openFile(filePath, mime);
    } catch (e) {
      // Fallback: original cache copy path for files not indexed by MediaStore
      try {
        const cachePath = `${RNFS.CachesDirectoryPath}/${item.name}`;
        const srcPath = toPath(item.uri);
        await RNFS.copyFile(srcPath, cachePath);
        const contentUri = await FileSystemLegacy.getContentUriAsync('file://' + cachePath);
        await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
          data: contentUri,
          flags: 1,
          type: mime,
        });
      } catch {}
    } finally {
      setOpeningUri(null);
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
          closeSheet();
          setMovingUri(uri);
          const ok = await addToVault(uri, name);
          setMovingUri(null);
          if (ok) { 
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setItems(prev => prev.filter(f => f.uri !== uri)); 
            DocIndexer.removeFromIndex(uri); 
          }
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
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      Alert.alert('Added to Favourites', `"${selectedItem.name}" added.`);
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

  async function handleExtractText() {
    if (!selectedItem) return;
    closeSheet();
    setExtractingText(true);
    try {
      const text = await extractTextFromImage(toPath(selectedItem.uri));
      setExtractedText(text.trim() || '');
    } catch {
      Alert.alert('Error', 'Could not extract text from this image.');
    } finally {
      setExtractingText(false);
    }
  }

  async function handlePrint() {
    if (!selectedItem) return;
    const item = selectedItem;
    closeSheet();
    try {
      const filePath = toPath(item.uri);
      const ext = item.name.split('.').pop()?.toLowerCase() ?? '';
      if (ext === 'pdf') {
        await printPdf(filePath);
      } else {
        await printImage(filePath);
      }
    } catch {
      Alert.alert('Print failed', 'Could not print this file. Make sure a printer is set up on your device.');
    }
  }

  async function handleVideoSummary() {
    if (!selectedItem) return;
    closeSheet();
    setLoadingVideoSummary(true);
    setVideoSummaryVisible(true);
    try {
      const frames = await extractVideoFrames(toPath(selectedItem.uri), 4);
      setVideoFrames(frames);
      const allLabels: string[] = [];
      for (const frame of frames) {
        const labels = await labelImage(frame.path);
        labels.forEach(l => { if (!allLabels.includes(l)) allLabels.push(l); });
      }
      setVideoLabels(allLabels.slice(0, 8));
    } catch {
      Alert.alert('Error', 'Could not generate video summary.');
      setVideoSummaryVisible(false);
    } finally {
      setLoadingVideoSummary(false);
    }
  }

  async function handleMultiShare() {
    if (sharingRef.current) return;
    sharingRef.current = true;
    setSharing(true);
    const files = Array.from(selectedItemsMap.values());
    try {
      const paths: string[] = [];
      for (const file of files) {
        paths.push(toPath(file.uri));
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
        setVaulting(true);
        for (const file of files) { await addToVault(file.uri, file.name); }
        setItems(prev => prev.filter(f => !selectedUris.has(f.uri)));
        files.forEach(f => DocIndexer.removeFromIndex(f.uri));
        setVaulting(false);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setSelectMode(false); setSelectedUris(new Set()); setSelectedItemsMap(new Map());
      }},
    ]);
  }
  
  async function handleMultiDelete() {
    const files = Array.from(selectedItemsMap.values());
    Alert.alert('Move to Trash', `Move ${files.length} file${files.length !== 1 ? 's' : ''} to Trash? They will be deleted after 30 days.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Move to Trash', style: 'destructive', onPress: async () => {
        suppressWatcherRef.current = true;
        setDeleting(true);
        setDeletingCount(files.length);
        try {
          for (const file of files) {
            await moveToTrash(file.uri, file.name, false);
            removeFavourite(file.uri);
            DocIndexer.removeFromIndex(file.uri);
          }
          setItems(prev => prev.filter(f => !selectedUris.has(f.uri)));
          setSelectMode(false);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setSelectedUris(new Set()); setSelectedItemsMap(new Map());
        } finally {
          setDeleting(false);
          setDeletingCount(0);
          suppressWatcherRef.current = false;
        }
      }},
    ]);
  }
  
  async function handleMultiInfo() {
    const files = Array.from(selectedItemsMap.values());
    let totalSize = 0;
    for (const file of files) {
      if (file.size && file.size > 0) {
        totalSize += file.size;
      } else {
        try {
          const f = new FileSystem.File(file.uri);
          totalSize += f.size ?? 0;
        } catch {}
      }
    }
    Alert.alert(`${files.length} file${files.length !== 1 ? 's' : ''} selected`, `Total size: ${formatSize(totalSize)}`);
  }

  const tabs = category === 'documents' ? DOC_TABS : category === 'downloads' ? DL_TABS : null;

  const filteredItems = useMemo(() => {
    let result = (tabs && activeTab !== 'All')
      ? items.filter(item => {
          const tab = category === 'documents' ? getDocTab(item.name) : getDlTab(item.name);
          return tab === activeTab;
        })
      : items;
      result = result.slice().sort((a, b) => {
        switch (sortKey) {
          case 'name_asc': return a.name.localeCompare(b.name);
          case 'name_desc': return b.name.localeCompare(a.name);
          case 'size_desc': return (b.size ?? 0) - (a.size ?? 0);
          case 'size_asc': return (a.size ?? 0) - (b.size ?? 0);
          case 'date_desc': return (b.date ?? 0) - (a.date ?? 0);
          case 'date_asc': return (a.date ?? 0) - (b.date ?? 0);
          default: return a.name.localeCompare(b.name);
        }
      });
    if (searchQuery.trim()) {
      result = result.filter(item => item.name.toLowerCase().includes(searchQuery.toLowerCase()));
    }
    return result;
  }, [items, activeTab, sortKey, searchQuery, category]);

  const gridUris = useMemo(() => filteredItems.map(i => i.uri), [filteredItems]);

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.background }]}>
        {selectMode ? (
          <>
            <TouchableOpacity onPress={() => { setSelectMode(false); setSelectedUris(new Set()); setSelectedItemsMap(new Map()); }} style={styles.backBtn}>
              <Ionicons name="close" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={[styles.title, { color: colors.textPrimary }]}>{selectedUris.size} selected</Text>
            <TouchableOpacity
              onPress={() => {
                const allFiles = filteredItems;
                const newSet = new Set(allFiles.map(f => f.uri));
                const newMap = new Map(allFiles.map(f => [f.uri, f]));
                setSelectedUris(newSet);
                setSelectedItemsMap(newMap);
              }}
              style={{ width: 40, height: 40, justifyContent: 'center', alignItems: 'center' }}
            >
              <Text style={{ fontSize: 12, color: colors.blue, fontWeight: '500' }}>All</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={[styles.title, { color: colors.textPrimary }]}>{config.title}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            {category === 'images' && (
                <TouchableOpacity
                  onPress={() => {
                    if (filteredItems.length === 0) return;
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    openSlideshow();
                  }}
                  style={{ width: 40, height: 40, justifyContent: 'center', alignItems: 'center' }}
                >
                  <Ionicons name="shuffle" size={22} color={colors.textSecondary} />
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setSelectMode(true); setSelectedUris(new Set()); setSelectedItemsMap(new Map()); }} style={{ width: 40, height: 40, justifyContent: 'center', alignItems: 'center' }}>
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
              onPress={async () => {
                setActiveTab(tab);
                setVisibleCount(100);
                setLoading(true); 
                if (tab === 'All') {
                  const all = category === 'documents' ? await queryDocuments() : await queryDownloads();
                  setItems(all);
                } else {
                  const mimes = TAB_MIMES[tab] ?? [];
                  if (mimes.length > 0) {
                    if (category === 'downloads') {
                      const all = await queryDownloads();
                      const filtered = all.filter(item => {
                        const tab2 = getDlTab(item.name);
                        return tab2 === tab;
                      });
                      setItems(filtered);
                    } else {
                      const result = await queryDocumentsByMime(mimes);
                      setItems(result);
                    }
                  }
                }
                setLoading(false);
              }}
            >
              <Text style={[styles.tabText, { color: colors.textSecondary }, activeTab === tab && { color: colors.background }]}>{tab}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
        <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 }}>
            <Ionicons name="search-outline" size={15} color={colors.textMuted} style={{ marginRight: 8 }} />
            <TextInput
              style={{ flex: 1, fontSize: 14, color: colors.textPrimary, padding: 0 }}
              placeholder={`Search ${config.title.toLowerCase()}...`}
              placeholderTextColor={colors.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              returnKeyType="search"
              clearButtonMode="while-editing"
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>
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
      {multiPasting && multiPasteProgress && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: colors.surface }}>
          <ActivityIndicator size="small" color={colors.blue} />
          <Text style={{ fontSize: 13, color: colors.textSecondary }}>
            {multiPasteMode === 'copy' ? 'Copying' : 'Moving'} {multiPasteProgress.current} of {multiPasteProgress.total}: {multiPasteProgress.name}
          </Text>
        </View>
      )}
      {creatingPdf && pdfProgress && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: colors.surface }}>
          <ActivityIndicator size="small" color={colors.blue} />
          <Text style={{ fontSize: 13, color: colors.textSecondary }}>
            Creating PDF... {pdfProgress.current} of {pdfProgress.total}
          </Text>
        </View>
      )}
      {extractingPdf && pdfProgress && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: colors.surface }}>
          <ActivityIndicator size="small" color={colors.blue} />
          <Text style={{ fontSize: 13, color: colors.textSecondary }}>
            Extracting page {pdfProgress.current} of {pdfProgress.total}...
          </Text>
        </View>
      )}
      {mergingPdf && pdfProgress && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: colors.surface }}>
          <ActivityIndicator size="small" color={colors.blue} />
          <Text style={{ fontSize: 13, color: colors.textSecondary }}>
            Merging PDF {pdfProgress.current} of {pdfProgress.total}...
          </Text>
        </View>
      )}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={config.color} />
          <Text style={[styles.empty, { color: colors.textMuted, marginTop: 8 }]}>Loading...</Text>
        </View>
      ) : filteredItems.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name={config.icon as any} size={40} color={colors.textDisabled} />
          <Text style={[styles.empty, { color: colors.textMuted }]}>No {activeTab === 'All' ? config.title.toLowerCase() : activeTab + ' files'} found</Text>
        </View>
      ) : (isMediaCategory && gridView) ? (
        <>
          <Text style={[styles.count, { color: colors.textMuted, paddingHorizontal: 16, paddingTop: 8 }]}>
            {filteredItems.length} {activeTab === 'All' ? config.title.toLowerCase() : activeTab.toLowerCase() + ' files'}
          </Text>
          <MediaGridView
            selectedUris={Array.from(selectedUris)}
            style={{ flex: 1 }}
            key={`grid-${sortKey}-${searchQuery}-${selectMode}`}
            uris={gridUris}
            selectMode={selectMode}
            category={category ?? 'images'}
            openingUri={openingUri ?? ''}
            onItemPress={(e) => {
              const { uri } = e.nativeEvent;
              const item = filteredItems.find(i => i.uri === uri);
              if (!item || selectMode) return;
              openItem(item);
            }}
            onItemLongPress={(e) => {
              const { uri } = e.nativeEvent;
              const item = filteredItems.find(i => i.uri === uri);
              if (!item || selectMode) return;
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              openSheet(item);
            }}
            onSelectionChange={(e) => {
              const uris: string[] = e.nativeEvent.selectedUris;
              const newSet = new Set(uris);
              setSelectedUris(newSet);
              setSelectedItemsMap(() => {
                const newMap = new Map<string, FileItem>();
                uris.forEach(uri => {
                  const item = filteredItems.find(i => i.uri === uri);
                  if (item) newMap.set(uri, item);
                });
                return newMap;
              });
            }}
          />
        </>
      ) : (
        <FlatList
          data={filteredItems.slice(0, visibleCount)}
          keyExtractor={item => item.uri}
          key="list"
          numColumns={1}
          onEndReached={() => setVisibleCount(prev => prev + 100)}
          onEndReachedThreshold={0.3}
          renderItem={({ item }) => {
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
                    onLongPress={() => { if (!selectMode) { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); openSheet(item); }}}
                    activeOpacity={0.7}
                  >
                    {selectMode && (
                      <View style={{ marginRight: 12 }}>
                        <Ionicons name={isSelected ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={isSelected ? colors.blue : colors.textMuted} />
                      </View>
                    )}
                    <View style={[styles.icon, { backgroundColor: getFileColor(item.name) + '22', overflow: 'hidden' }]}>
                      {isImg ? (
                        <Image source={{ uri: item.uri }} style={styles.thumb} resizeMode="cover" />
                      ) : isVideoFile(item.name) ? (
                        <VideoThumb uri={item.uri} style={styles.thumb} />
                      ) : (
                        <Ionicons name={getFileIcon(item.name) as any} size={20} color={getFileColor(item.name)} />
                      )}
                    </View>
                    <View style={styles.info}>
                      <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>{item.name}</Text>
                      <Text style={[styles.meta, { color: colors.textMuted }]}>
                        {item.size ? formatSize(item.size) : ''}
                        {item.size && item.date ? ' · ' : ''}
                        {item.date ? formatDate(item.date) : ''}
                      </Text>
                    </View>
                    {!selectMode && (
                      movingUri === item.uri
                        ? <ActivityIndicator size="small" color={colors.blue} />
                        : openingUri === item.uri
                        ? <ActivityIndicator size="small" color={config.color} />
                        : <TouchableOpacity onPress={() => openSheet(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <Ionicons name="chevron-forward" size={16} color={colors.textDisabled} />
                          </TouchableOpacity>
                    )}
                  </TouchableOpacity>
                );
              }
          }
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <Text style={[styles.count, { color: colors.textMuted }]}>{filteredItems.length} {activeTab === 'All' ? config.title.toLowerCase() : activeTab.toLowerCase() + ' files'}</Text>
          }
        />
      )}
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
            {SCREEN_WIDTH > SCREEN_HEIGHT && (
              <TouchableOpacity onPress={closeSheet} style={{ alignSelf: 'flex-end', padding: 4 }}>
                <Ionicons name="close" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            )}
            <ScrollView showsVerticalScrollIndicator={true} contentContainerStyle={{ paddingBottom: 8 }} keyboardShouldPersistTaps="handled">
            <Pressable>
              {SCREEN_WIDTH <= SCREEN_HEIGHT && (
                <View style={[styles.sheetHandle, { backgroundColor: colors.textDisabled }]} />
              )}
              <View style={styles.sheetHeader}>
              <View style={[styles.sheetIcon, { backgroundColor: getFileColor(selectedItem?.name ?? '') + '22', overflow: 'hidden' }]}>
                {isImageFile(selectedItem?.name ?? '') ? (
                  <Image source={{ uri: selectedItem?.uri }} style={styles.sheetThumb} resizeMode="cover" />
                ) : isVideoFile(selectedItem?.name ?? '') ? (
                  <VideoThumb uri={selectedItem?.uri ?? ''} style={styles.sheetThumb} />
                ) : (
                  <Ionicons name={getFileIcon(selectedItem?.name ?? '') as any} size={22} color={getFileColor(selectedItem?.name ?? '')} />
                )}
              </View>
                <View style={styles.sheetInfo}>
                  <Text style={[styles.sheetName, { color: colors.textPrimary }]} numberOfLines={2}>{selectedItem?.name}</Text>
                  {fileSize && <Text style={[styles.sheetMeta, { color: colors.textMuted }]}>{fileSize}</Text>}
                </View>
              </View>
              {!isMediaCategory && selectedItem?.name.toLowerCase().endsWith('.pdf') && (
                <TouchableOpacity style={styles.sheetAction} onPress={handleExtractPdf}>
                  <Ionicons name="document-outline" size={20} color={colors.green} />
                  <Text style={[styles.sheetActionText, { color: colors.green }]}>Extract pages as images</Text>
                </TouchableOpacity>
              )}
              <View style={[styles.sheetDivider, { backgroundColor: colors.border }]} />
              {isVideoFile(selectedItem?.name ?? '') && (
                <TouchableOpacity style={styles.sheetAction} onPress={handleVideoSummary}>
                  <Ionicons name="film-outline" size={20} color={colors.textPrimary} />
                  <Text style={[styles.sheetActionText, { color: colors.textPrimary }]}>Video Summary</Text>
                </TouchableOpacity>
              )}
              {isImageFile(selectedItem?.name ?? '') && (
                <TouchableOpacity style={styles.sheetAction} onPress={handleExtractText}>
                  <Ionicons name="text-outline" size={20} color={colors.textPrimary} />
                  <Text style={[styles.sheetActionText, { color: colors.textPrimary }]}>Extract Text</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.sheetAction} onPress={handleShare}>
                <Ionicons name="share-outline" size={20} color={colors.textPrimary} />
                <Text style={[styles.sheetActionText, { color: colors.textPrimary }]}>Share</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.sheetAction} onPress={handleShareViaQr}>
                <Ionicons name="qr-code-outline" size={20} color={colors.textPrimary} />
                <Text style={[styles.sheetActionText, { color: colors.textPrimary }]}>Share via QR</Text>
              </TouchableOpacity>
              {(isImageFile(selectedItem?.name ?? '') || selectedItem?.name.toLowerCase().endsWith('.pdf')) && (
                <TouchableOpacity style={styles.sheetAction} onPress={handlePrint}>
                  <Ionicons name="print-outline" size={20} color={colors.textPrimary} />
                  <Text style={[styles.sheetActionText, { color: colors.textPrimary }]}>Print</Text>
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
                closeSheet();
                const locationRaw = selectedItem?.uri.replace('file:///storage/emulated/0/', '').split('/').slice(0, -1).join('/') || 'Storage';
                const location = (() => { try { return decodeURIComponent(locationRaw); } catch { return locationRaw; } })();
                const lines: string[] = [];
                if (fileSize) lines.push(`Size: ${fileSize}`);
                lines.push(`Type: ${selectedItem?.name.split('.').pop()?.toUpperCase()} file`);
                lines.push(`Location: /${location}`);
                if (isMediaCategory && selectedItem) {
                  try {
                    const info = await getMediaInfo(toPath(selectedItem.uri));
                    if (info.width && info.height) lines.push(`Resolution: ${info.width}×${info.height}`);
                    if (info.duration) lines.push(`Duration: ${info.duration}`);
                  } catch {}
                }
                Alert.alert(selectedItem?.name ?? '', lines.join('\n'));
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
          <View style={[styles.header, { backgroundColor: colors.background }]}>
            <TouchableOpacity
              onPress={() => {
                if (pickerPath === ROOT_PATH || volumes.some(v => pickerPath === `file://${v.path}/`)) { setShowPicker(false); }
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
              {pendingMultiItems.current.length > 0
                ? (multiPasteMode === 'copy' ? 'Copy to...' : 'Move to...')
                : (pickerMode === 'copy' ? 'Copy to...' : 'Move to...')}
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
                <TouchableOpacity key={vol.path} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: pickerPath.includes(vol.path) ? colors.blue : colors.surface }} onPress={() => {
                  const newPath = `file://${vol.path}/`;
                  setPickerPath(newPath);
                  loadPickerDir(newPath);
                }}>
                  <Ionicons name={vol.type === 'sdcard' ? 'card-outline' : 'phone-portrait-outline'} size={14} color={pickerPath.includes(vol.path) ? '#fff' : colors.textSecondary} />
                  <Text style={{ fontSize: 12, fontWeight: '500', color: pickerPath.includes(vol.path) ? '#fff' : colors.textSecondary }}>{vol.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {pickerLoading ? (
            <View style={styles.centered}><ActivityIndicator color={colors.blue} /></View>
          ) : pickerItems.length === 0 && pickerFiles.length === 0 ? (
            <View style={styles.centered}><Text style={[styles.empty, { color: colors.textMuted }]}>This folder is empty</Text></View>
          ) : (
            <FlatList
              data={[...pickerItems, ...pickerFiles]}
              keyExtractor={item => item.uri}
              contentContainerStyle={[styles.list, { paddingBottom: 100 }]}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.row, { borderBottomColor: colors.border }]}
                  onPress={() => { if (item.isDirectory) { setPickerPath(item.uri); loadPickerDir(item.uri); } }}
                  activeOpacity={item.isDirectory ? 0.6 : 1}
                >
                  <View style={[styles.icon, { backgroundColor: (item.isDirectory ? colors.yellow : getFileColor(item.name)) + '22' }]}>
                    {item.isDirectory ? (
                      <Ionicons name="folder" size={22} color={colors.yellow} />
                    ) : isImageFile(item.name) ? (
                      <Image source={{ uri: item.uri }} style={styles.thumb} resizeMode="cover" />
                    ) : isVideoFile(item.name) ? (
                      <VideoThumb uri={item.uri} style={styles.thumb} />
                    ) : (
                      <Ionicons name={getFileIcon(item.name) as any} size={20} color={getFileColor(item.name)} />
                    )}
                  </View>
                  <View style={styles.info}>
                    <Text style={[styles.name, { color: colors.textPrimary}]} numberOfLines={1}>{item.name}</Text>
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
            <TouchableOpacity style={styles.pickerPasteBtn} onPress={pendingMultiItems.current.length > 0 ? handleMultiPaste : handlePaste}>
              <Ionicons name="checkmark" size={18} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.pickerPasteText}>
                {pendingMultiItems.current.length > 0
                  ? (multiPasteMode === 'copy' ? 'Copy here' : 'Move here')
                  : (pickerMode === 'copy' ? 'Copy here' : 'Move here')}
              </Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      <Modal visible={showSortSheet} transparent animationType="fade" onRequestClose={() => setShowSortSheet(false)}>
      <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: SCREEN_WIDTH > SCREEN_HEIGHT ? 'center' : 'flex-end', alignItems: SCREEN_WIDTH > SCREEN_HEIGHT ? 'center' : 'stretch' }} activeOpacity={1} onPress={() => setShowSortSheet(false)}>
      <View style={{ backgroundColor: colors.card, borderRadius: SCREEN_WIDTH > SCREEN_HEIGHT ? 20 : 0, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, gap: 8, paddingBottom: insets.bottom + 24, width: SCREEN_WIDTH > SCREEN_HEIGHT ? '50%' : undefined, maxHeight: SCREEN_HEIGHT * 0.85 }}>
        {SCREEN_WIDTH > SCREEN_HEIGHT ? (
              <TouchableOpacity onPress={() => setShowSortSheet(false)} style={{ alignSelf: 'flex-end', padding: 4, marginBottom: 4 }}>
                <Ionicons name="close" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            ) : (
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.textDisabled, alignSelf: 'center', marginBottom: 16 }} />
            )}
            <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textMuted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Sort by</Text>
            <ScrollView showsVerticalScrollIndicator={false} style={{ flexGrow: 0 }}>
            {([
              { key: 'name_asc', label: 'Name A → Z' },
              { key: 'name_desc', label: 'Name Z → A' },
              { key: 'size_desc', label: 'Size (largest first)' },
              { key: 'size_asc', label: 'Size (smallest first)' },
              { key: 'date_desc', label: 'Date (newest first)' },
              { key: 'date_asc', label: 'Date (oldest first)' },
            ] as { key: SortKey; label: string }[]).map(({ key, label }) => (
              <TouchableOpacity
                key={key}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: colors.border }}
                onPress={() => { setSortKey(key); setShowSortSheet(false); }}
              >
                <Text style={{ fontSize: 15, color: sortKey === key ? colors.blue : colors.textPrimary, fontWeight: sortKey === key ? '600' : '400' }}>
                  {label}
                </Text>
                {sortKey === key && <Ionicons name="checkmark" size={18} color={colors.blue} />}
              </TouchableOpacity>
            ))}
            </ScrollView>
            <TouchableOpacity style={{ alignItems: 'center', paddingVertical: 14, backgroundColor: colors.surface, borderRadius: 10, marginTop: 4 }} onPress={() => setShowSortSheet(false)}>
              <Text style={{ fontSize: 14, fontWeight: '500', color: colors.textSecondary }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
      {deleting && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: colors.surface }}>
          <ActivityIndicator size="small" color={colors.deleteRed} />
          <Text style={{ fontSize: 13, color: colors.textSecondary }}>
            Moving {deletingCount} file{deletingCount !== 1 ? 's' : ''} to Trash...
          </Text>
        </View>
      )}
      {extractingText && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: colors.surface }}>
          <ActivityIndicator size="small" color={colors.blue} />
          <Text style={{ fontSize: 13, color: colors.textSecondary }}>Reading text...</Text>
        </View>
      )}
      {selectMode && selectedUris.size > 0 && (
        <>
          {sharing && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: colors.surface }}>
              <ActivityIndicator size="small" color={colors.blue} />
              <Text style={{ fontSize: 13, color: colors.textSecondary }}>Preparing files for sharing...</Text>
            </View>
          )}
        <View style={{ flexDirection: 'row', padding: 12, gap: 8, borderTopWidth: 0.5, borderTopColor: colors.border, backgroundColor: colors.background, paddingBottom: insets.bottom + 12 }}>
        <TouchableOpacity
          onPress={handleMultiCopy}
          disabled={sharing || vaulting || deleting || multiPasting}
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderRadius: 12, paddingVertical: 12 }}
        >
          <Ionicons name="copy-outline" size={20} color={colors.textPrimary} />
          <Text style={{ fontSize: 11, color: colors.textPrimary, marginTop: 2 }}>Copy</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleMultiMove}
          disabled={sharing || vaulting || deleting || multiPasting}
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderRadius: 12, paddingVertical: 12 }}
        >
          <Ionicons name="arrow-redo-outline" size={20} color={colors.textPrimary} />
          <Text style={{ fontSize: 11, color: colors.textPrimary, marginTop: 2 }}>Move</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleMultiShare}
          disabled={sharing || vaulting || deleting || multiPasting}
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: sharing ? colors.surface : colors.blue, borderRadius: 12, paddingVertical: 12 }}
        >
          <Ionicons name="share-outline" size={20} color={sharing ? colors.textMuted : '#fff'} />
          <Text style={{ fontSize: 11, color: sharing ? colors.textMuted : '#fff', marginTop: 2 }}>Share</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleMultiVault}
          disabled={sharing || vaulting || deleting || multiPasting}
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderRadius: 12, paddingVertical: 12 }}
        >
          <Ionicons name="shield-checkmark-outline" size={20} color={isPro ? colors.blue : colors.textMuted} />
          <Text style={{ fontSize: 11, color: isPro ? colors.blue : colors.textMuted, marginTop: 2 }}>Vault</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleMultiDelete}
          disabled={sharing || vaulting || deleting || multiPasting}
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderRadius: 12, paddingVertical: 12 }}
        >
          <Ionicons name="trash-outline" size={20} color={colors.deleteRed} />
          <Text style={{ fontSize: 11, color: colors.deleteRed, marginTop: 2 }}>Delete</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setShowMoreSheet(true)}
          disabled={sharing || vaulting || deleting || multiPasting}
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderRadius: 12, paddingVertical: 12 }}
        >
          <Ionicons name="ellipsis-horizontal" size={20} color={colors.textPrimary} />
          <Text style={{ fontSize: 11, color: colors.textPrimary, marginTop: 2 }}>More</Text>
        </TouchableOpacity>
          </View>
        </>
      )}
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
      <Modal visible={showMoreSheet} transparent animationType="none" onRequestClose={() => setShowMoreSheet(false)}>
        <Pressable style={styles.overlay} onPress={() => setShowMoreSheet(false)}>
          <Animated.View
            style={SCREEN_WIDTH > SCREEN_HEIGHT
              ? [styles.sheetLandscape, { backgroundColor: colors.card }]
              : [styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16, paddingLeft: insets.left + 16, paddingRight: insets.right + 16 }]
            }
          >
            {SCREEN_WIDTH > SCREEN_HEIGHT
              ? <TouchableOpacity onPress={() => setShowMoreSheet(false)} style={{ alignSelf: 'flex-end', padding: 4 }}>
                  <Ionicons name="close" size={20} color={colors.textMuted} />
                </TouchableOpacity>
              : <View style={[styles.sheetHandle, { backgroundColor: colors.textDisabled }]} />
            }
            <TouchableOpacity style={styles.sheetAction} onPress={() => { setShowMoreSheet(false); handleMultiInfo(); }}>
              <Ionicons name="information-circle-outline" size={20} color={colors.textPrimary} />
              <Text style={[styles.sheetActionText, { color: colors.textPrimary }]}>Info</Text>
            </TouchableOpacity>
            {category === 'images' && (
              <TouchableOpacity style={styles.sheetAction} onPress={() => { setShowMoreSheet(false); handleCreatePdf(); }}>
                <Ionicons name="document-outline" size={20} color={colors.blue} />
                <Text style={[styles.sheetActionText, { color: colors.blue }]}>Create PDF</Text>
              </TouchableOpacity>
            )}
            {!isMediaCategory && (
              <TouchableOpacity style={styles.sheetAction} onPress={handleMergePdfs}>
                <Ionicons name="documents-outline" size={20} color={colors.blue} />
                <Text style={[styles.sheetActionText, { color: colors.blue }]}>Merge PDFs</Text>
              </TouchableOpacity>
            )}
            <View style={[styles.sheetDivider, { backgroundColor: colors.border }]} />
            <TouchableOpacity style={styles.sheetAction} onPress={() => setShowMoreSheet(false)}>
              <Ionicons name="close-outline" size={20} color={colors.textMuted} />
              <Text style={[styles.sheetActionText, { color: colors.textMuted }]}>Cancel</Text>
            </TouchableOpacity>
          </Animated.View>
        </Pressable>
      </Modal>
      <Modal visible={extractedText !== null} transparent animationType="fade" onRequestClose={() => setExtractedText(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={() => setExtractedText(null)} />
          <View style={{ backgroundColor: colors.card, borderRadius: 16, padding: 20, width: SCREEN_WIDTH > SCREEN_HEIGHT ? SCREEN_WIDTH * 0.5 : SCREEN_WIDTH - 48, maxHeight: SCREEN_HEIGHT * 0.8 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: colors.textPrimary }}>Extracted Text</Text>
              <TouchableOpacity onPress={() => setExtractedText(null)}>
                <Ionicons name="close" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            {extractedText ? (
              <>
                <ScrollView
                  style={{ maxHeight: SCREEN_HEIGHT * (SCREEN_WIDTH > SCREEN_HEIGHT ? 0.5 : 0.45) }}
                  showsVerticalScrollIndicator={true}
                  bounces={true}
                >
                  <Text style={{ fontSize: 14, color: colors.textPrimary, lineHeight: 22 }} selectable>{extractedText}</Text>
                </ScrollView>
                <TouchableOpacity
                  onPress={async () => {
                    await Clipboard.setStringAsync(extractedText ?? '');
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    Alert.alert('Copied', 'Text copied to clipboard.');
                  }}
                  style={{ marginTop: 16, backgroundColor: colors.blue, borderRadius: 10, padding: 12, alignItems: 'center' }}
                >
                  <Text style={{ color: '#fff', fontWeight: '500' }}>Copy Text</Text>
                </TouchableOpacity>
              </>
            ) : (
              <Text style={{ fontSize: 14, color: colors.textMuted, textAlign: 'center', paddingVertical: 24 }}>No text found in this image.</Text>
            )}
          </View>
        </View>
      </Modal>
      <Modal visible={videoSummaryVisible} transparent animationType="fade" onRequestClose={() => {
        setVideoSummaryVisible(false);
        videoFrames.forEach(f => RNFS.unlink(f.path).catch(() => {}));
      }}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={() => {
            setVideoSummaryVisible(false);
            videoFrames.forEach(f => RNFS.unlink(f.path).catch(() => {}));
          }} />
          <View style={{ backgroundColor: colors.card, borderRadius: 16, padding: 20, width: SCREEN_WIDTH > SCREEN_HEIGHT ? SCREEN_WIDTH * 0.5 : SCREEN_WIDTH - 48 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: colors.textPrimary }}>Video Summary</Text>
              <TouchableOpacity onPress={() => {
                  setVideoSummaryVisible(false);
                  videoFrames.forEach(f => RNFS.unlink(f.path).catch(() => {}));
                }}>
                <Ionicons name="close" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            {loadingVideoSummary ? (
              <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                <ActivityIndicator color={colors.blue} />
                <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 12 }}>Analysing video...</Text>
              </View>
            ) : (
              <>
                <View style={{ flexDirection: 'row', gap: 6, marginBottom: 16 }}>
                  {videoFrames.map((frame, i) => (
                    <View key={i} style={{ flex: 1, aspectRatio: 16/9, borderRadius: 8, overflow: 'hidden', backgroundColor: colors.surface }}>
                      <Image source={{ uri: 'file://' + frame.path }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                    </View>
                  ))}
                </View>
                {videoLabels.length > 0 && (
                  <>
                    <Text style={{ fontSize: 11, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Detected</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                      {videoLabels.map((label, i) => (
                        <View key={i} style={{ backgroundColor: colors.surface, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 }}>
                          <Text style={{ fontSize: 12, color: colors.textSecondary }}>{label}</Text>
                        </View>
                      ))}
                    </View>
                  </>
                )}
              </>
            )}
          </View>
        </View>
      </Modal>
      <Modal visible={slideshowVisible} transparent={false} animationType="fade" onRequestClose={() => setSlideshowVisible(false)} statusBarTranslucent>
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <StatusBar barStyle="light-content" backgroundColor="#000" />
          {slideshowItems.length > 0 && ssOrder.length > 0 && (
            <MediaSlideshowView
              uris={slideshowItems.map(i => i.uri)}
              currentIndex={ssOrder[ssPos] ?? 0}
              onImagePress={() => setSsControlsVisible(v => { const next = !v; if (next) setSsPlaying(false); return next; })}
              style={StyleSheet.absoluteFill}
            />
          )}
          <SafeAreaView style={{ position: 'absolute', top: 0, left: 0, right: 0 }} pointerEvents="box-none">
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingVertical: 8 }}>
              <TouchableOpacity onPress={() => { setSlideshowVisible(false); setSsPlaying(false); }} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="close" size={26} color="#fff" />
              </TouchableOpacity>
              <Text style={{ color: '#fff', fontSize: 14, fontWeight: '500' }}>{ssPos + 1} / {ssOrder.length}</Text>
              <TouchableOpacity onPress={() => setSsShuffle(s => !s)} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="shuffle" size={24} color={ssShuffle ? '#fff' : 'rgba(255,255,255,0.35)'} />
              </TouchableOpacity>
            </View>
          </SafeAreaView>
          {ssControlsVisible && (
            <SafeAreaView style={{ ...StyleSheet.absoluteFillObject, justifyContent: 'space-between' }} pointerEvents="box-none">
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 }} pointerEvents="box-none">
                <TouchableOpacity onPress={() => setSsPos(prev => { let next = prev - 1; if (next < 0) next = ssOrder.length - 1; return next; })} style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="chevron-back" size={32} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setSsPos(prev => { let next = prev + 1; if (next >= ssOrder.length) { if (ssShuffle) setSsOrder(ssShuffledIndices(slideshowItems.length)); return 0; } return next; })} style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="chevron-forward" size={32} color="#fff" />
                </TouchableOpacity>
              </View>
              <View style={{ paddingHorizontal: 16, paddingBottom: 8, backgroundColor: 'rgba(0,0,0,0.55)', paddingTop: 12 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 12 }}>
                  {SS_SPEEDS.map(s => (
                    <TouchableOpacity key={s} onPress={() => setSsSpeed(s)} style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, backgroundColor: ssSpeed === s ? '#185FA5' : 'rgba(255,255,255,0.15)' }}>
                      <Text style={{ color: ssSpeed === s ? '#fff' : '#ccc', fontSize: 13, fontWeight: '500' }}>{SS_SPEED_LABELS[s]}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginBottom: 8 }}>
                  <TouchableOpacity onPress={() => { setSsControlsVisible(false); setSsPlaying(true); }} style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 6, minWidth: 56 }}>
                    <Ionicons name="play" size={26} color="#fff" />
                    <Text style={{ color: '#fff', fontSize: 11, marginTop: 4 }}>Play</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={async () => { if (!ssCurrent) return; try { await shareFiles([toPath(ssCurrent.uri)], 'image/*'); } catch {} }} style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 6, minWidth: 56 }}>
                    <Ionicons name="share-outline" size={26} color="#fff" />
                    <Text style={{ color: '#fff', fontSize: 11, marginTop: 4 }}>Share</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={async () => { if (!ssCurrent) return; if (ssIsFav) { await removeFavourite(ssCurrent.uri); setSsIsFav(false); } else { await addFavourite({ name: ssCurrent.name, uri: ssCurrent.uri }); setSsIsFav(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } }} style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 6, minWidth: 56 }}>
                    <Ionicons name={ssIsFav ? 'heart' : 'heart-outline'} size={26} color={ssIsFav ? '#E24B4A' : '#fff'} />
                    <Text style={{ color: '#fff', fontSize: 11, marginTop: 4 }}>{ssIsFav ? 'Faved' : 'Favourite'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleSsInfo} style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 6, minWidth: 56 }}>
                    <Ionicons name="information-circle-outline" size={26} color="#fff" />
                    <Text style={{ color: '#fff', fontSize: 11, marginTop: 4 }}>Info</Text>
                  </TouchableOpacity>
                </View>
                <Text style={{ color: '#888', fontSize: 12, textAlign: 'center', paddingVertical: 4 }} numberOfLines={1}>{ssCurrent?.name}</Text>
              </View>
            </SafeAreaView>
          )}
        </View>
      </Modal>
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
          <SafeAreaView style={{ position: 'absolute', top: 0, left: 0, right: 0 }} pointerEvents="box-none">
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingVertical: 8 }}>
            <TouchableOpacity onPress={() => setViewerUri(null)} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="close" size={26} color="#fff" />
              </TouchableOpacity>
              <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
                <TouchableOpacity onPress={async () => { if (!viewerUri) return; try { await shareFiles([toPath(viewerUri)], 'image/*'); } catch {} }} style={{ alignItems: 'center', gap: 4 }}>
                  <Ionicons name="share-outline" size={24} color="#fff" />
                  <Text style={{ color: '#fff', fontSize: 11 }}>Share</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={async () => { if (!viewerUri) return; try { await openFile(toPath(viewerUri), getMimeType(viewerUri.split('/').pop() ?? '')); } catch {} }} style={{ alignItems: 'center', gap: 4 }}>
                  <Ionicons name="open-outline" size={24} color="#fff" />
                  <Text style={{ color: '#fff', fontSize: 11 }}>Open with</Text>
                </TouchableOpacity>
              </View>
            </View>
          </SafeAreaView>
        </View>
      </Modal>
      <Modal visible={playerUri !== null} transparent={false} animationType="fade" onRequestClose={() => { setPlayerUri(null); setPlayerPaused(false); }} statusBarTranslucent>
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <StatusBar barStyle="light-content" backgroundColor="#000" />
          {playerUri && (
            <MediaPlayerView
              uri={playerUri}
              speed={playerSpeed}
              paused={playerPaused}
              onTap={() => setPlayerControlsVisible(v => !v)}
              onPlayingStateChange={(e: any) => {
                const isPlaying = e.nativeEvent.isPlaying;
                const duration = e.nativeEvent.duration;
                setPlayerControlsVisible(!isPlaying);
                setPlayerPaused(!isPlaying);
                if (duration) setPlayerDuration(duration);
              }}
              onComplete={() => setPlayerPaused(true)}
              style={StyleSheet.absoluteFill}
            />
          )}
        {playerControlsVisible && (
          <>
            <TouchableOpacity
              onPress={() => setPlayerPaused(p => !p)}
              style={{ position: 'absolute', top: '50%', left: '50%', transform: [{ translateX: -32 }, { translateY: -32 }], width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name={playerPaused ? 'play' : 'pause'} size={32} color="#fff" />
            </TouchableOpacity>
          <SafeAreaView style={{ position: 'absolute', top: 0, left: 0, right: 0 }} pointerEvents="box-none">
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: 8, paddingVertical: 8 }}>
              {/* Left: close + speed pills stacked vertically */}
              <View style={{ alignItems: 'center', gap: 8 }} onStartShouldSetResponder={() => true}>
                <TouchableOpacity onPress={() => { setPlayerUri(null); setPlayerPaused(false); }} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="close" size={26} color="#fff" />
                </TouchableOpacity>
                {[0.5, 1.0, 1.5, 2.0].map(s => (
                  <TouchableOpacity key={s} onPress={() => setPlayerSpeed(s)} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, backgroundColor: playerSpeed === s ? '#185FA5' : 'rgba(255,255,255,0.15)' }}>
                    <Text style={{ color: '#fff', fontSize: 13, fontWeight: '500' }}>{s}x</Text>
                  </TouchableOpacity>
                ))}
              </View>
                {/* Duration — centred, disappears when playing */}
                {playerDuration > 0 && (
                <View style={{ position: 'absolute', left: 0, right: 0, alignItems: 'center', top: 16 }} pointerEvents="none">
                  <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '500' }}>
                    {formatDuration(playerDuration)}
                  </Text>
                </View>
              )}
              {/* Top: share, open with */}
              <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center', paddingTop: 8 }}>
                <TouchableOpacity onPress={async () => { if (!playerUri) return; try { await shareFiles([toPath(playerUri)], 'video/*'); } catch {} }} style={{ alignItems: 'center', gap: 4 }}>
                  <Ionicons name="share-outline" size={24} color="#fff" />
                  <Text style={{ color: '#fff', fontSize: 11 }}>Share</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={async () => { if (!playerUri) return; setPlayerPaused(true); try { await openFile(toPath(playerUri), getMimeType(playerUri.split('/').pop() ?? '')); } catch {} }}style={{ alignItems: 'center', gap: 4 }}>
                  <Ionicons name="open-outline" size={24} color="#fff" />
                  <Text style={{ color: '#fff', fontSize: 11 }}>Open with</Text>
                </TouchableOpacity>
              </View>
            </View>
            </SafeAreaView>
          </>
        )}
        </View>
      </Modal>
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
  icon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12, overflow: 'hidden' },
  thumb: { width: 40, height: 40 },
  ext: { fontSize: 9, fontWeight: '500' },
  info: { flex: 1 },
  name: { fontSize: 14, fontWeight: '500', marginBottom: 2 },
  meta: { fontSize: 11 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 16 },
  sheetLandscape: { borderRadius: 20, paddingHorizontal: 24, paddingVertical: 16, width: '60%', maxHeight: '90%', alignSelf: 'center', marginTop: 'auto', marginBottom: 'auto' },
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
  qrOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  qrCard: { borderRadius: 16, padding: 16, paddingBottom: 24, alignItems: 'center', margin: 32, elevation: 8, overflow: 'hidden' },
  qrTitle: { fontSize: 18, fontWeight: '600', marginBottom: 4, letterSpacing: -0.3 },
  qrSub: { fontSize: 12, textAlign: 'center', marginBottom: 4 },
});
