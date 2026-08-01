import { copyFileStream, moveFileStream, addCopyProgressListener, startWifiServer, checkDuplicates, readTextPreview } from 'file-reader';
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { StyleSheet, Text, View, FlatList, TouchableOpacity, Image, ActivityIndicator, Modal, Animated, Pressable, Alert, TextInput, KeyboardAvoidingView, Platform, useWindowDimensions, ScrollView, StatusBar } from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { isImageFile, getMimeType, formatSize, getFileColor, formatDate, getFileIcon, toPath, getFriendlyPath, uniqueName, exifLines } from '@/utils/files';
import { addRecent } from '@/hooks/useRecents';
import { addFavourite, removeFavourite, isFavourite, useFavourites } from '@/hooks/useFavourites';
import RNFS from 'react-native-fs';
import { useVault } from '@/hooks/useVault';
import { usePro } from '@/hooks/usePro';
import { useTheme } from '@/hooks/useTheme';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import { shareFiles, openFile, printImage, printPdf, copyImageToClipboard } from '@/modules/share-module';
import { addMediaStoreChangeListener } from '@/modules/file-watcher';
import QRCode from 'react-native-qrcode-svg';
import { useTrash } from '@/hooks/useTrash';
import { MediaGridView } from 'media-grid';
import { isVideoFile, VideoThumb } from '@/utils/videoThumb';
import { DocIndexer } from '@/modules/doc-indexer';
import { queryDocuments, queryDownloads, queryDocumentsByMimeWithFolders, queryImages, queryVideos, getMediaInfo, queryImageFolders, queryVideoFolders, queryDocumentFolders, FolderGroup } from '@/modules/media-store';
import { scanFile } from '@/modules/share-module';
import { getStorageVolumes } from '@/modules/storage-stats';
import * as Haptics from 'expo-haptics';
import { createPdfFromImages, addPdfProgressListener, extractPdfPages, mergePdfs } from '@/modules/pdf-creator';
import { extractTextFromImage, extractVideoFrames, labelImage } from '@/modules/scan-module';
import { MediaSlideshowView } from 'media-slideshow';
import { MediaViewerView } from 'media-viewer';
import VideoPlayerModal from '@/components/VideoPlayerModal';
import { batchRename } from 'file-reader';
import FolderPickerModal from '@/components/FolderPickerModal';
import FileDetailsModal from '@/components/FileDetailsModal';
import { useBottomSheet } from '@/hooks/useBottomSheet';
import { syncPathReferences } from '@/hooks/usePathSync';
import { useTags } from '@/hooks/useTags';
import { addTag } from '@/hooks/useTags';
import { addTagToFile, getTagsForFile, removeTagFromFile } from '@/hooks/useFileTags';
import { recordOpen, getStats } from 'file-stats';

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

const SS_SPEEDS = [2000, 4000, 7000, 10000];
const SS_SPEED_LABELS: Record<number, string> = { 2000: '2s', 4000: '4s', 7000: '7s', 10000: '10s' };

const ROOT_PATH = 'file:///storage/emulated/0/';

const nameCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

type SortKey = 'name_asc' | 'name_desc' | 'size_desc' | 'size_asc' | 'date_desc' | 'date_asc';

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
  const { tags } = useTags();
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [fileTags, setFileTags] = useState<string[]>([]);
  const [showNewTag, setShowNewTag] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#3B6D11');
  const [newTagIcon, setNewTagIcon] = useState('pricetag-outline');
  const insets = useSafeAreaInsets();
  const { sheetAnim, panResponder, animateOpen, closeSheet } = useBottomSheet(() => {
    setShowSheet(false);
    setSelectedItem(null);
  });
  const sharingRef = useRef(false);
  const suppressWatcherRef = useRef(false);
  const [deleting, setDeleting] = useState(false);
  const [deletingCount, setDeletingCount] = useState(0);
  const [deletingTotal, setDeletingTotal] = useState(0);
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
  const [sortKey, setSortKey] = useState<SortKey>('name_asc');
  const [showSortSheet, setShowSortSheet] = useState(false);
  const [gridView, setGridView] = useState(true);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedUris, setSelectedUris] = useState<Set<string>>(new Set());
  const [selectedItemsMap, setSelectedItemsMap] = useState<Map<string, FileItem>>(new Map());
  const [sharing, setSharing] = useState(false);
  const [vaulting, setVaulting] = useState(false);
  const [vaultingTotal, setVaultingTotal] = useState(0);
  const isMediaCategory = category === 'images' || category === 'videos';
  const isMediaFile = (item: FileItem | null) =>
    !!item && (isImageFile(item.name) || isVideoFile(item.name));
  const [folderView, setFolderView] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState<FolderGroup | null>(null);
  const [folderGroups, setFolderGroups] = useState<FolderGroup[]>([]);
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
  const [viewerImages, setViewerImages] = useState<FileItem[]>([]);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [playerUri, setPlayerUri] = useState<string | null>(null);
  const [showMultiRename, setShowMultiRename] = useState(false);
  const [multiRenameBase, setMultiRenameBase] = useState('');
  const [multiRenamePickerVisible, setMultiRenamePickerVisible] = useState(false);
  const [multiRenaming, setMultiRenaming] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [detailsData, setDetailsData] = useState<{ label: string; value: string }[]>([]);
  const [detailsName, setDetailsName] = useState('');
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [txtPreview, setTxtPreview] = useState<string | null>(null);
  const [dragCount, setDragCount] = useState<number | null>(null);
  const [renaming, setRenaming] = useState(false);
  const { favourites } = useFavourites();
  const favSet = useMemo(() => new Set(favourites.map(f => f.uri)), [favourites]);

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
    if (selectedFolder) {
      const handler = () => { setSelectedFolder(null); return true; };
      const sub = require('react-native').BackHandler.addEventListener('hardwareBackPress', handler);
      return () => sub.remove();
    }
  }, [selectedFolder]);
  

  function openSlideshow() {
    const sourceItems = folderSourceItems;
    const seen = new Set<string>();
    const deduped = sourceItems.filter(it => {
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
    exifLines(info).forEach(l => lines.push(`${l.label}: ${l.value}`));
  } catch {}
  Alert.alert(ssCurrent.name, lines.join('\n'));
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
    pendingMultiItems.current = [];
    setPickerMode(mode);
    setPickerPath(ROOT_PATH);
    loadPickerDir(ROOT_PATH);
    setShowPicker(true);
    closeSheet();
  }

  async function loadCategoryWithSort(sk: SortKey) {
    setLoading(true);
    try {
      if (category === 'images' || category === 'videos') {
        const assets = category === 'images' ? await queryImages(sk) : await queryVideos(sk);
        setItems(assets.map(a => ({ name: a.name, uri: a.uri, date: a.date, size: a.size })));
      } else if (category === 'downloads') {
        const dlItems = await queryDownloads(sk);
        setItems(dlItems);
      } else if (category === 'documents') {
        const docItems = await queryDocuments(sk);
        setItems(docItems);
      }
    } catch (e) {
    } finally {
      setLoading(false);
    }
  }

  async function loadFolders(tab: string = activeTab) {
    if (category === 'images') {
      setFolderGroups(await queryImageFolders());
    } else if (category === 'videos') {
      setFolderGroups(await queryVideoFolders());
    } else if (category === 'documents') {
      const mimes = tab === 'All' ? [] : (TAB_MIMES[tab] ?? []);
      setFolderGroups(await queryDocumentFolders(mimes));
    }
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
      Alert.alert('Already exists', `"${item.name}" already exists in this folder.`);
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
    if (!selectedItem || !renameValue.trim() || renaming) return;
    setRenaming(true);
    const uri = selectedItem.uri.endsWith('/') ? selectedItem.uri.slice(0, -1) : selectedItem.uri;
    const parentPath = uri.substring(0, uri.lastIndexOf('/') + 1);
    const newUri = parentPath + renameValue.trim();
    const oldUri = selectedItem.uri;
    const newName = renameValue.trim();
    try {
      const invalidChars = /[*\/\\:?"<>|]/;
      if (invalidChars.test(newName)) {
        Alert.alert('Invalid name', 'File names cannot contain: * / \\ : ? " < > |');
        return;
      }
      const destExists = await RNFS.exists(toPath(newUri));
      if (destExists) {
        Alert.alert('Name already taken', `A file named "${newName}" already exists in this folder.`);
        return;
      }
      await RNFS.moveFile(toPath(oldUri), toPath(newUri));
      await syncPathReferences(oldUri, newUri, newName);
      // Register the new path, then clear the old one — scanning a path that
      // no longer exists makes MediaStore drop the stale row.
      await scanFile(toPath(newUri)).catch(() => {});
      await scanFile(toPath(oldUri)).catch(() => {});
      setItems(prev => prev.map(f => f.uri === oldUri ? { ...f, name: newName, uri: newUri } : f));
      closeSheet();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert('Rename failed', 'Could not rename this file.');
    } finally {
      setRenaming(false);
    }
  }

  const sortKeyRef = useRef<SortKey>('name_asc');
  const folderViewRef = useRef(false);
  const selectedFolderRef = useRef<FolderGroup | null>(null);
  const activeTabRef = useRef('All');

  useEffect(() => {
      sortKeyRef.current = sortKey;
    }, [sortKey]);
  useEffect(() => { folderViewRef.current = folderView; }, [folderView]);
  useEffect(() => { selectedFolderRef.current = selectedFolder; }, [selectedFolder]);
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);
  async function refreshAll() {
    loadCategoryWithSort(sortKeyRef.current);
    if (folderViewRef.current) {
      const tab = activeTabRef.current;
      const sk = sortKeyRef.current;
      const mimes = tab === 'All' ? [] : (TAB_MIMES[tab] ?? []);
      const refreshed = category === 'images' ? await queryImageFolders(sk)
        : category === 'videos' ? await queryVideoFolders(sk)
        : await queryDocumentFolders(mimes, sk);
      setFolderGroups(refreshed);
      const current = selectedFolderRef.current;
      if (current) {
        const stillThere = refreshed.find(g => g.folderPath === current.folderPath);
        setSelectedFolder(stillThere ?? null);
      }
    }
  }

  useEffect(() => {
    setSearchQuery('');
    loadCategory();
    const subscription = addMediaStoreChangeListener(() => {
      if (suppressWatcherRef.current) return;
      refreshAll();
    });
    return () => subscription.remove();
  }, [category]);

  const firstFocusRef = useRef(true);
  useFocusEffect(
    useCallback(() => {
      // The mount effect already loaded on first focus.
      if (firstFocusRef.current) { firstFocusRef.current = false; return; }
      refreshAll();
    }, [category])
  );

  useEffect(() => {
    getStorageVolumes().then(setVolumes);
  }, []);

  async function openSheet(item: FileItem) {
    setTxtPreview(null);
    setSelectedItem(item);
    setFileSize(null);
    setIsFav(await isFavourite(item.uri));
    setFileTags(await getTagsForFile(item.uri));
    setShowRename(false);
    setRenameValue('');
    setShowSheet(true);
    animateOpen();
    if (!item.size || item.size === 0) {
      try {
        const file = new FileSystem.File(item.uri);
        if (file.size && file.size > 0) { setFileSize(formatSize(file.size)); return; }
      } catch {}
      setFileSize('Unknown');
    }
    const lowerName = item.name.toLowerCase();
    if (lowerName.endsWith('.txt')) {
      readTextPreview(toPath(item.uri)).then(setTxtPreview).catch(() => setTxtPreview(null));
    } else if (lowerName.endsWith('.pdf')) {
      DocIndexer.getPdfPreview(toPath(item.uri)).then(text => setTxtPreview(text || null)).catch(() => setTxtPreview(null));
    }
  }

  async function handleDelete() {
    const item = selectedItem;
    if (!item) return;

    const doDelete = async () => {
      closeSheet();
      const ok = await moveToTrash(item.uri, item.name);
      if (ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        await removeFavourite(item.uri);
        DocIndexer.removeFromIndex(item.uri);
        setItems(prev => prev.filter(f => f.uri !== item.uri));
        if (selectedFolder) {
          setSelectedFolder(prev => prev ? {
            ...prev,
            count: prev.count - 1,
            uris: prev.uris.filter(u => u !== item.uri),
          } : prev);
          setFolderGroups(prev => prev.map(g =>
            g.folderPath === selectedFolder.folderPath
              ? { ...g, count: g.count - 1, uris: g.uris.filter(u => u !== item.uri) }
              : g
          ));
        }
      } else {
        Alert.alert('Error', 'Could not move file to Trash.');
      }
    };

    Alert.alert('Move to Trash', `"${item.name}" will be moved to Trash and deleted after 30 days.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Move to Trash', style: 'destructive', onPress: doDelete },
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
    const dstPaths = files.map(f => toPath(destDir + f.name));
    const existingPaths = await checkDuplicates(dstPaths);
    const existingSet = new Set(existingPaths);
    const duplicates = files
      .filter(f => existingSet.has(toPath(destDir + f.name)))
      .map(f => f.name);

    // If duplicates exist, ask once before starting
    if (duplicates.length > 0) {
      const dupeList = duplicates.slice(0, 3).join(', ') +
        (duplicates.length > 3 ? ` and ${duplicates.length - 3} more` : '');
      const action = await new Promise<'skip' | 'replace' | 'cancel'>((resolve) => {
        Alert.alert(
          duplicates.length === 1 ? 'Already exists' : 'Already exist',
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

     // Resolve final destination names up-front so same-named files in the
    // selection don't overwrite each other. Seed with what's already in the
    // destination (unless replacing) so we don't clobber existing files either.
    const claimed = new Set<string>();
    if (dupeAction.current !== 'replace') {
      existingPaths.forEach(p => claimed.add(p.substring(p.lastIndexOf('/') + 1)));
    }
    const finalNames = new Map<string, string>();   // file.uri -> final name
    for (const f of files) {
      const skipThis = existingSet.has(toPath(destDir + f.name)) && dupeAction.current === 'skip';
      if (skipThis) continue;                        // skipped files need no name
      if (dupeAction.current === 'replace' && existingSet.has(toPath(destDir + f.name))) {
        finalNames.set(f.uri, f.name);               // deliberate overwrite of existing
        claimed.add(f.name);
      } else {
        finalNames.set(f.uri, uniqueName(f.name, claimed));
      }
    }

    const actualTotal = finalNames.size;

    if (actualTotal === 0) {
      Alert.alert('Nothing to do', 'All selected files already exist at the destination and were skipped.');
      return;
    }

    setMultiPasting(true);
    suppressWatcherRef.current = true;
    let copiedCount = 0;
    const sub = addCopyProgressListener(() => {});
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const finalName = finalNames.get(file.uri);
        if (!finalName) continue;                    // was skipped
        const dst = toPath(destDir + finalName);
        const src = toPath(file.uri);
        if (i % 10 === 0 || i === files.length - 1) {
          setMultiPasteProgress({ current: copiedCount + 1, total: actualTotal, name: finalName });
        }

        if (multiPasteMode === 'copy') {
          await copyFileStream(file.uri, dst);
          await scanFile(dst).catch(() => {});
        } else {
          await moveFileStream(src, dst);
          await syncPathReferences(file.uri, destDir + finalName, finalName);
          await scanFile(dst).catch(() => {});
        }
        copiedCount++;
      }

      if (multiPasteMode === 'move') {
        const movedUris = new Set(finalNames.keys());   // only the ones actually moved
        setItems(prev => prev.filter(f => !movedUris.has(f.uri)));
      }
      setSelectMode(false);
      setSelectedUris(new Set());
      setSelectedItemsMap(new Map());
      Alert.alert(
        'Success',
        copiedCount < actualTotal
          ? `${copiedCount} item${copiedCount !== 1 ? 's' : ''} ${multiPasteMode === 'copy' ? 'copied' : 'moved'} successfully. ${actualTotal - copiedCount} skipped (duplicate names).`
          : `${copiedCount} item${copiedCount !== 1 ? 's' : ''} ${multiPasteMode === 'copy' ? 'copied' : 'moved'} successfully.`
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert('Error', `Could not ${multiPasteMode} files.`);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      sub.remove();
      suppressWatcherRef.current = false;
      setMultiPasting(false);
      setMultiPasteProgress(null);
      pendingMultiItems.current = [];
    }
  }

  async function handleCreatePdf() {
    const files = Array.from(selectedItemsMap.values()).filter(f => isImageFile(f.name));
    if (files.length === 0) {
      Alert.alert('No images selected', 'Select at least one image to create a PDF.');
      return;
    }
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
        const assets = category === 'images' ? await queryImages(sortKey) : await queryVideos(sortKey);
        setItems(assets.map(a => ({ name: a.name, uri: a.uri, date: a.date, size: a.size })));
      } else if (category === 'downloads') {
        const dlItems = await queryDownloads();
        setItems(dlItems);
      } else if (category === 'documents') {
        const docItems = await queryDocuments(sortKey);
        setItems(docItems);
      }
    } catch (e) {
    } finally {
      setLoading(false);
    }
  }

  async function openItem(item: FileItem) {
    await addRecent({ name: item.name, uri: item.uri, openedAt: Date.now() });
    recordOpen(item.uri);
    if (isImageFile(item.name)) {
      const sourceItems = folderSourceItems;
      const imgs = sourceItems.filter(i => isImageFile(i.name));
      const idx = imgs.findIndex(i => i.uri === item.uri);
      setViewerImages(imgs);
      setViewerIndex(idx >= 0 ? idx : 0);
      setViewerUri(item.uri);
      return;
    }
    if (isVideoFile(item.name)) {
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

  function goToViewerImage(newIndex: number) {
    if (newIndex < 0 || newIndex >= viewerImages.length) return;
    setViewerIndex(newIndex);
    setViewerUri(viewerImages[newIndex].uri);
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
            Alert.alert('Moved to Vault', `"${name}" is now secured.`);
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
        suppressWatcherRef.current = true;
        setVaulting(true);
        setVaultingTotal(files.length);
        await new Promise(r => requestAnimationFrame(() => r(null)));
        const moved: string[] = [];
        let failed = 0;
        try {
          for (const file of files) {
            const ok = await addToVault(file.uri, file.name, false);
            if (ok) {
              moved.push(file.uri);
              DocIndexer.removeFromIndex(file.uri);
            } else {
              failed++;
            }
          }
          const movedSet = new Set(moved);
          setItems(prev => prev.filter(f => !movedSet.has(f.uri)));
          setSelectMode(false);
          setSelectedUris(new Set());
          setSelectedItemsMap(new Map());
          if (failed > 0) {
            Alert.alert(
              moved.length > 0 ? 'Partial success' : 'Error',
              moved.length > 0
                ? `${moved.length} file${moved.length !== 1 ? 's' : ''} moved to Vault. ${failed} could not be moved.`
                : 'Could not move files to Vault.'
            );
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          } else {
            Alert.alert('Moved to Vault', `${moved.length} file${moved.length !== 1 ? 's' : ''} secured.`);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }
        } finally {
          setVaulting(false);
          setVaultingTotal(0);
          suppressWatcherRef.current = false;
        }
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
        setDeletingTotal(files.length);
        setDeletingCount(0);
        try {
          for (const file of files) {
            await moveToTrash(file.uri, file.name, false);
            removeFavourite(file.uri);
            DocIndexer.removeFromIndex(file.uri);
            setDeletingCount(prev => prev + 1);
          }
          setItems(prev => prev.filter(f => !selectedUris.has(f.uri)));
          setSelectMode(false);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setSelectedUris(new Set()); setSelectedItemsMap(new Map());
        } finally {
          setDeleting(false);
          setDeletingCount(0);
          setDeletingTotal(0);
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

  async function handleMultiRename(folderPath: string) {
    const files = Array.from(selectedItemsMap.values());
    const baseName = multiRenameBase.trim();
    if (!baseName) return;
  
    setMultiRenamePickerVisible(false);
    setShowMultiRename(false);
    setMultiRenaming(true);
  
    try {
      const items = files.map((file, index) => {
        const ext = file.name.includes('.') ? '.' + file.name.split('.').pop()! : '';
        const newName = `${baseName}_${index + 1}${ext}`;
        const dst = `${folderPath.replace(/\/$/, '')}/${newName}`;
        return { src: toPath(file.uri), dst };
      });
  
      const results = await batchRename(items);
      const succeeded = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;
  
      // Update items list for moved files
      if (succeeded > 0) {
        await scanFile(folderPath).catch(() => {});
        setItems(prev => prev.filter(f => !selectedUris.has(f.uri)));
      }
  
      const sdVol = volumes.find(v => v.type === 'sdcard' && folderPath.includes(v.path));
      const friendlyPath = sdVol
        ? (folderPath.replace(`${sdVol.path}/`, '').replace(/\/$/, '') || sdVol.name)
        : (folderPath.replace('/storage/emulated/0/', '').replace(/\/$/, '') || 'Internal Storage');
      const msg = failed > 0
        ? `${succeeded} file${succeeded !== 1 ? 's' : ''} renamed. ${failed} failed.\nSaved to ${friendlyPath}`
        : `${succeeded} file${succeeded !== 1 ? 's' : ''} renamed as ${baseName}_1, ${baseName}_2...\nSaved to ${friendlyPath}`;
  
      Alert.alert('Renamed', msg);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSelectMode(false);
      setSelectedUris(new Set());
      setSelectedItemsMap(new Map());
    } catch {
      Alert.alert('Error', 'Could not rename files.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setMultiRenaming(false);
      setMultiRenameBase('');
    }
  }

  const tabs = category === 'documents' ? DOC_TABS : category === 'downloads' ? DL_TABS : null;

  const filteredItems = useMemo(() => {
    let result = (activeTab !== 'All' && category === 'downloads')
      ? items.filter(item => getDlTab(item.name) === activeTab)
      : items;
    if (searchQuery.trim()) {
      result = result.filter(item => item.name.toLowerCase().includes(searchQuery.toLowerCase()));
    }
    if (sortKey === 'name_asc') {
      result = result.slice().sort((a, b) => nameCollator.compare(a.name, b.name));
    } else if (sortKey === 'name_desc') {
      result = result.slice().sort((a, b) => nameCollator.compare(b.name, a.name));
    }
    return result;
  }, [items, activeTab, searchQuery, category, sortKey]);

  const sortedFolderGroups = useMemo(() => {
    if (sortKey === 'name_asc') return folderGroups.slice().sort((a, b) => nameCollator.compare(a.folderName, b.folderName));
    if (sortKey === 'name_desc') return folderGroups.slice().sort((a, b) => nameCollator.compare(b.folderName, a.folderName));
    return folderGroups;
  }, [folderGroups, sortKey]);

  const gridUris = useMemo(() => filteredItems.map(i => i.uri), [filteredItems]);
  const gridDates = useMemo(() => filteredItems.map(i => i.date ?? 0), [filteredItems]);
  const itemsByUri = useMemo(
    () => new Map(filteredItems.map(i => [i.uri, i])),
    [filteredItems]
  );

  const folderSourceItems = useMemo<FileItem[]>(
    () => {
      const list = (folderView && selectedFolder)
        ? selectedFolder.uris.map(uri => itemsByUri.get(uri)).filter((x): x is FileItem => x !== undefined)
        : filteredItems;
      if (sortKey === 'name_asc') return list.slice().sort((a, b) => nameCollator.compare(a.name, b.name));
      if (sortKey === 'name_desc') return list.slice().sort((a, b) => nameCollator.compare(b.name, a.name));
      return list;
    },
    [folderView, selectedFolder, itemsByUri, filteredItems, sortKey]
  );

  const folderListData = useMemo<FileItem[]>(
    () => {
      const list = (selectedFolder?.uris ?? [])
        .map(uri => itemsByUri.get(uri))
        .filter((x): x is FileItem => x !== undefined);
      if (sortKey === 'name_asc') return list.sort((a, b) => nameCollator.compare(a.name, b.name));
      if (sortKey === 'name_desc') return list.sort((a, b) => nameCollator.compare(b.name, a.name));
      return list;
    },
    [selectedFolder, itemsByUri, sortKey]
  );

  const selectedHasImages = useMemo(() =>
    Array.from(selectedItemsMap.values()).some(f => isImageFile(f.name)),
    [selectedItemsMap]
  );
  const selectedHasPdfs = useMemo(() =>
    Array.from(selectedItemsMap.values()).some(f => f.name.toLowerCase().endsWith('.pdf')),
    [selectedItemsMap]
  );

  const pickerData = useMemo(() => [...pickerItems, ...pickerFiles], [pickerItems, pickerFiles]);

  const pickerPathDisplay = useMemo(() => {
    let display = pickerPath.replace('file:///storage/emulated/0/', 'Storage/');
    const sdVol = volumes.find(v => v.type === 'sdcard' && pickerPath.includes(v.path));
    if (sdVol) display = display.replace(`file://${sdVol.path}/`, `${sdVol.name}/`).replace(`file://${sdVol.path}`, sdVol.name);
    try { return decodeURIComponent(display); } catch { return display; }
  }, [pickerPath, volumes]);

  const shownCount = dragCount ?? selectedUris.size;

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.background }]}>
        {selectMode ? (
          <>
            <TouchableOpacity onPress={() => { setSelectMode(false); setSelectedUris(new Set()); 
              setSelectedItemsMap(new Map()); }} style={styles.backBtn} disabled={multiPasting || deleting}>
              <Ionicons name="close" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={[styles.title, { color: colors.textPrimary }]}>
              {shownCount} {shownCount === 1
                ? config.title.slice(0, -1).toLowerCase()
                : config.title.toLowerCase()} selected
            </Text>
            <TouchableOpacity
              onPress={() => {
                const allFiles = folderSourceItems;
                const newSet = new Set(allFiles.map(f => f.uri));
                const newMap = new Map(allFiles.map(f => [f.uri, f]));
                setSelectedUris(newSet);
                setSelectedItemsMap(newMap);
              }}
              style={{ width: 40, height: 40, justifyContent: 'center', alignItems: 'center'}}
              disabled={multiPasting || deleting}
            >
              <Text style={{ fontSize: 12, color: (multiPasting || deleting) ? colors.textDisabled : colors.blue, fontWeight: '500' }}>All</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={[styles.title, { color: colors.textPrimary }]}>{config.title}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <TouchableOpacity
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setSelectMode(true); setSelectedUris(new Set()); setSelectedItemsMap(new Map()); }}
                style={{ width: 40, height: 40, justifyContent: 'center', alignItems: 'center' }}
              >
                <Ionicons name="checkmark-circle-outline" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
              {isMediaCategory && !(folderView && selectedFolder === null) && (
                <TouchableOpacity
                  onPress={() => setGridView(v => !v)}
                  style={{ width: 40, height: 40, justifyContent: 'center', alignItems: 'center' }}
                >
                  <Ionicons name={gridView ? 'list-outline' : 'grid-outline'} size={22} color={colors.textSecondary} />
                </TouchableOpacity>
              )}
              {isMediaCategory ? (
                <TouchableOpacity
                  onPress={() => setShowHeaderMenu(true)}
                  style={{ width: 40, height: 40, justifyContent: 'center', alignItems: 'center' }}
                >
                  <Ionicons name="ellipsis-vertical" size={22} color={colors.textSecondary} />
                </TouchableOpacity>
              ) : (
                <>
                  {(category === 'documents') && (
                    <TouchableOpacity
                      onPress={async () => {
                        const next = !folderView;
                        setFolderView(next);
                        setSelectedFolder(null);
                        if (next) { setLoading(true); await loadFolders(activeTab); setLoading(false); }
                      }}
                      style={{ width: 40, height: 40, justifyContent: 'center', alignItems: 'center' }}
                    >
                      <Ionicons name={folderView ? 'folder' : 'folder-outline'} size={22} color={folderView ? colors.blue : colors.textSecondary} />
                    </TouchableOpacity>
                  )}
                  {(!folderView || selectedFolder !== null) && (
                    <TouchableOpacity onPress={() => setShowSortSheet(true)} style={{ width: 40, height: 40, justifyContent: 'center', alignItems: 'center' }}>
                      <Ionicons name="swap-vertical-outline" size={22} color={colors.textSecondary} />
                    </TouchableOpacity>
                  )}
                </>
              )}
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
                setSelectedFolder(null);
                setLoading(true);
                const mimes = tab === 'All' ? [] : (TAB_MIMES[tab] ?? []);
                if (category === 'documents') {
                  const result = await queryDocumentsByMimeWithFolders(mimes, sortKey);
                  setItems(result.files);
                  if (folderView) setFolderGroups(result.folders);
                } else {
                  const all = await queryDownloads(sortKey);
                  const filtered = tab === 'All' ? all : all.filter(item => getDlTab(item.name) === tab);
                  setItems(filtered);
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
      {deleting && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: colors.surface }}>
          <ActivityIndicator size="small" color={colors.deleteRed} />
          <Text style={{ fontSize: 13, color: colors.textSecondary }}>
            {deletingTotal > 1 ? `Moving ${deletingCount} of ${deletingTotal} files to Trash...` : `Moving ${deletingCount} file${deletingCount !== 1 ? 's' : ''} to Trash...`}           
          </Text>
        </View>
      )}
      {vaulting && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: colors.surface }}>
          <ActivityIndicator size="small" color={colors.blue} />
          <Text style={{ fontSize: 13, color: colors.textSecondary }}>
            Moving {vaultingTotal} file{vaultingTotal !== 1 ? 's' : ''} to Vault...
          </Text>
        </View>
      )}
      {multiRenaming && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: colors.surface }}>
          <ActivityIndicator size="small" color={colors.blue} />
          <Text style={{ fontSize: 13, color: colors.textSecondary }}>Renaming files...</Text>
        </View>
      )}
      {extractingText && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: colors.surface }}>
          <ActivityIndicator size="small" color={colors.blue} />
          <Text style={{ fontSize: 13, color: colors.textSecondary }}>Reading text...</Text>
        </View>
      )}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={config.color} />
          <Text style={[styles.empty, { color: colors.textMuted, marginTop: 8 }]}>Loading...</Text>
        </View>
      ) : folderView && selectedFolder === null ? (
        // Folder list view
        <FlatList
          data={sortedFolderGroups}
          keyExtractor={item => item.folderPath}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <Text style={[styles.count, { color: colors.textMuted }]}>
              {folderGroups.length} folder{folderGroups.length !== 1 ? 's' : ''}
            </Text>
          }
          renderItem={({ item: group }) => (
            <TouchableOpacity
              style={[styles.row, { borderBottomColor: colors.border }]}
              onPress={() => setSelectedFolder(group)}
              activeOpacity={0.7}
            >
              <View style={[styles.icon, { backgroundColor: colors.yellow + '22', overflow: 'hidden' }]}>
                {(category === 'images' || category === 'videos') ? (
                  category === 'images' ? (
                    <Image source={{ uri: group.previewUri }} style={styles.thumb} resizeMode="cover" />
                  ) : (
                    <VideoThumb uri={group.previewUri} style={styles.thumb} />
                  )
                ) : (
                  <Ionicons name="folder" size={22} color={colors.yellow} />
                )}
              </View>
              <View style={styles.info}>
                <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>{group.folderName}</Text>
                <Text style={[styles.meta, { color: colors.textMuted }]}>{group.count} file{group.count !== 1 ? 's' : ''}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textDisabled} />
            </TouchableOpacity>
          )}
        />
      ) : folderView && selectedFolder !== null ? (
        // Folder drill-down — grid of files in selected folder
        <>
          <TouchableOpacity
            onPress={() => setSelectedFolder(null)}
            style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, gap: 8 }}
          >
            <Ionicons name="arrow-back" size={18} color={colors.blue} />
            <Text style={{ fontSize: 13, color: colors.blue, fontWeight: '500' }}>{selectedFolder?.folderName}</Text>
            <Text style={{ fontSize: 13, color: colors.textMuted }}>
              · {selectedFolder?.count} file{selectedFolder?.count !== 1 ? 's' : ''}
            </Text>
          </TouchableOpacity>
          {(category === 'images' || category === 'videos') && gridView ? (
            <MediaGridView
              selectedUris={Array.from(selectedUris)}
              style={{ flex: 1 }}
              key={`folder-${selectedFolder?.folderPath}`}
              uris={selectedFolder?.uris ?? []}
              placeholderColor={colors.surface}
              selectMode={selectMode}
              category={(category === 'videos' ? 'videos' : 'images')}
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
              onDragSelectEnd={(e: { nativeEvent: { uris: string[] } }) => {
                const newSet = new Set(selectedUris);
                const newMap = new Map(selectedItemsMap);
                e.nativeEvent.uris.forEach(uri => {
                  newSet.add(uri);
                  const item = filteredItems.find(i => i.uri === uri);
                  if (item) newMap.set(uri, item);
                });
                setSelectedUris(newSet);
                setSelectedItemsMap(newMap);
                setDragCount(null); 
              }}
              // Expo event payload numbers should use Double for reliable JS bridge conversion.
              onDragSelectProgress={(e: { nativeEvent: { count: number } }) => {
                setDragCount(e.nativeEvent.count);
              }}
              onSelectionChange={(e) => {
                const uris: string[] = e.nativeEvent.selectedUris;
                const newSet = new Set(uris);
                setSelectedUris(newSet);
                setSelectedItemsMap(() => {
                  const newMap = new Map<string, FileItem>();
                  uris.forEach(uri => {
                    const item = itemsByUri.get(uri);
                    if (item) newMap.set(uri, item);
                  });
                  return newMap;
                });
              }}
            />
          ) : (category === 'images' || category === 'videos') && !gridView ? (
            <FlatList
              data={folderListData}
              keyExtractor={item => item.uri}
              contentContainerStyle={styles.list}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => {
                const isSelected = selectedUris.has(item.uri);
                return (
                  <TouchableOpacity
                    style={[styles.row, { borderBottomColor: colors.border, backgroundColor: isSelected ? colors.blueTint : 'transparent' }]}
                    onPress={() => {
                      if (selectMode) {
                        const newSet = new Set(selectedUris);
                        const newMap = new Map(selectedItemsMap);
                        if (isSelected) { newSet.delete(item.uri); newMap.delete(item.uri); }
                        else { newSet.add(item.uri); newMap.set(item.uri, item); }
                        setSelectedUris(newSet);
                        setSelectedItemsMap(newMap);
                      } else {
                        openItem(item);
                      }
                    }}
                    onLongPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); openSheet(item); }}
                    activeOpacity={0.7}
                  >
                    {selectMode && (
                      <View style={{ marginRight: 12 }}>
                        <Ionicons name={isSelected ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={isSelected ? colors.blue : colors.textMuted} />
                      </View>
                    )}
                    <View style={[styles.icon, { backgroundColor: getFileColor(item.name) + '22', overflow: 'hidden' }]}>
                      <Image source={{ uri: item.uri }} style={styles.thumb} resizeMode="cover" />
                    </View>
                    <View style={styles.info}>
                      <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>{item.name}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={[styles.meta, { color: colors.textMuted }]}>
                          {item.size ? formatSize(item.size) : ''}
                          {item.size && item.date ? ' · ' : ''}
                          {item.date ? formatDate(item.date) : ''}
                        </Text>
                        {favSet.has(item.uri) && (
                          <Ionicons name="heart" size={12} color="#E24B4A" />
                        )}
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.textDisabled} />
                  </TouchableOpacity>
                );
              }}
            />
          ) : (
            <FlatList
              data={folderListData}
              keyExtractor={item => item.uri}
              contentContainerStyle={styles.list}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => {
                const color = getFileColor(item.name);
                const isSelected = selectedUris.has(item.uri);
                return (
                  <TouchableOpacity
                    style={[styles.row, { borderBottomColor: colors.border, backgroundColor: isSelected ? colors.blueTint : 'transparent' }]}
                    onPress={() => {
                      if (selectMode) {
                        const newSet = new Set(selectedUris);
                        const newMap = new Map(selectedItemsMap);
                        if (isSelected) { newSet.delete(item.uri); newMap.delete(item.uri); }
                        else { newSet.add(item.uri); newMap.set(item.uri, item); }
                        setSelectedUris(newSet);
                        setSelectedItemsMap(newMap);
                      } else {
                        openItem(item);
                      }
                    }}
                    onLongPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); openSheet(item); }}
                    activeOpacity={0.7}
                  >
                    {selectMode && (
                      <View style={{ marginRight: 12 }}>
                        <Ionicons name={isSelected ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={isSelected ? colors.blue : colors.textMuted} />
                      </View>
                    )}
                    <View style={[styles.icon, { backgroundColor: color + '22' }]}>
                      <Ionicons name={getFileIcon(item.name) as any} size={20} color={color} />
                    </View>
                    <View style={styles.info}>
                      <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>{item.name}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={[styles.meta, { color: colors.textMuted }]}>
                          {item.size ? formatSize(item.size) : ''}
                          {item.size && item.date ? ' · ' : ''}
                          {item.date ? formatDate(item.date) : ''}
                        </Text>
                        {favSet.has(item.uri) && (
                          <Ionicons name="heart" size={12} color="#E24B4A" />
                        )}
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.textDisabled} />
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </>
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
            key={`grid-${sortKey}-${searchQuery}`}
            uris={gridUris}
            itemDates={gridDates}
            sortMode={sortKey}
            placeholderColor={colors.surface}
            selectMode={selectMode && !multiPasting && !deleting}
            category={(category === 'videos' ? 'videos' : 'images')}
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
            onDragSelectEnd={(e: { nativeEvent: { uris: string[] } }) => {
              const newSet = new Set(selectedUris);
              const newMap = new Map(selectedItemsMap);
              e.nativeEvent.uris.forEach(uri => {
                newSet.add(uri);
                const item = filteredItems.find(i => i.uri === uri);
                if (item) newMap.set(uri, item);
              });
              setSelectedUris(newSet);
              setSelectedItemsMap(newMap);
              setDragCount(null); 
            }}
            // Expo event payload numbers should use Double for reliable JS bridge conversion.
            onDragSelectProgress={(e: { nativeEvent: { count: number } }) => {
              setDragCount(e.nativeEvent.count);
            }}
            onSelectionChange={(e) => {
              const uris: string[] = e.nativeEvent.selectedUris;
              const newSet = new Set(uris);
              setSelectedUris(newSet);
              setSelectedItemsMap(() => {
                const newMap = new Map<string, FileItem>();
                uris.forEach(uri => {
                  const item = itemsByUri.get(uri);
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
                const isImg = isImageFile(item.name)
                return (
                  <TouchableOpacity
                    style={[styles.row, { borderBottomColor: colors.border, backgroundColor: isSelected ? colors.blueTint : 'transparent' }]}
                    onPress={() => {
                      if (multiPasting || deleting) return;
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
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={[styles.meta, { color: colors.textMuted }]}>
                          {item.size ? formatSize(item.size) : ''}
                          {item.size && item.date ? ' · ' : ''}
                          {item.date ? formatDate(item.date) : ''}
                        </Text>
                        {favSet.has(item.uri) && (
                          <Ionicons name="heart" size={12} color="#E24B4A" />
                        )}
                      </View>
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
              : [styles.sheet, { backgroundColor: colors.card, transform: [{ translateY: sheetAnim }], paddingBottom: insets.bottom + 16, paddingLeft: insets.left + 16, paddingRight: insets.right + 16, maxHeight: SCREEN_HEIGHT * 0.75 }]
            }
            {...(SCREEN_WIDTH > SCREEN_HEIGHT ? {} : panResponder.panHandlers)}
          >
            {SCREEN_WIDTH > SCREEN_HEIGHT && (
              <TouchableOpacity onPress={closeSheet} style={{ alignSelf: 'flex-end', padding: 4 }}>
                <Ionicons name="close" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            )}
            {SCREEN_WIDTH <= SCREEN_HEIGHT && (
            <View style={[styles.sheetHandle, { backgroundColor: colors.textDisabled }]} />
          )}
          <ScrollView showsVerticalScrollIndicator={true} contentContainerStyle={{ paddingBottom: 8 }} keyboardShouldPersistTaps="handled">
            <Pressable>
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
              <View style={[styles.sheetDivider, { backgroundColor: colors.border }]} />
              {txtPreview && (selectedItem?.name.toLowerCase().endsWith('.txt') || selectedItem?.name.toLowerCase().endsWith('.pdf')) && (
                <View style={[styles.txtPreviewCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={[styles.txtPreviewText, { color: colors.textSecondary }]} numberOfLines={3}>
                    {txtPreview}
                  </Text>
                </View>
              )}
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
              {!isMediaCategory && selectedItem?.name.toLowerCase().endsWith('.pdf') && (
                <TouchableOpacity style={styles.sheetAction} onPress={handleExtractPdf}>
                  <Ionicons name="document-outline" size={20} color={colors.green} />
                  <Text style={[styles.sheetActionText, { color: colors.green }]}>Extract pages as images</Text>
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
              {isImageFile(selectedItem?.name ?? '') && (
                <TouchableOpacity style={styles.sheetAction} onPress={handleCopyImage}>
                  <Ionicons name="copy-outline" size={20} color={colors.textPrimary} />
                  <Text style={[styles.sheetActionText, { color: colors.textPrimary }]}>Copy image</Text>
                </TouchableOpacity>
              )}
              {isImageFile(selectedItem?.name ?? '') && (
              <TouchableOpacity style={styles.sheetAction} onPress={() => {
                  if (!selectedItem) return;
                  const u = selectedItem.uri, n = selectedItem.name;
                  closeSheet();
                  router.push({ pathname: '/image-editor', params: { uri: u, name: n } });
                }}>
                  <Ionicons name="create-outline" size={22} color={colors.textSecondary} />
                  <Text style={styles.sheetActionText}>Edit image</Text>
                </TouchableOpacity>
              )}
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
              <TouchableOpacity style={styles.sheetAction} onPress={() => {
                pendingItem.current = selectedItem;
                closeSheet();
                setTimeout(() => setShowTagPicker(true), 300);
              }}>
                <Ionicons name="pricetag-outline" size={20} color={colors.purple} />
                <Text style={[styles.sheetActionText, { color: colors.purple }]}>
                  {fileTags.length > 0 ? `Tags (${fileTags.length})` : 'Add Tag'}
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
                let exif: { label: string; value: string }[] = [];
                if (isMediaFile(selectedItem)) {
                  try {
                    const info = await getMediaInfo(toPath(selectedItem.uri));
                    if (info.width && info.height) lines.push({ label: 'Resolution', value: `${info.width}×${info.height}` });
                    if (info.duration) lines.push({ label: 'Duration', value: info.duration });
                    exif = exifLines(info);
                  } catch {}
                }
                try {
                  const stat = await RNFS.stat(toPath(selectedItem.uri));
                  if (stat.mtime) lines.push({ label: 'Modified', value: formatDate(new Date(stat.mtime).getTime()) });
                  if (stat.ctime && exif.length === 0) lines.push({ label: 'Created', value: formatDate(new Date(stat.ctime).getTime()) });
                } catch {}
                lines.push(...exif);
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
                    <TouchableOpacity style={[styles.renameConfirmBtn, renaming && { opacity: 0.6 }]} onPress={handleRename} disabled={renaming}>
                      {renaming
                        ? <ActivityIndicator size="small" color="#fff" />
                        : <Text style={styles.renameConfirmText}>Rename</Text>
                      }
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
            {pickerPathDisplay}
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
              data={pickerData}
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
                onPress={() => { setSortKey(key); setShowSortSheet(false); loadCategoryWithSort(key); }}
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
      <Modal visible={showHeaderMenu} transparent animationType="fade" onRequestClose={() => setShowHeaderMenu(false)}>
      <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-start', alignItems: 'flex-end' }} activeOpacity={1} onPress={() => setShowHeaderMenu(false)}>
        <SafeAreaView edges={['top', 'left', 'right']} style={{ alignItems: 'flex-end' }}>
          <View style={{ backgroundColor: colors.card, borderRadius: 14, paddingVertical: 8, marginTop: 8, marginRight: 8, minWidth: 180, elevation: 8 }}>
            {category === 'images' && !(folderView && selectedFolder === null) && (
              <TouchableOpacity
                style={styles.sheetAction}
                onPress={() => {
                  setShowHeaderMenu(false);
                  if (filteredItems.length === 0) return;
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  openSlideshow();
                }}
              >
                <Ionicons name="shuffle" size={20} color={colors.textPrimary} style={{ marginLeft: 16 }} />
                <Text style={[styles.sheetActionText, { color: colors.textPrimary }]}>Slideshow</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.sheetAction}
              onPress={async () => {
                setShowHeaderMenu(false);
                const next = !folderView;
                setFolderView(next);
                setSelectedFolder(null);
                if (next) { setLoading(true); await loadFolders(activeTab); setLoading(false); }
              }}
            >
              <Ionicons name={folderView ? 'folder' : 'folder-outline'} size={20} color={folderView ? colors.blue : colors.textPrimary} style={{ marginLeft: 16 }} />
              <Text style={[styles.sheetActionText, { color: folderView ? colors.blue : colors.textPrimary }]}>
                {folderView ? 'Exit folders' : 'View folders'}
              </Text>
            </TouchableOpacity>
            {!folderView && (
              <TouchableOpacity
                style={styles.sheetAction}
                onPress={() => { setShowHeaderMenu(false); setShowSortSheet(true); }}
              >
                <Ionicons name="swap-vertical-outline" size={20} color={colors.textPrimary} style={{ marginLeft: 16 }} />
                <Text style={[styles.sheetActionText, { color: colors.textPrimary }]}>Sort</Text>
              </TouchableOpacity>
            )}
          </View>
          </SafeAreaView>
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
            <TouchableOpacity style={styles.sheetAction} onPress={() => { setShowMoreSheet(false); setTimeout(() => setShowMultiRename(true), 150); }}>
              <Ionicons name="pencil-outline" size={20} color={colors.textPrimary} />
              <Text style={[styles.sheetActionText, { color: colors.textPrimary }]}>Multi-rename</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sheetAction} onPress={() => { setShowMoreSheet(false); handleMultiInfo(); }}>
              <Ionicons name="information-circle-outline" size={20} color={colors.textPrimary} />
              <Text style={[styles.sheetActionText, { color: colors.textPrimary }]}>Info</Text>
            </TouchableOpacity>
            {selectedHasImages && (
            <TouchableOpacity style={styles.sheetAction} onPress={() => { setShowMoreSheet(false); handleCreatePdf(); }}>
                <Ionicons name="document-outline" size={20} color={colors.blue} />
                <Text style={[styles.sheetActionText, { color: colors.blue }]}>Create PDF</Text>
              </TouchableOpacity>
            )}
            {selectedHasPdfs && (
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
                  nestedScrollEnabled={true}
                >
                  <Text style={{ fontSize: 14, color: colors.textPrimary, lineHeight: 22 }} selectable>{extractedText}</Text>
                </ScrollView>
                <TouchableOpacity
                  onPress={async () => {
                    await Clipboard.setString(extractedText ?? '');
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
            prevUri={viewerImages[viewerIndex - 1]?.uri ?? ''}
            nextUri={viewerImages[viewerIndex + 1]?.uri ?? ''}
            onTap={() => setViewerUri(null)}
            onSwipeNext={() => goToViewerImage(viewerIndex + 1)}
            onSwipePrevious={() => goToViewerImage(viewerIndex - 1)}
            style={StyleSheet.absoluteFill}
          />
          )}
          <SafeAreaView style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }} pointerEvents="box-none">
            <View style={{ alignItems: 'center', paddingBottom: 24 }}>
              <View style={{ flexDirection: 'row', gap: 0, backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 30, overflow: 'hidden' }}>
                <TouchableOpacity onPress={async () => { if (!viewerUri) return; try { await shareFiles([toPath(viewerUri)], 'image/*'); } catch {} }} style={{ paddingHorizontal: 20, paddingVertical: 12 }}>
                  <Ionicons name="share-outline" size={22} color="#222" />
                </TouchableOpacity>
                <View style={{ width: 0.5, backgroundColor: 'rgba(0,0,0,0.15)', marginVertical: 10 }} />
                <TouchableOpacity onPress={async () => { if (!viewerUri) return; try { await openFile(toPath(viewerUri), getMimeType(viewerUri.split('/').pop() ?? '')); } catch {} }} style={{ paddingHorizontal: 20, paddingVertical: 12 }}>
                  <Ionicons name="open-outline" size={22} color="#222" />
                </TouchableOpacity>
              </View>
            </View>
          </SafeAreaView>
        </View>
      </Modal>
      <VideoPlayerModal uri={playerUri} onClose={() => setPlayerUri(null)} speedPills />
        {/* File Details Modal */}
        <FileDetailsModal visible={showDetailsModal} name={detailsName} data={detailsData} onClose={() => setShowDetailsModal(false)} />
      {/* Multi-rename modal */}
      <Modal visible={showMultiRename} transparent animationType="fade" onRequestClose={() => { setShowMultiRename(false); setMultiRenameBase(''); }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={undefined}>
          <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: SCREEN_WIDTH > SCREEN_HEIGHT ? SCREEN_WIDTH * 0.2 : 24, paddingBottom: SCREEN_WIDTH > SCREEN_HEIGHT ? 0 : SCREEN_HEIGHT * 0.3 }}
            onPress={() => { setShowMultiRename(false); setMultiRenameBase(''); }}>
            <Pressable style={{ backgroundColor: colors.card, borderRadius: 16, padding: 20, width: '100%' }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <Text style={{ fontSize: 16, fontWeight: '600', color: colors.textPrimary }}>
                  Rename {selectedItemsMap.size} file{selectedItemsMap.size !== 1 ? 's' : ''}
                </Text>
                <TouchableOpacity onPress={() => { setShowMultiRename(false); setMultiRenameBase(''); }}>
                  <Ionicons name="close" size={20} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
              <Text style={{ fontSize: 13, color: colors.textMuted, marginBottom: 12 }}>
                Files will be named: {multiRenameBase.trim() || 'name'}_1, {multiRenameBase.trim() || 'name'}_2...
              </Text>
              <TextInput
                style={{ backgroundColor: colors.surface, borderRadius: 10, padding: 12, fontSize: 14, color: colors.textPrimary, marginBottom: 16 }}
                value={multiRenameBase}
                onChangeText={setMultiRenameBase}
                placeholder="Base name e.g. holiday"
                placeholderTextColor={colors.textMuted}
                autoFocus
                autoCapitalize="none"
                returnKeyType="next"
              />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity
                  style={{ flex: 1, padding: 12, borderRadius: 10, backgroundColor: colors.surface, alignItems: 'center' }}
                  onPress={() => { setShowMultiRename(false); setMultiRenameBase(''); }}
                >
                  <Text style={{ fontSize: 14, color: colors.textSecondary }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ flex: 1, padding: 12, borderRadius: 10, backgroundColor: multiRenameBase.trim() ? colors.blue : colors.textDisabled, alignItems: 'center' }}
                  onPress={() => {
                    if (!multiRenameBase.trim()) return;
                    setShowMultiRename(false);
                    setTimeout(() => setMultiRenamePickerVisible(true), 300);
                  }}
                  disabled={!multiRenameBase.trim()}
                >
                  <Text style={{ fontSize: 14, color: '#fff', fontWeight: '500' }}>Choose location</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
      {/* Tag picker modal */}
      <Modal visible={showTagPicker} transparent animationType="fade" onRequestClose={() => setShowTagPicker(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={SCREEN_WIDTH < SCREEN_HEIGHT ? (Platform.OS === 'android' ? 'height' : 'padding') : undefined}>
          <Pressable style={[styles.centeredOverlay, { paddingTop: SCREEN_WIDTH < SCREEN_HEIGHT ? '40%' : '10%' }]} onPress={() => setShowTagPicker(false)}>
            <Pressable style={[styles.passwordModal, { backgroundColor: colors.card }]}>
              <View style={styles.passwordModalHeader}>
                <Text style={[styles.passwordModalTitle, { color: colors.textPrimary }]}>Tags</Text>
                <TouchableOpacity onPress={() => setShowTagPicker(false)}>
                  <Ionicons name="close" size={20} color={colors.textMuted} />
                </TouchableOpacity>
              </View>

              {/* Existing tags as toggleable chips */}
              {tags.length > 0 && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                  {tags.map(tag => {
                    const applied = fileTags.includes(tag.id);
                    return (
                      <TouchableOpacity
                        key={tag.id}
                        onPress={async () => {
                          if (applied) {
                            await removeTagFromFile(pendingItem.current!.uri, tag.id);
                            setFileTags(prev => prev.filter(id => id !== tag.id));
                          } else {
                            await addTagToFile(pendingItem.current!.uri, pendingItem.current!.name, tag.id);
                            setFileTags(prev => [...prev, tag.id]);
                          }
                        }}
                        style={{
                          flexDirection: 'row', alignItems: 'center', gap: 6,
                          paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
                          backgroundColor: applied ? tag.color + '33' : colors.surface,
                          borderWidth: 1, borderColor: applied ? tag.color : colors.border,
                        }}
                      >
                        <Ionicons name={tag.icon as any} size={14} color={tag.color} />
                        <Text style={{ fontSize: 13, color: applied ? tag.color : colors.textSecondary, fontWeight: applied ? '600' : '400' }}>
                          {tag.name}
                        </Text>
                        {applied && <Ionicons name="checkmark" size={13} color={tag.color} />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {/* New tag form */}
              {!showNewTag ? (
                <TouchableOpacity
                  style={[styles.sheetAction, { paddingVertical: 10 }]}
                  onPress={() => setShowNewTag(true)}
                >
                  <Ionicons name="add-circle-outline" size={20} color={colors.purple} />
                  <Text style={[styles.sheetActionText, { color: colors.purple }]}>New Tag</Text>
                </TouchableOpacity>
              ) : (
                <View style={{ gap: 10, marginTop: 4 }}>
                  <TextInput
                    style={[styles.renameInput, { backgroundColor: colors.surface, color: colors.textPrimary }]}
                    placeholder="Tag name..."
                    placeholderTextColor={colors.textMuted}
                    value={newTagName}
                    onChangeText={setNewTagName}
                    autoFocus
                    maxLength={20}
                  />
                  {/* Color palette */}
                  <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
                    {[colors.blue, colors.purple, colors.green, colors.amber, colors.redBrown, colors.deleteRed, colors.yellow, colors.favRed].map(c => (
                      <TouchableOpacity
                        key={c}
                        onPress={() => setNewTagColor(c)}
                        style={{
                          width: 28, height: 28, borderRadius: 14,
                          backgroundColor: c,
                          borderWidth: newTagColor === c ? 3 : 0,
                          borderColor: colors.textPrimary,
                        }}
                      />
                    ))}
                  </View>
                  {/* Icon picker */}
                  <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
                    {['pricetag-outline', 'folder-outline', 'star-outline', 'briefcase-outline', 'home-outline', 'heart-outline', 'shield-outline', 'camera-outline'].map(ic => (
                      <TouchableOpacity
                        key={ic}
                        onPress={() => setNewTagIcon(ic)}
                        style={{
                          width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
                          backgroundColor: newTagIcon === ic ? newTagColor + '33' : colors.surface,
                          borderWidth: newTagIcon === ic ? 1.5 : 0,
                          borderColor: newTagColor,
                        }}
                      >
                        <Ionicons name={ic as any} size={18} color={newTagIcon === ic ? newTagColor : colors.textMuted} />
                      </TouchableOpacity>
                    ))}
                  </View>
                  <View style={[styles.renameActions, { marginTop: 4 }]}>
                    <TouchableOpacity
                      style={[styles.renameCancelBtn, { backgroundColor: colors.surface }]}
                      onPress={() => { setShowNewTag(false); setNewTagName(''); }}
                    >
                      <Text style={[styles.renameCancelText, { color: colors.textSecondary }]}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.renameConfirmBtn, !newTagName.trim() && { opacity: 0.4 }]}
                      disabled={!newTagName.trim()}
                      onPress={async () => {
                        const newTag = await addTag({ name: newTagName.trim(), color: newTagColor, icon: newTagIcon });
                        if (pendingItem.current) {
                          await addTagToFile(pendingItem.current!.uri, pendingItem.current!.name, newTag.id);
                          setFileTags(prev => [...prev, newTag.id]);
                        }
                        setShowNewTag(false);
                        setNewTagName('');
                        setNewTagColor('#3B6D11');
                        setNewTagIcon('pricetag-outline');
                      }}
                    >
                      <Text style={styles.renameConfirmText}>Create & Apply</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
      {/* Folder picker for multi-rename */}
      <FolderPickerModal
        visible={multiRenamePickerVisible}
        onClose={() => setMultiRenamePickerVisible(false)}
        onSave={(folderPath) => handleMultiRename(folderPath)}
        defaultPath="/storage/emulated/0/"
        defaultLabel="Internal Storage"
        defaultSubLabel="Root of internal storage"
        title="Save renamed files"
      />
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
  centeredOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-start', alignItems: 'center' },
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
  txtPreviewCard: { borderRadius: 8, borderWidth: 0.5, padding: 10, marginBottom: 8 },
  txtPreviewText: { fontSize: 12, lineHeight: 18, fontFamily: 'monospace' },
});
