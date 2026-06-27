import React, { useState, useEffect, useRef, useCallback } from 'react';
import { BackHandler } from 'react-native';
import { isVideoFile, VideoThumb } from '@/utils/videoThumb';
import { extractVideoFrames, labelImage } from '@/modules/scan-module';
import { StyleSheet, Text, View, TouchableOpacity, FlatList,
  ActivityIndicator, Image, Modal, TextInput, Alert,
  Animated, Pressable, KeyboardAvoidingView, Platform, ScrollView, useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getMimeType, isImageFile, formatSize, getFileColor, formatDate, getFileIcon, toPath, getFriendlyPath, decodeName } from '@/utils/files';
import { addRecent } from '@/hooks/useRecents';
import * as MediaLibrary from 'expo-media-library';
import * as IntentLauncher from 'expo-intent-launcher';
import { useVault } from '@/hooks/useVault';
import { usePro } from '@/hooks/usePro';
import { addFavourite, removeFavourite, isFavourite } from '@/hooks/useFavourites';
import RNFS from 'react-native-fs';
import { useTheme } from '@/hooks/useTheme';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import { shareFiles, openFile as openFileNative, printImage, printPdf } from '@/modules/share-module';
import { useTrash } from '@/hooks/useTrash';
import { DocIndexer } from '@/modules/doc-indexer';
import { startWifiServer, deleteDirectory, readDirectory, countFolder, copyFileStream, moveFileStream, addCopyProgressListener, zipFiles, unzipFile, zipFilesWithPassword, unzipFileWithPassword, statFiles, createDirectory, writeTextFile, getShowHidden, setShowHidden as setShowHiddenNative  } from 'file-reader';
import { scanFile } from '@/modules/share-module';
import QRCode from 'react-native-qrcode-svg';
import { getStorageVolumes, getPinnedFolders, setPinnedFolders, getPendingBrowsePath } from '@/modules/storage-stats';
import * as Haptics from 'expo-haptics';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { useBookmarks, addBookmark, removeBookmark, isBookmarkedSync } from '@/hooks/useBookmarks';
import { batchRename } from 'file-reader';
import FolderPickerModal from '@/components/FolderPickerModal';
import { getMediaInfo } from 'media-store';
import FileDetailsModal from '@/components/FileDetailsModal';
import { useBottomSheet } from '@/hooks/useBottomSheet';
import { createPdfFromImages, addPdfProgressListener, extractPdfPages, mergePdfs } from '@/modules/pdf-creator';
import { extractTextFromImage } from '@/modules/scan-module';
import * as Clipboard from 'expo-clipboard';

interface FileItem {
  name: string;
  uri: string;
  isDirectory: boolean;
  size: number;
  date: number;
}

const dirCacheStore: Record<string, FileItem[]> = {};
const folderCountsStore: Record<string, number> = {};
const ROOT_PATH = 'file:///storage/emulated/0/';

export default function BrowseScreen() {
  const { colors } = useTheme();
  const { moveToTrash } = useTrash();
  const { initialPath } = useLocalSearchParams<{ initialPath?: string }>();
  const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = useWindowDimensions();
  const [items, setItems] = useState<FileItem[]>([]);
  const startPath = initialPath ?? ROOT_PATH;
  const [currentPath, setCurrentPath] = useState(startPath);
  const [breadcrumbs, setBreadcrumbs] = useState<{ name: string; path: string }[]>(
    initialPath
      ? [{ name: 'Storage', path: ROOT_PATH }, { name: 'Music', path: initialPath }]
      : [{ name: 'Storage', path: ROOT_PATH }]
  );
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<FileItem | null>(null);
  const { addToVault } = useVault();
  const { isPro } = usePro();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchActive, setSearchActive] = useState(false);
  const searchRef = useRef<TextInput>(null);
  const [showSheet, setShowSheet] = useState(false);
  const [showRename, setShowRename] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [fileSize, setFileSize] = useState<string | null>(null);
  const [isFav, setIsFav] = useState(false);
  const [zipping, setZipping] = useState(false);
  const [showZipPassword, setShowZipPassword] = useState(false);
  const [zipPasswordValue, setZipPasswordValue] = useState('');
  const [showUnzipPassword, setShowUnzipPassword] = useState(false);
  const [unzipPasswordValue, setUnzipPasswordValue] = useState('');
  const [selectMode, setSelectMode] = useState(false);
  const [selectedUris, setSelectedUris] = useState<Set<string>>(new Set());
  const [selectedItemsMap, setSelectedItemsMap] = useState<Map<string, FileItem>>(new Map());
  const [showPicker, setShowPicker] = useState(false);
  const [pickerMode, setPickerMode] = useState<'copy' | 'move'>('copy');
  const [pickerPath, setPickerPath] = useState(ROOT_PATH);
  const [pickerItems, setPickerItems] = useState<FileItem[]>([]);
  const [pickerFiles, setPickerFiles] = useState<FileItem[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pasting, setPasting] = useState(false);
  const [copyProgress, setCopyProgress] = useState<number | null>(null);
  const [multiPasting, setMultiPasting] = useState(false);
  const [multiPasteMode, setMultiPasteMode] = useState<'copy' | 'move'>('copy');
  const [multiPasteProgress, setMultiPasteProgress] = useState<{ current: number; total: number; name: string } | null>(null);
  const [vaulting, setVaulting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletingFolder, setDeletingFolder] = useState(false);
  const [deletingCount, setDeletingCount] = useState(0);
  const sharingRef = useRef(false);
  const pendingItem = useRef<FileItem | null>(null);
  const pendingMultiItems = useRef<FileItem[]>([]);
  const dupeAction = useRef<'skip' | 'replace'>('skip');
  const { sheetAnim, panResponder, animateOpen, closeSheet } = useBottomSheet(() => {
    setShowSheet(false);
    setSelectedItem(null);
    setShowRename(false);
    setRenameValue('');
  });
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [openingUri, setOpeningUri] = useState<string | null>(null);
  const [movingUri, setMovingUri] = useState<string | null>(null);
  const [folderCounts, setFolderCounts] = useState<Record<string, number>>(folderCountsStore);
  const [qrModalVisible, setQrModalVisible] = useState(false);
  const [qrUrl, setQrUrl] = useState('');
  const [volumes, setVolumes] = useState<{ name: string; path: string; type: string }[]>([]);
  const [showCreateSheet, setShowCreateSheet] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [showNewTextFile, setShowNewTextFile] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [textFileContent, setTextFileContent] = useState('');
  const [creatingItem, setCreatingItem] = useState(false);
  type SortKey = 'name_asc' | 'name_desc' | 'size_desc' | 'size_asc' | 'date_desc' | 'date_asc';
  const [sortKey, setSortKey] = useState<SortKey>('name_asc');
  const [showSortSheet, setShowSortSheet] = useState(false);
  const [editingFile, setEditingFile] = useState<FileItem | null>(null);
  const [editorListening, setEditorListening] = useState(false);
  const [editorMicTooltip, setEditorMicTooltip] = useState(false);
  const [isBkmk, setIsBkmk] = useState(false);
  const { bookmarks } = useBookmarks();
  const [videoSummaryVisible, setVideoSummaryVisible] = useState(false);
  const [videoFrames, setVideoFrames] = useState<{ path: string; timestampMs: number }[]>([]);
  const [videoLabels, setVideoLabels] = useState<string[]>([]);
  const [loadingVideoSummary, setLoadingVideoSummary] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const showHiddenRef = useRef(false);
  const [showMoreSheet, setShowMoreSheet] = useState(false);
  const [showMultiRename, setShowMultiRename] = useState(false);
  const [multiRenameBase, setMultiRenameBase] = useState('');
  const [multiRenamePickerVisible, setMultiRenamePickerVisible] = useState(false);
  const [multiRenaming, setMultiRenaming] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [detailsData, setDetailsData] = useState<{ label: string; value: string }[]>([]);
  const [detailsName, setDetailsName] = useState('');
  const [creatingPdf, setCreatingPdf] = useState(false);
  const [pdfProgress, setPdfProgress] = useState<{ current: number; total: number } | null>(null);
  const [extractingPdf, setExtractingPdf] = useState(false);
  const [mergingPdf, setMergingPdf] = useState(false);
  const [extractingText, setExtractingText] = useState(false);
  const [extractedText, setExtractedText] = useState<string | null>(null);

  useEffect(() => {
    getStorageVolumes().then((volumes: any) => setVolumes(volumes));
  }, []);

  useFocusEffect(useCallback(() => {
    loadDirectory(currentPath);
  }, [currentPath]));

  useFocusEffect(useCallback(() => {
    const path = getPendingBrowsePath();
    console.log('pending path:', path);
    if (path) {
      const folderName = decodeURIComponent(path.replace(/\/$/, '').split('/').pop() ?? 'Folder');
      setCurrentPath(path);
      setBreadcrumbs([{ name: 'Storage', path: ROOT_PATH }, { name: folderName, path }]);
    }
  }, []));

  useEffect(() => {
    const hidden = getShowHidden();
    setShowHidden(hidden);
    showHiddenRef.current = hidden;
  }, []);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (breadcrumbs.length > 1) {
        navigateToBreadcrumb(breadcrumbs.length - 2);
        return true; // handled — go up one level
      }
      return false; // at root — let system handle, exits browse
    });
    return () => sub.remove();
  }, [breadcrumbs]);

  function toggleHidden() {
    const next = !showHidden;
    setShowHidden(next);
    showHiddenRef.current = next;
    setShowHiddenNative(next);
    Object.keys(dirCacheStore).forEach(k => delete dirCacheStore[k]);
    loadDirectory(currentPath, next);
  }

  async function openSheet(item: FileItem) {
    setSelectedItem(item);
    setFileSize(null);
    setShowRename(false);
    setRenameValue('');
    setShowSheet(true);
    setIsFav(await isFavourite(item.uri));
    setIsBkmk(item.isDirectory ? isBookmarkedSync(item.uri) : false);
    animateOpen();
    if (!item.isDirectory) {
      try {
        const file = new FileSystem.File(item.uri);
        setFileSize(formatSize(file.size ?? 0));
      } catch {
        setFileSize('Unknown');
      }
    }
  }

  async function loadDirectory(path: string, hiddenOverride?: boolean) {
    const hidden = hiddenOverride ?? showHiddenRef.current;
    if (dirCacheStore[path]) {
      setItems(dirCacheStore[path]);
      setLoading(false);
      readDirectory(toPath(path), hidden).then(fileItems => {
        dirCacheStore[path] = fileItems;
        setItems(fileItems);
        fileItems.filter(f => f.isDirectory).slice(0, 30).forEach(folder => {
          const folderPath = toPath(folder.uri);
          if (folderPath.includes('/Android/data')) return;
          countFolder(folderPath, hidden)
            .then(count => {
              setFolderCounts(prev => {
                const updated = { ...prev, [folder.uri]: count };
                Object.assign(folderCountsStore, updated);
                return updated;
              });
            })
            .catch(() => {});
        });
      }).catch(() => {});
      return;
    }
  
    setLoading(true);
    try {
      const fileItems = await readDirectory(toPath(path), hidden);
      dirCacheStore[path] = fileItems;
      setItems(fileItems);
  
      fileItems.filter(f => f.isDirectory).slice(0, 30).forEach(folder => {
        const folderPath = toPath(folder.uri);
        if (folderPath.includes('/Android/data')) return;
        countFolder(folderPath, hidden)
          .then(count => {
            setFolderCounts(prev => {
              const updated = { ...prev, [folder.uri]: count };
              Object.assign(folderCountsStore, updated);
              return updated;
            });
          })
          .catch(() => {});
      });
  
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  async function openFile(item: FileItem) {
    await addRecent({ name: item.name, uri: item.uri, openedAt: Date.now() });
    setOpeningUri(item.uri);
    const mime = getMimeType(item.name);
    try {
      const filePath = toPath(item.uri);
      await openFileNative(filePath, mime);
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
      } catch{} 
    } finally {
      setOpeningUri(null);
    }
  }

  function navigateTo(item: FileItem) {
    if (item.isDirectory) {
      setCurrentPath(item.uri);
      setBreadcrumbs(prev => [...prev, { name: item.name, path: item.uri }]);
      setSearchQuery('');
      setSearchActive(false);
    } else {
      openFile(item);
    }
  }

  function navigateToBreadcrumb(index: number) {
    const crumb = breadcrumbs[index];
    setBreadcrumbs(prev => prev.slice(0, index + 1));
    setCurrentPath(crumb.path);
    setSearchQuery('');
    setSearchActive(false);
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

  async function handleToggleFavourite() {
    if (!selectedItem || selectedItem.isDirectory) return;
    if (isFav) {
      await removeFavourite(selectedItem.uri);
      setIsFav(false);
      Alert.alert('Removed', `"${selectedItem.name}" removed from Favourites.`);
    } else {
      await addFavourite({ name: selectedItem.name, uri: selectedItem.uri });
      setIsFav(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      Alert.alert('Added', `"${selectedItem.name}" added to Favourites.`);
    }
  }

  async function handleToggleBookmark() {
    if (!selectedItem || !selectedItem.isDirectory) return;
    if (isBkmk) {
      await removeBookmark(selectedItem.uri);
      setIsBkmk(false);
    } else {
      await addBookmark({ name: selectedItem.name, path: selectedItem.uri });
      setIsBkmk(true);
    }
  }

  async function handlePrint() {
    if (!selectedItem || selectedItem.isDirectory) return;
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

  async function handleToggleHidden() {
    if (!selectedItem) return;
    const item = selectedItem;
    const isHidden = item.name.startsWith('.');
    const newName = isHidden ? item.name.slice(1) : '.' + item.name;
    const uri = item.uri.endsWith('/') ? item.uri.slice(0, -1) : item.uri;
    const parentPath = uri.substring(0, uri.lastIndexOf('/') + 1);
    const newUri = parentPath + newName;

    const doRename = async () => {
      closeSheet();
      try {
        const destExists = await RNFS.exists(toPath(newUri));
        if (destExists) {
          Alert.alert('Name already taken', `A file named "${newName}" already exists in this folder.`);
          return;
        }
        await RNFS.moveFile(toPath(item.uri), toPath(newUri));
        await scanFile(toPath(newUri)).catch(() => {});
        try {
          const sourceFilename = decodeURIComponent(item.uri.split('/').pop() ?? '');
          const allAssets = await MediaLibrary.getAssetsAsync({ first: 5000, mediaType: ['photo', 'video', 'unknown'] });
          const ghost = allAssets.assets.find((a: any) => a.filename === sourceFilename && toPath(a.uri) === toPath(item.uri));
          if (ghost) await MediaLibrary.deleteAssetsAsync([ghost]);
        } catch {}
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        delete dirCacheStore[currentPath];
        await loadDirectory(currentPath);
      } catch {
        Alert.alert('Error', `Could not ${isHidden ? 'unhide' : 'hide'} this file.`);
      }
    };

    if (isHidden) {
      doRename();
    } else {
      Alert.alert(
        item.isDirectory ? 'Hide folder' : 'Hide file',
        `"${item.name}" will be hidden from your gallery and ${item.isDirectory ? 'folder lists, along with everything inside it' : 'file lists'}. To find it again, turn on "Show hidden folders and files" in the sort menu, then choose Unhide.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Hide', onPress: doRename },
        ]
      );
    }
  }

  async function handleMoveToVault() {
    if (!selectedItem || selectedItem.isDirectory) return;
    Alert.alert(
      'Move to Vault',
      `Move "${selectedItem.name}" to your Secure Vault? The original file will be removed from its current location.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Move to Vault',
          onPress: async () => {
            const uri = selectedItem.uri;
            const name = selectedItem.name;
            closeSheet();
            setMovingUri(uri);
            const ok = await addToVault(uri, name);
            setMovingUri(null);
            if (ok) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              DocIndexer.removeFromIndex(uri);
              await loadDirectory(currentPath);
            } else {
              Alert.alert('Error', 'Could not move file to Vault. Try again.');
            }
          },
        },
      ]
    );
  }

  async function requestManagePermission() {
    try {
      await IntentLauncher.startActivityAsync('android.settings.MANAGE_APP_ALL_FILES_ACCESS_PERMISSION', { data: 'package:com.askfiles.mobile' });
    } catch {
      try {
        await IntentLauncher.startActivityAsync('android.settings.MANAGE_ALL_FILES_ACCESS_PERMISSION');
      } catch (e) {
      }
    }
  }

  async function handleDelete() {
    if (!selectedItem) return;
    if (selectedItem.isDirectory) {
      const count = await countFolder(toPath(selectedItem.uri));
      if (count > 0) {
        Alert.alert(
          'Folder not empty',
          `"${selectedItem.name}" contains ${count} item${count !== 1 ? 's' : ''}. Delete or move all files first, then delete the empty folder.`
        );
        return;
      }
      Alert.alert(
        'Delete Folder',
        `Delete "${selectedItem.name}"? This cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete', style: 'destructive',
            onPress: async () => {
              try {
                closeSheet();
                setDeleting(true);
                setDeletingFolder(true);
                await new Promise(resolve => setTimeout(resolve, 100));
                await deleteDirectory(toPath(selectedItem.uri));
                setDeleting(false);
                setDeletingFolder(false);
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                await loadDirectory(currentPath);
              } catch {
                Alert.alert('Permission needed', 'AskFiles needs full storage access to delete folders.', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Open Settings', onPress: requestManagePermission },
                ]);
                setDeleting(false);
                setDeletingFolder(false);
              }
            },
          },
        ]
      );
    } else {
      Alert.alert('Move to Trash', `"${selectedItem.name}" will be moved to Trash and deleted after 30 days.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Move to Trash', style: 'destructive', onPress: async () => {
          closeSheet();
          setDeleting(true);
          setDeletingCount(1);
          const ok = await moveToTrash(selectedItem.uri, selectedItem.name);
          if (ok) {
            await removeFavourite(selectedItem.uri);
            DocIndexer.removeFromIndex(selectedItem.uri);
            await loadDirectory(currentPath);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } else {
            Alert.alert('Error', 'Could not move file to Trash.');
          }
          setDeleting(false);
          setDeletingCount(0);
        }},
      ]);
    }
  }

  const pendingUnzipItem = useRef<FileItem | null>(null);

  async function handleUnzip(password?: string) {
    if (password === undefined) {
      if (!selectedItem) return;
      pendingUnzipItem.current = selectedItem;
      closeSheet();
      setUnzipPasswordValue('');
      setShowUnzipPassword(true);
      return;
    }
    const item = pendingUnzipItem.current;
    if (!item) return;
    setShowUnzipPassword(false);
    setZipping(true);
    try {
      const srcPath = toPath(item.uri);
      const destDir = srcPath.substring(0, srcPath.lastIndexOf('/') + 1) + item.name.replace(/\.zip$/i, '') + '/';
      if (password.length > 0) {
        await unzipFileWithPassword(srcPath, destDir, password);
      } else {
        await unzipFile(srcPath, destDir);
      }
      await loadDirectory(currentPath);
      Alert.alert('Extracted', `Files extracted to "${item.name.replace(/\.zip$/i, '')}" folder.`);
      pendingUnzipItem.current = null;
    } catch (e: any) {
      if (e?.message?.includes('WRONG_PASSWORD')) {
        setShowUnzipPassword(false);
        setTimeout(() => {
          Alert.alert('Incorrect Password', 'The password you entered is wrong. Please try again.', [
            { text: 'Try Again', onPress: () => setShowUnzipPassword(true) }
          ]);
        }, 300);
        return;
      }
      Alert.alert('Error', 'Could not extract zip file.');
    } finally {
      setZipping(false);
    }
  }

  async function handleMultiZip(password?: string) {
    if (selectedItemsMap.size === 0) return;
    const selectedFiles = Array.from(selectedItemsMap.values()).filter(f => !f.name.toLowerCase().endsWith('.zip') && !f.isDirectory);
    if (selectedFiles.length === 0) {
      Alert.alert('No files to zip', 'ZIP files and folders cannot be zipped.');
      return;
    }
    const srcPaths = selectedFiles.map(f => toPath(f.uri));
    if (password === undefined) {
      setZipPasswordValue('');
      setShowZipPassword(true);
      return;
    }
    setSelectMode(false);
    setSelectedUris(new Set());
    setSelectedItemsMap(new Map());
    setShowZipPassword(false);
    setZipping(true);
    try {
      const zipName = `AskFiles_${Date.now()}.zip`;
      const destPath = toPath(currentPath) + zipName;
      if (password.length > 0) {
        await zipFilesWithPassword(srcPaths, destPath, password);
      } else {
        await zipFiles(srcPaths, destPath);
      }
      await scanFile(destPath).catch(() => {});
      await loadDirectory(currentPath);
      Alert.alert('Zipped', `"${zipName}" created with ${selectedFiles.length} file${selectedFiles.length !== 1 ? 's' : ''}.${password.length > 0 ? ' Password protected.' : ''}`);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      Alert.alert('Error', 'Could not create zip file.');
    } finally {
      setZipping(false);
    }
  }

  async function handleMultiShare() {
    if (sharingRef.current) return;
    sharingRef.current = true;
    setSharing(true);
    const files = Array.from(selectedItemsMap.values()).filter(f => !f.isDirectory);
    try {
      const paths: string[] = [];
      for (const file of files) {
        paths.push(toPath(file.uri));
      }
      const mimeType = files.length === 1 ? getMimeType(files[0].name) : '*/*';
      await shareFiles(paths, mimeType);
    } catch {}
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
    const files = Array.from(selectedItemsMap.values()).filter(f => !f.isDirectory);
    Alert.alert('Move to Vault', `Move ${files.length} file${files.length !== 1 ? 's' : ''} to your Secure Vault?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Move', onPress: async () => {
        setVaulting(true);
        for (const file of files) { await addToVault(file.uri, file.name); }
        files.forEach(f => DocIndexer.removeFromIndex(f.uri));
        setVaulting(false);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setSelectMode(false); setSelectedUris(new Set()); setSelectedItemsMap(new Map());
        await loadDirectory(currentPath);
      }},
    ]);
  }
  
  async function handleMultiDelete() {
    const files = Array.from(selectedItemsMap.values());
    const fileCount = files.filter(f => !f.isDirectory).length;
    const folderCount = files.filter(f => f.isDirectory).length;
    Alert.alert('Move to Trash', `Move ${fileCount > 0 ? `${fileCount} file${fileCount !== 1 ? 's' : ''}` : ''}${fileCount > 0 && folderCount > 0 ? ' and ' : ''}${folderCount > 0 ? `${folderCount} folder${folderCount !== 1 ? 's' : ''} (permanently)` : ''} to Trash? Files deleted after 30 days.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Move to Trash', style: 'destructive', onPress: async () => {
        setDeleting(true);
        setDeletingCount(files.filter(f => !f.isDirectory).length);
        const fileItems = files.filter(f => !f.isDirectory);
        
        for (const file of fileItems) {
          await moveToTrash(file.uri, file.name, false);
          removeFavourite(file.uri);
          DocIndexer.removeFromIndex(file.uri);
        }
        setDeleting(false);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setDeletingCount(0);
        setSelectMode(false); setSelectedUris(new Set()); setSelectedItemsMap(new Map());
        await loadDirectory(currentPath);
      }},
    ]);
  }
  
  async function handleMultiInfo() {
    const files = Array.from(selectedItemsMap.values());
    const fileItems = files.filter(f => !f.isDirectory);
    const paths = fileItems.map(f => toPath(f.uri));
    const sizes = await statFiles(paths);
    const totalSize = sizes.reduce((sum, s) => sum + s, 0);
    Alert.alert(`${files.length} item${files.length !== 1 ? 's' : ''} selected`, `Total size: ${formatSize(totalSize)}`);
  }

  async function handleMultiRename(folderPath: string) {
    const files = Array.from(selectedItemsMap.values()).filter(f => !f.isDirectory);
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
  
      if (succeeded > 0) {
        await scanFile(folderPath).catch(() => {});
        loadDirectory(currentPath);
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

  async function handleCreateFolder() {
    const name = newItemName.trim();
    if (!name) return;
    const invalidChars = /[*\\:?"<>|]/;
    if (invalidChars.test(name)) {
      Alert.alert('Invalid name', 'Folder names cannot contain: * \\ : ? " < > |');
      return;
    }
    const path = toPath(currentPath) + name;
    setCreatingItem(true);
    try {
      await createDirectory(path);
      setShowNewFolder(false);
      setNewItemName('');
      delete dirCacheStore[currentPath];
      await loadDirectory(currentPath);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      if (e?.message?.includes('EXISTS')) {
        Alert.alert('Already exists', `A folder named "${name}" already exists here.`);
      } else {
        Alert.alert('Error', 'Could not create folder. Check storage permissions.');
      }
    } finally {
      setCreatingItem(false);
    }
  }
  
  async function handleCreateTextFile() {
    let name = newItemName.trim();
    if (!name) return;
    const invalidChars = /[*\/\\:?"<>|]/;
    if (invalidChars.test(name)) {
      Alert.alert('Invalid name', 'File names cannot contain: * / \\ : ? " < > |');
      return;
    }
    if (!name.toLowerCase().endsWith('.txt')) name = name + '.txt';
    setCreatingItem(true);
    try {
      if (editingFile) {
        // Save in place — overwrite existing file
        const path = toPath(editingFile.uri);
        await writeTextFile(path, textFileContent);
        await scanFile(path).catch(() => {});
        setShowNewTextFile(false);
        setNewItemName('');
        setTextFileContent('');
        setEditingFile(null);
        delete dirCacheStore[currentPath];
        await loadDirectory(currentPath);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        // Create new file
        const path = toPath(currentPath) + name;
        const exists = await RNFS.exists(path);
        if (exists) {
          Alert.alert('Already exists', `A file named "${name}" already exists here.`);
          setCreatingItem(false);
          return;
        }
        await writeTextFile(path, textFileContent);
        setShowNewTextFile(false);
        setNewItemName('');
        setTextFileContent('');
        delete dirCacheStore[currentPath];
        await loadDirectory(currentPath);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch {
      Alert.alert('Error', editingFile ? 'Could not save file.' : 'Could not create file.');
    } finally {
      setCreatingItem(false);
    }
  }

  async function handleOpenTextEdit(item: FileItem) {
    closeSheet();
    try {
      const path = toPath(item.uri);
      const content = await RNFS.readFile(path, 'utf8');
      setTextFileContent(content);
      setNewItemName(item.name.replace(/\.txt$/i, ''));
      setEditingFile(item);
      setShowNewTextFile(true);
    } catch {
      Alert.alert('Error', 'Could not open file for editing.');
    } finally {
    }
  }

  useSpeechRecognitionEvent('result', (e) => {
    if (!editorListening) return;
    const text = e.results?.[0]?.transcript ?? '';
    if (text) setTextFileContent(prev => prev ? prev + ' ' + text : text);
  });
  
  useSpeechRecognitionEvent('end', () => {
    if (editorListening) { setEditorListening(false); }
  });
  
  useSpeechRecognitionEvent('error', () => {
    if (editorListening) { setEditorListening(false); }
  });
  
  async function toggleEditorListening() {
    if (editorListening) {
      ExpoSpeechRecognitionModule.stop();
      setEditorListening(false);
      return;
    }
    const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!granted) {
      setEditorMicTooltip(true);
      setTimeout(() => setEditorMicTooltip(false), 2500);
      return;
    }
    setEditorListening(true);
    ExpoSpeechRecognitionModule.start({ lang: 'en-US', interimResults: false });
  }

  async function loadPickerDir(path: string) {
    setPickerLoading(true);
    try {
      const dir = new FileSystem.Directory(path);
      const contents = dir.list();
      const folders: FileItem[] = contents
        .filter(item => item instanceof FileSystem.Directory)
        .map(item => {
          const raw = item.uri.split('/').filter(Boolean).pop() ?? '';
          return { name: decodeName(raw), uri: item.uri, isDirectory: true, size: 0, date: 0 };
        })
        .filter(f => !f.name.startsWith('.'))
        .sort((a, b) => a.name.localeCompare(b.name));
      const files: FileItem[] = contents
        .filter(item => item instanceof FileSystem.File)
        .map(item => ({ name: decodeName(item.name), uri: item.uri, isDirectory: false, size: 0, date: 0 }))
        .filter(f => !f.name.startsWith('.'))
        .sort((a, b) => a.name.localeCompare(b.name));
      setPickerItems(folders);
      setPickerFiles(files);
    } catch (e) {}
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
        const destFolder = pickerPath.endsWith('/') ? pickerPath : pickerPath + '/';
        const isInternalRoot = destFolder === ROOT_PATH;
        const sdVolume = volumes.find(v => v.type === 'sdcard' && destFolder.includes(v.path));
        const isSdRoot = sdVolume && destFolder === `file://${sdVolume.path}/`;
        const destName = (() => { try { return decodeURIComponent(destFolder.replace(/\/$/, '').split('/').pop() ?? 'Folder'); } catch { return destFolder.replace(/\/$/, '').split('/').pop() ?? 'Folder'; } })();

        setCurrentPath(destFolder);
        if (isInternalRoot) {
          setBreadcrumbs([{ name: 'Storage', path: ROOT_PATH }]);
        } else if (isSdRoot) {
          setBreadcrumbs([{ name: sdVolume.name, path: destFolder }]);
        } else if (sdVolume) {
          const sdRootPath = `file://${sdVolume.path}/`;
          setBreadcrumbs([{ name: sdVolume.name, path: sdRootPath }, { name: destName, path: destFolder }]);
        } else {
          setBreadcrumbs([{ name: 'Storage', path: ROOT_PATH }, { name: destName, path: destFolder }]);
        }
        await loadDirectory(destFolder);
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
        if (!selectedItem.isDirectory) {
          const sourceFilename = decodeURIComponent(selectedItem.uri.split('/').pop() ?? '');
          const allAssets = await MediaLibrary.getAssetsAsync({ first: 500, mediaType: ['photo', 'video'] });
          const ghost = allAssets.assets.find((a: any) => a.filename === sourceFilename);
          if (ghost) await MediaLibrary.deleteAssetsAsync([ghost]);
        }
      } catch (e) {}
      closeSheet();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await loadDirectory(currentPath);
    } catch (e: any) {
      Alert.alert(
        'Rename failed',
        'Could not rename this file. Make sure "All files access" is enabled in Settings.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: requestManagePermission },
        ]
      );
    } finally {
      setRenaming(false);
    }
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

    const duplicates: string[] = [];
    for (const file of files) {
      const dst = toPath(destDir + file.name);
      if (await RNFS.exists(dst)) duplicates.push(file.name);
    }

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

        const exists = await RNFS.exists(dst);
        if (exists && dupeAction.current === 'skip') continue;

        setMultiPasteProgress({ current: copiedCount + 1, total: actualTotal, name: file.name });

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
        const destFolder = pickerPath.endsWith('/') ? pickerPath : pickerPath + '/';
        const isInternalRoot = destFolder === ROOT_PATH;
        const sdVolume = volumes.find(v => v.type === 'sdcard' && destFolder.includes(v.path));
        const isSdRoot = sdVolume && destFolder === `file://${sdVolume.path}/`;
        const destName = (() => { try { return decodeURIComponent(destFolder.replace(/\/$/, '').split('/').pop() ?? 'Folder'); } catch { return destFolder.replace(/\/$/, '').split('/').pop() ?? 'Folder'; } })();
      
        setCurrentPath(destFolder);
        if (isInternalRoot) {
          setBreadcrumbs([{ name: 'Storage', path: ROOT_PATH }]);
        } else if (isSdRoot) {
          setBreadcrumbs([{ name: sdVolume.name, path: destFolder }]);
        } else if (sdVolume) {
          const sdRootPath = `file://${sdVolume.path}/`;
          setBreadcrumbs([{ name: sdVolume.name, path: sdRootPath }, { name: destName, path: destFolder }]);
        } else {
          setBreadcrumbs([{ name: 'Storage', path: ROOT_PATH }, { name: destName, path: destFolder }]);
        }
        await loadDirectory(destFolder);
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

  function renderItem({ item }: { item: FileItem }) {
    if (item.isDirectory && folderCounts[item.uri] === undefined) {
      const folderPath = toPath(item.uri);
      if (!folderPath.includes('/Android/data')) {
        countFolder(folderPath)
          .then(count => {
            setFolderCounts(prev => {
              const updated = { ...prev, [item.uri]: count };
              Object.assign(folderCountsStore, updated);
              return updated;
            });
          })
          .catch(() => {});
      }
    }
    const color = item.isDirectory ? colors.yellow : getFileColor(item.name);
    const ext = item.isDirectory ? null : (item.name.split('.').pop()?.toUpperCase() ?? '?');
    const isSelected = selectedUris.has(item.uri);
    return (
      <TouchableOpacity
        style={[styles.row, { borderBottomColor: colors.border, backgroundColor: isSelected ? colors.blueTint : 'transparent' }]}
        onPress={() => {
          if (selectMode && item.isDirectory) {
            navigateTo(item);
          } else if (selectMode) {
            const newSet = new Set(selectedUris);
            const newMap = new Map(selectedItemsMap);
            if (isSelected) { newSet.delete(item.uri); newMap.delete(item.uri); }
            else { newSet.add(item.uri); newMap.set(item.uri, item); }
            setSelectedUris(newSet);
            setSelectedItemsMap(newMap);
          } else {
            navigateTo(item);
          }
        }}
        onLongPress={() => {Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); openSheet(item)}}
        delayLongPress={400}
        activeOpacity={0.6}
      >
        {selectMode && !item.isDirectory && (
          <View style={{ marginRight: 12 }}>
            <Ionicons name={isSelected ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={isSelected ? colors.blue : colors.textMuted} />
          </View>
        )}
        <View style={[styles.fileIcon, { backgroundColor: color + '22' }]}>
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
          <Text style={[styles.fileMeta, { color: colors.textMuted }]}>
            {item.isDirectory
              ? folderCounts[item.uri] === undefined ? 'Folder'
                : folderCounts[item.uri] === -1 ? 'Folder'
                : folderCounts[item.uri] === 0 ? 'Empty'
                : `${folderCounts[item.uri]} item${folderCounts[item.uri] !== 1 ? 's' : ''}`
              : `${formatSize(item.size)} · ${formatDate(item.date)}`}
          </Text>
        </View>
        {!selectMode && (
          item.isDirectory ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <TouchableOpacity
                onPress={() => {
                  if (isBookmarkedSync(item.uri)) removeBookmark(item.uri);
                  else addBookmark({ name: item.name, path: item.uri });
                }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={{ padding: 2 }}
              >
                <Ionicons
                  name={isBookmarkedSync(item.uri) ? 'bookmark' : 'bookmark-outline'}
                  size={15}
                  color={isBookmarkedSync(item.uri) ? colors.blue : colors.textDisabled}
                />
              </TouchableOpacity>
              <Ionicons name="chevron-forward" size={16} color={colors.textDisabled} />
            </View>
          ) : movingUri === item.uri ? (
            <ActivityIndicator size="small" color={colors.blue} style={styles.dotsBtn} />
          ) : openingUri === item.uri ? (
            <ActivityIndicator size="small" color={colors.blue} style={styles.dotsBtn} />
          ) : (
            <TouchableOpacity style={styles.dotsBtn} onPress={() => openSheet(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="ellipsis-vertical" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          )
        )}
      </TouchableOpacity>
    );
  }

  const sortedItems = items.slice().sort((a, b) => {
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

  const displayItems = searchActive && searchQuery.length > 0
    ? sortedItems.filter(item => item.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : sortedItems;

  return (
    <SafeAreaView edges={['left', 'right']} style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.background }]}>
        <View style={styles.headerRow}>
        {breadcrumbs.length > 1 ? (
            <TouchableOpacity onPress={() => navigateToBreadcrumb(breadcrumbs.length - 2)} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
          ) : currentPath !== ROOT_PATH ? (
            <TouchableOpacity onPress={() => {
              setCurrentPath(ROOT_PATH);
              setBreadcrumbs([{ name: 'Storage', path: ROOT_PATH }]);
            }} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={() => router.push('/(tabs)')} style={styles.backBtn}>
              <Ionicons name="home-outline" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
          )}
          <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
            {breadcrumbs[breadcrumbs.length - 1]?.name ?? 'Browse'}
          </Text>
          <View style={{ flexDirection: 'row' }}>
          <TouchableOpacity
              style={[styles.backBtn, { flexDirection: 'row', alignItems: 'center', width: 'auto', paddingHorizontal: 8 }]}
              onPress={() => { 
                if (selectMode) {
                  setSelectMode(false);
                  setSelectedUris(new Set());
                  setSelectedItemsMap(new Map());
                } else {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  setSelectMode(true);
                  setSelectedUris(new Set());
                  setSelectedItemsMap(new Map());
                }
              }}
            >
              <Ionicons name={selectMode ? 'close-circle' : 'checkmark-circle-outline'} size={22} color={selectMode ? colors.blue : colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => { setSearchActive(true); setTimeout(() => searchRef.current?.focus(), 100); }}
            >
              <Ionicons name="search-outline" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => setShowSortSheet(true)}
            >
              <Ionicons name="swap-vertical-outline" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>
        {searchActive && (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, backgroundColor: colors.surface, borderRadius: 10, paddingHorizontal: 12 }}>
            <Ionicons name="search-outline" size={16} color={colors.textMuted} style={{ marginRight: 8 }} />
            <TextInput
              ref={searchRef}
              style={{ flex: 1, fontSize: 14, color: colors.textPrimary, paddingVertical: 10 }}
              placeholder="Search in this folder..."
              placeholderTextColor={colors.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              returnKeyType="search"
            />
            <TouchableOpacity onPress={() => { setSearchActive(false); setSearchQuery(''); }}>
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        )}
        {selectMode && (
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: 8, gap: 8 }}>
            <TouchableOpacity onPress={() => { setSelectMode(false); setSelectedUris(new Set()); setSelectedItemsMap(new Map()); }} style={{ paddingVertical: 6, paddingHorizontal: 12, backgroundColor: colors.surface, borderRadius: 8 }}>
              <Text style={{ fontSize: 13, color: colors.textSecondary }}>Cancel</Text>
            </TouchableOpacity>
            <Text style={{ flex: 1, fontSize: 13, color: colors.textMuted }}>{selectedUris.size} file{selectedUris.size !== 1 ? 's' : ''} selected</Text>
            <TouchableOpacity
              onPress={() => {
                const allFiles = items.filter(f => !f.isDirectory);
                const newSet = new Set(allFiles.map(f => f.uri));
                const newMap = new Map(allFiles.map(f => [f.uri, f]));
                setSelectedUris(newSet);
                setSelectedItemsMap(newMap);
              }}
              style={{ paddingVertical: 6, paddingHorizontal: 12, backgroundColor: colors.surface, borderRadius: 8 }}
            >
              <Text style={{ fontSize: 13, color: colors.blue }}>Select All</Text>
            </TouchableOpacity>
          </View>
        )}
        <View style={styles.pathRow}>
          {breadcrumbs.map((crumb, index) => (
            <TouchableOpacity
              key={index}
              onPress={() => index < breadcrumbs.length - 1 ? navigateToBreadcrumb(index) : undefined}
              activeOpacity={index < breadcrumbs.length - 1 ? 0.6 : 1}
              disabled={index === breadcrumbs.length - 1}
            >
              <Text style={[
                styles.pathSegment,
                { color: colors.textMuted },
                index === breadcrumbs.length - 1 && styles.pathSegmentActive,
              ]}>
                {index > 0 ? '/' : ''}{crumb.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {volumes.length > 1 && (currentPath === ROOT_PATH || volumes.some(v => currentPath === `file://${v.path}/`)) && (
          <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 8, gap: 8 }}>
            {volumes.map(vol => (
              <TouchableOpacity
                key={vol.path}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                  paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
                  backgroundColor: currentPath.includes(vol.path) ? colors.blue : colors.surface
                }}
                onPress={() => {
                  const newPath = `file://${vol.path}/`;
                  setCurrentPath(newPath);
                  setBreadcrumbs([{ name: vol.name, path: newPath }]);
                }}
              >
                <Ionicons
                  name={vol.type === 'sdcard' ? 'card-outline' : 'phone-portrait-outline'}
                  size={14}
                  color={currentPath.includes(vol.path) ? '#fff' : colors.textSecondary}
                />
                <Text style={{ fontSize: 12, fontWeight: '500', color: currentPath.includes(vol.path) ? '#fff' : colors.textSecondary }}>
                  {vol.name}
                </Text>
                </TouchableOpacity>
            ))}
          </View>
        )}
        {bookmarks.length > 0 && (currentPath === ROOT_PATH || volumes.some(v => currentPath === `file://${v.path}/`)) && (
          <View style={{ paddingBottom: 8 }}>
            <Text style={{ fontSize: 11, fontWeight: '500', letterSpacing: 0.5, paddingHorizontal: 16, paddingBottom: 6, textTransform: 'uppercase', color: colors.textMuted }}>Bookmarks</Text>
            <FlatList
              horizontal
              data={bookmarks}
              keyExtractor={b => b.path}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
              renderItem={({ item: bm }) => (
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: colors.surface }}
                  onPress={async () => {
                    const folderPath = toPath(bm.path);
                    const exists = await RNFS.exists(folderPath);
                    if (exists) {
                      setCurrentPath(bm.path);
                      setBreadcrumbs([{ name: 'Storage', path: ROOT_PATH }, { name: bm.name, path: bm.path }]);
                      setSearchQuery('');
                      setSearchActive(false);
                    } else {
                      Alert.alert(
                        'Folder not found',
                        `"${bm.name}" couldn't be found. It may have been moved or deleted.`,
                        [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Remove bookmark', style: 'destructive', onPress: () => removeBookmark(bm.path) },
                        ]
                      );
                    }
                  }}
                >
                  <Ionicons name="bookmark" size={13} color={colors.blue} />
                  <Text style={{ fontSize: 12, fontWeight: '500', color: colors.textSecondary }} numberOfLines={1}>{bm.name}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        )}
      </View>

      {zipping && (
        <View style={[styles.busyBanner, { backgroundColor: colors.busyBg }]}>
          <ActivityIndicator size="small" color={colors.blue} />
          <Text style={[styles.busyText, { color: colors.blue }]}>Processing...</Text>
        </View>
      )}

        {pasting && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: colors.surface }}>
            <ActivityIndicator size="small" color={colors.blue} />
            <Text style={{ fontSize: 13, color: colors.textSecondary }}>
              {pickerMode === 'copy' ? 'Copying' : 'Moving'} {pendingItem.current?.name}
              {copyProgress !== null && copyProgress > 0 ? ` ${copyProgress}%` : '...'}
            </Text>
          </View>
        )}
      {vaulting && (
        <View style={[styles.busyBanner, { backgroundColor: colors.busyBg }]}>
          <ActivityIndicator size="small" color={colors.blue} />
          <Text style={[styles.busyText, { color: colors.blue }]}>Moving to Vault...</Text>
        </View>
      )}
      {deleting && (
          <View style={[styles.busyBanner, { backgroundColor: colors.surface }]}>
            <ActivityIndicator size="small" color={colors.deleteRed} />
            <Text style={[styles.busyText, { color: colors.textSecondary }]}>
              {deletingFolder
                ? 'Deleting folder...'
                : `Moving ${deletingCount} file${deletingCount !== 1 ? 's' : ''} to Trash...`}
            </Text>
          </View>
        )}
        {multiRenaming && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: colors.surface }}>
          <ActivityIndicator size="small" color={colors.blue} />
          <Text style={{ fontSize: 13, color: colors.textSecondary }}>Renaming files...</Text>
        </View>
      )}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.blue} />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.centered}>
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>This folder is empty</Text>
        </View>
      ) : (
        <FlatList
          data={displayItems}
          keyExtractor={item => item.uri}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        />
      )}

      <Modal visible={showSheet} transparent animationType="none" onRequestClose={closeSheet}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={SCREEN_WIDTH < SCREEN_HEIGHT ? 'height' : undefined}>
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
                <View style={[styles.sheetIcon, { backgroundColor: (selectedItem?.isDirectory ? colors.yellow : getFileColor(selectedItem?.name ?? '')) + '22' }]}>
                    {selectedItem?.isDirectory ? (
                      <Ionicons name="folder" size={22} color={colors.yellow} />
                    ) : isImageFile(selectedItem?.name ?? '') ? (
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
                    {selectedItem?.isDirectory && <Text style={[styles.sheetFileMeta, { color: colors.textMuted }]}>Folder</Text>}
                  </View>
                </View>

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
                    {!selectedItem?.isDirectory && (
                      <TouchableOpacity style={styles.sheetAction} onPress={handleShare}>
                        <Ionicons name="share-outline" size={20} color={colors.textPrimary} />
                        <Text style={[styles.sheetActionText, { color: colors.textPrimary }]}>Share</Text>
                      </TouchableOpacity>
                    )}
                    {!selectedItem?.isDirectory && (
                      <TouchableOpacity style={styles.sheetAction} onPress={handleShareViaQr}>
                        <Ionicons name="qr-code-outline" size={20} color={colors.textPrimary} />
                        <Text style={[styles.sheetActionText, { color: colors.textPrimary }]}>Share via QR</Text>
                      </TouchableOpacity>
                    )}
                    {!selectedItem?.isDirectory && (isImageFile(selectedItem?.name ?? '') || (selectedItem?.name.toLowerCase().endsWith('.pdf'))) && (
                      <TouchableOpacity style={styles.sheetAction} onPress={handlePrint}>
                        <Ionicons name="print-outline" size={20} color={colors.textPrimary} />
                        <Text style={[styles.sheetActionText, { color: colors.textPrimary }]}>Print</Text>
                      </TouchableOpacity>
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
                    {!selectedItem?.isDirectory && selectedItem?.name.toLowerCase().endsWith('.pdf') && (
                      <TouchableOpacity style={styles.sheetAction} onPress={handleExtractPdf}>
                        <Ionicons name="document-outline" size={20} color={colors.green} />
                        <Text style={[styles.sheetActionText, { color: colors.green }]}>Extract pages as images</Text>
                      </TouchableOpacity>
                    )}
                    {!selectedItem?.isDirectory && (
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
                    )}
                    {!selectedItem?.isDirectory && !selectedItem?.name.toLowerCase().endsWith('.zip') && (
                      <TouchableOpacity style={styles.sheetAction} onPress={handleToggleFavourite}>
                        <Ionicons name={isFav ? 'heart' : 'heart-outline'} size={20} color={isFav ? colors.deleteRed : colors.textPrimary} />
                        <Text style={[styles.sheetActionText, { color: isFav ? colors.deleteRed : colors.textPrimary }]}>{isFav ? 'Remove from Favourites' : 'Add to Favourites'}</Text>
                      </TouchableOpacity>
                    )}
                    {selectedItem?.isDirectory && (
                      <TouchableOpacity style={styles.sheetAction} onPress={handleToggleBookmark}>
                        <Ionicons name={isBkmk ? 'bookmark' : 'bookmark-outline'} size={20} color={isBkmk ? colors.blue : colors.textPrimary} />
                        <Text style={[styles.sheetActionText, { color: isBkmk ? colors.blue : colors.textPrimary }]}>{isBkmk ? 'Remove bookmark' : 'Bookmark folder'}</Text>
                      </TouchableOpacity>
                    )}
                    {selectedItem?.isDirectory && (() => {
                    const path = toPath(selectedItem.uri).replace(/\/$/, '');
                    const isPinned = (() => {
                      try { return JSON.parse(getPinnedFolders()).some((f: any) => f.path === path); }
                      catch { return false; }
                    })();
                    return (
                      <TouchableOpacity
                        style={styles.sheetAction}
                        onPress={() => {
                          try {
                            const existing: { path: string; name: string }[] = JSON.parse(getPinnedFolders());
                            if (isPinned) {
                              const updated = existing.filter(f => f.path !== path);
                              setPinnedFolders(JSON.stringify(updated));
                              closeSheet();
                              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                            } else {
                              const updated = [...existing, { path, name: selectedItem.name }];
                              setPinnedFolders(JSON.stringify(updated));
                              closeSheet();
                              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                            }
                          } catch {
                            Alert.alert('Error', 'Could not update pinned folders.');
                          }
                        }}
                      >
                        <Ionicons name="pin" size={20} color={isPinned ? colors.blue : colors.textPrimary} />
                        <Text style={[styles.sheetActionText, { color: isPinned ? colors.blue : colors.textPrimary }]}>
                          {isPinned ? 'Unpin from Home' : 'Pin to Home'}
                        </Text>
                      </TouchableOpacity>
                    );
                  })()}
                    <TouchableOpacity
                      style={styles.sheetAction}
                      onPress={async () => {
                        if (!selectedItem) return;
                        closeSheet();
                        const lines: { label: string; value: string }[] = [];
                        if (fileSize) lines.push({ label: 'Size', value: fileSize });
                        lines.push({ label: 'Type', value: selectedItem.isDirectory ? 'Folder' : (selectedItem.name.split('.').pop()?.toUpperCase() ?? '?') + ' file' });
                        lines.push({ label: 'Location', value: getFriendlyPath(selectedItem.uri, volumes) });
                        try {
                          const stat = await RNFS.stat(toPath(selectedItem.uri));
                          if (stat.mtime) lines.push({ label: 'Modified', value: formatDate(new Date(stat.mtime).getTime()) });
                          if (stat.ctime) lines.push({ label: 'Created', value: formatDate(new Date(stat.ctime).getTime()) });
                        } catch {}
                        if (!selectedItem.isDirectory && (isImageFile(selectedItem.name) || isVideoFile(selectedItem.name))) {
                          try {
                            const info = await getMediaInfo(toPath(selectedItem.uri));
                            if (info.width && info.height) lines.push({ label: 'Resolution', value: `${info.width}×${info.height}` });
                            if (info.duration) lines.push({ label: 'Duration', value: info.duration });
                          } catch {}
                        }
                        setDetailsName(selectedItem.name);
                        setDetailsData(lines);
                        setShowDetailsModal(true);
                      }}
                    >
                      <Ionicons name="information-circle-outline" size={20} color={colors.textPrimary} />
                      <Text style={[styles.sheetActionText, { color: colors.textPrimary }]}>Info</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.sheetAction} onPress={handleDelete}>
                      <Ionicons name="trash-outline" size={20} color={colors.deleteRed} />
                      <Text style={[styles.sheetActionText, { color: colors.deleteRed }]}>Delete</Text>
                    </TouchableOpacity>
                    {!selectedItem?.isDirectory && selectedItem?.name.toLowerCase().endsWith('.zip') && (
                      <TouchableOpacity style={styles.sheetAction} onPress={() => handleUnzip()}>
                        <Ionicons name="archive-outline" size={20} color={colors.green} />
                        <Text style={[styles.sheetActionText, { color: colors.green }]}>Extract ZIP</Text>
                      </TouchableOpacity>
                    )}
                    <View style={[styles.sheetDivider, { backgroundColor: colors.border }]} />
                    {!selectedItem?.isDirectory && (
                      <TouchableOpacity style={styles.sheetAction} onPress={() => openPicker('copy')}>
                        <Ionicons name="copy-outline" size={20} color={colors.textPrimary} />
                        <Text style={[styles.sheetActionText, { color: colors.textPrimary }]}>Copy</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity style={styles.sheetAction} onPress={() => openPicker('move')}>
                      <Ionicons name="arrow-redo-outline" size={20} color={colors.textPrimary} />
                      <Text style={[styles.sheetActionText, { color: colors.textPrimary }]}>Move</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.sheetAction} onPress={() => { setRenameValue(selectedItem?.name ?? ''); setShowRename(true); }}>
                      <Ionicons name="pencil-outline" size={20} color={colors.textPrimary} />
                      <Text style={[styles.sheetActionText, { color: colors.textPrimary }]}>Rename</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.sheetAction} onPress={handleToggleHidden}>
                      <Ionicons name={selectedItem?.name.startsWith('.') ? 'eye-outline' : 'eye-off-outline'} size={20} color={colors.textPrimary} />
                      <Text style={[styles.sheetActionText, { color: colors.textPrimary }]}>
                        {selectedItem?.name.startsWith('.') ? 'Unhide' : 'Hide'}
                      </Text>
                    </TouchableOpacity>
                    {!selectedItem?.isDirectory && selectedItem?.name.toLowerCase().endsWith('.txt') && (
                      <TouchableOpacity style={styles.sheetAction} onPress={() => handleOpenTextEdit(selectedItem)}>
                        <Ionicons name="create-outline" size={20} color={colors.blue} />
                        <Text style={[styles.sheetActionText, { color: colors.blue }]}>Edit</Text>
                      </TouchableOpacity>
                    )}
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
            <View style={styles.headerRow}>
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
              <View style={styles.backBtn} />
            </View>
            <Text style={[styles.pathSegment, { color: colors.textMuted, paddingLeft: 52, paddingBottom: 4 }]}>
            {(() => {
                let display = pickerPath.replace('file:///storage/emulated/0/', 'Storage/');
                const sdVol = volumes.find(v => v.type === 'sdcard' && pickerPath.includes(v.path));
                if (sdVol) display = display.replace(`file://${sdVol.path}/`, `${sdVol.name}/`).replace(`file://${sdVol.path}`, sdVol.name);
                return display.split('/').filter(Boolean).map((seg: string) => { try { return decodeURIComponent(seg); } catch { return seg; } }).join('/');
              })()}
            </Text>
            {volumes.length > 1 && (pickerPath === ROOT_PATH || !pickerPath.includes('/storage/emulated/0/')) && (
              <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 8, gap: 8 }}>
                {volumes.map(vol => (
                  <TouchableOpacity
                    key={vol.path}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 6,
                      paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
                      backgroundColor: pickerPath.includes(vol.path) ? colors.blue : colors.surface
                    }}
                    onPress={() => {
                      const newPath = `file://${vol.path}/`;
                      setPickerPath(newPath);
                      loadPickerDir(newPath);
                    }}
                  >
                    <Ionicons
                      name={vol.type === 'sdcard' ? 'card-outline' : 'phone-portrait-outline'}
                      size={14}
                      color={pickerPath.includes(vol.path) ? '#fff' : colors.textSecondary}
                    />
                    <Text style={{ fontSize: 12, fontWeight: '500', color: pickerPath.includes(vol.path) ? '#fff' : colors.textSecondary }}>
                      {vol.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
          {pickerLoading ? (
            <View style={styles.centered}><ActivityIndicator color={colors.blue} /></View>
          ) : pickerItems.length === 0 && pickerFiles.length === 0 ? (
            <View style={styles.centered}><Text style={[styles.emptyText, { color: colors.textMuted }]}>This folder is empty</Text></View>
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
                  <View style={[styles.fileIcon, { backgroundColor: (item.isDirectory ? colors.yellow : getFileColor(item.name)) + '22' }]}>
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
                    <Text style={[styles.fileName, { color: colors.textPrimary}]} numberOfLines={1}>{item.name}</Text>
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
      {/* Zip password modal */}
      <Modal visible={showZipPassword} transparent animationType="fade" onRequestClose={() => setShowZipPassword(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={SCREEN_WIDTH < SCREEN_HEIGHT ? 'height' : undefined}>
        <Pressable style={[styles.centeredOverlay, { paddingTop: SCREEN_WIDTH < SCREEN_HEIGHT ? '50%' : '10%' }]} onPress={() => setShowZipPassword(false)}>
            <Pressable style={[styles.passwordModal, { backgroundColor: colors.card }]}>
              <View style={styles.passwordModalHeader}>
                <Text style={[styles.passwordModalTitle, { color: colors.textPrimary }]}>Protect with Password</Text>
                <TouchableOpacity onPress={() => setShowZipPassword(false)}>
                  <Ionicons name="close" size={20} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
              <Text style={[styles.passwordModalSub, { color: colors.textMuted }]}>Optional — leave blank for a standard zip</Text>
              <TextInput
                style={[styles.renameInput, { backgroundColor: colors.surface, color: colors.textPrimary, marginTop: 12 }]}
                value={zipPasswordValue}
                onChangeText={setZipPasswordValue}
                placeholder="Enter password..."
                placeholderTextColor={colors.textMuted}
                secureTextEntry
                autoFocus
                returnKeyType="done"
                onSubmitEditing={() => handleMultiZip(zipPasswordValue)}
              />
              <View style={[styles.renameActions, { marginTop: 12 }]}>
                <TouchableOpacity style={[styles.renameCancelBtn, { backgroundColor: colors.surface }]} onPress={() => setShowZipPassword(false)}>
                  <Text style={[styles.renameCancelText, { color: colors.textSecondary }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.renameConfirmBtn} onPress={() => handleMultiZip(zipPasswordValue)}>
                  <Text style={styles.renameConfirmText}>Create ZIP</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
          </KeyboardAvoidingView>
      </Modal>

      {/* Unzip password modal */}
      <Modal visible={showUnzipPassword} transparent animationType="fade" onRequestClose={() => { setShowUnzipPassword(false); pendingUnzipItem.current = null; }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={SCREEN_WIDTH < SCREEN_HEIGHT ? (Platform.OS === 'android' ? 'height' : 'padding') : undefined}>
        <Pressable style={[styles.centeredOverlay, { paddingTop: SCREEN_WIDTH < SCREEN_HEIGHT ? '50%' : '10%' }]} onPress={() => setShowUnzipPassword(false)}>
            <Pressable style={[styles.passwordModal, { backgroundColor: colors.card }]}>
              <View style={styles.passwordModalHeader}>
                <Text style={[styles.passwordModalTitle, { color: colors.textPrimary }]}>Extract ZIP</Text>
                <TouchableOpacity onPress={() => setShowUnzipPassword(false)}>
                  <Ionicons name="close" size={20} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
              <Text style={[styles.passwordModalSub, { color: colors.textMuted }]}>Leave blank if not password protected</Text>
              <TextInput
                style={[styles.renameInput, { backgroundColor: colors.surface, color: colors.textPrimary, marginTop: 12 }]}
                value={unzipPasswordValue}
                onChangeText={setUnzipPasswordValue}
                placeholder="Enter password..."
                placeholderTextColor={colors.textMuted}
                secureTextEntry
                autoFocus
                returnKeyType="done"
                onSubmitEditing={() => handleUnzip(unzipPasswordValue)}
              />
              <View style={[styles.renameActions, { marginTop: 12 }]}>
                <TouchableOpacity style={[styles.renameCancelBtn, { backgroundColor: colors.surface }]} onPress={() => { setShowUnzipPassword(false); pendingUnzipItem.current = null; }}>
                  <Text style={[styles.renameCancelText, { color: colors.textSecondary }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.renameConfirmBtn} onPress={() => handleUnzip(unzipPasswordValue)}>
                  <Text style={styles.renameConfirmText}>Extract</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
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
          <Text style={{ fontSize: 13, color: colors.textSecondary }}>Creating PDF... {pdfProgress.current} of {pdfProgress.total}</Text>
        </View>
      )}
      {extractingPdf && pdfProgress && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: colors.surface }}>
          <ActivityIndicator size="small" color={colors.blue} />
          <Text style={{ fontSize: 13, color: colors.textSecondary }}>Extracting page {pdfProgress.current} of {pdfProgress.total}...</Text>
        </View>
      )}
      {mergingPdf && pdfProgress && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: colors.surface }}>
          <ActivityIndicator size="small" color={colors.blue} />
          <Text style={{ fontSize: 13, color: colors.textSecondary }}>Merging PDF {pdfProgress.current} of {pdfProgress.total}...</Text>
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
            disabled={sharing || zipping || deleting || vaulting || multiPasting}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderRadius: 12, paddingVertical: 12 }}
          >
            <Ionicons name="copy-outline" size={20} color={colors.textPrimary} />
            <Text style={{ fontSize: 11, color: colors.textPrimary, marginTop: 2 }}>Copy</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleMultiMove}
            disabled={sharing || zipping || deleting || vaulting || multiPasting}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderRadius: 12, paddingVertical: 12 }}
          >
            <Ionicons name="arrow-redo-outline" size={20} color={colors.textPrimary} />
            <Text style={{ fontSize: 11, color: colors.textPrimary, marginTop: 2 }}>Move</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleMultiShare}
            disabled={sharing || zipping || deleting || vaulting || multiPasting}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: sharing ? colors.surface : colors.blue, borderRadius: 12, paddingVertical: 12 }}
          >
            <Ionicons name="share-outline" size={20} color={sharing ? colors.textMuted : '#fff'} />
            <Text style={{ fontSize: 11, color: sharing ? colors.textMuted : '#fff', marginTop: 2 }}>Share</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleMultiVault}
            disabled={sharing || zipping || deleting || vaulting || multiPasting}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderRadius: 12, paddingVertical: 12 }}
          >
            <Ionicons name="shield-checkmark-outline" size={20} color={isPro ? colors.blue : colors.textMuted} />
            <Text style={{ fontSize: 11, color: isPro ? colors.blue : colors.textMuted, marginTop: 2 }}>Vault</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => handleMultiZip()}
            disabled={sharing || zipping || deleting || vaulting || multiPasting}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderRadius: 12, paddingVertical: 12 }}
          >
            <Ionicons name="archive-outline" size={20} color={colors.textPrimary} />
            <Text style={{ fontSize: 11, color: colors.textPrimary, marginTop: 2 }}>Zip</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleMultiDelete}
            disabled={sharing || zipping || deleting || vaulting || multiPasting}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderRadius: 12, paddingVertical: 12 }}
          >
            <Ionicons name="trash-outline" size={20} color={colors.deleteRed} />
            <Text style={{ fontSize: 11, color: colors.deleteRed, marginTop: 2 }}>Delete</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setShowMoreSheet(true)}
            disabled={sharing || zipping || deleting || vaulting || multiPasting}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderRadius: 12, paddingVertical: 12 }}
          >
            <Ionicons name="ellipsis-horizontal" size={20} color={colors.textPrimary} />
            <Text style={{ fontSize: 11, color: colors.textPrimary, marginTop: 2 }}>More</Text>
          </TouchableOpacity>
          </View>
        </>
      )}
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
            {Array.from(selectedItemsMap.values()).some(f => isImageFile(f.name)) && (
              <TouchableOpacity style={styles.sheetAction} onPress={() => { setShowMoreSheet(false); handleCreatePdf(); }}>
                <Ionicons name="document-outline" size={20} color={colors.blue} />
                <Text style={[styles.sheetActionText, { color: colors.blue }]}>Create PDF</Text>
              </TouchableOpacity>
            )}
            {Array.from(selectedItemsMap.values()).some(f => f.name.toLowerCase().endsWith('.pdf')) && (
              <TouchableOpacity style={styles.sheetAction} onPress={handleMergePdfs}>
                <Ionicons name="documents-outline" size={20} color={colors.blue} />
                <Text style={[styles.sheetActionText, { color: colors.blue }]}>Merge PDFs</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.sheetAction} onPress={() => setShowMoreSheet(false)}>
              <Ionicons name="close-outline" size={20} color={colors.textMuted} />
              <Text style={[styles.sheetActionText, { color: colors.textMuted }]}>Cancel</Text>
            </TouchableOpacity>
          </Animated.View>
        </Pressable>
      </Modal>
      {/* Sort sheet */}
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
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, borderTopWidth: 0.5, borderTopColor: colors.border, marginTop: 4 }}
              onPress={toggleHidden}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Ionicons name={showHidden ? 'eye-outline' : 'eye-off-outline'} size={20} color={showHidden ? colors.blue : colors.textSecondary} />
                <Text style={{ fontSize: 15, color: colors.textPrimary }}>Show hidden folders and files</Text>
              </View>
              <View style={{ width: 44, height: 26, borderRadius: 13, backgroundColor: showHidden ? colors.blue : colors.border, justifyContent: 'center', paddingHorizontal: 3 }}>
                <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff', alignSelf: showHidden ? 'flex-end' : 'flex-start' }} />
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={{ alignItems: 'center', paddingVertical: 14, backgroundColor: colors.surface, borderRadius: 10, marginTop: 4 }} onPress={() => setShowSortSheet(false)}>
              <Text style={{ fontSize: 14, fontWeight: '500', color: colors.textSecondary }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
      {/* FAB — only when not in select mode */}
      {!selectMode && (
        <TouchableOpacity
          onPress={() => { setNewItemName(''); setShowCreateSheet(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}
          style={{
            position: 'absolute',
            bottom: insets.bottom + 24,
            right: 24,
            width: 52,
            height: 52,
            borderRadius: 26,
            backgroundColor: colors.blue,
            alignItems: 'center',
            justifyContent: 'center',
            elevation: 4,
          }}
        >
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      )}
      {/* Create sheet — New Folder / New Text File picker */}
      <Modal visible={showCreateSheet} transparent animationType="fade" onRequestClose={() => setShowCreateSheet(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={() => setShowCreateSheet(false)} />
          <View style={{ backgroundColor: colors.card, borderRadius: 16, padding: 20, width: SCREEN_WIDTH > SCREEN_HEIGHT ? SCREEN_WIDTH * 0.4 : SCREEN_WIDTH - 64 }}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: colors.textPrimary, marginBottom: 16 }}>Create New</Text>
            <TouchableOpacity
              style={[styles.sheetAction]}
              onPress={() => { setShowCreateSheet(false); setTimeout(() => setShowNewFolder(true), 150); }}
            >
              <Ionicons name="folder-outline" size={22} color={colors.yellow} />
              <Text style={[styles.sheetActionText, { color: colors.textPrimary }]}>New Folder</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sheetAction]}
              onPress={() => { setShowCreateSheet(false); setTimeout(() => setShowNewTextFile(true), 150); }}
            >
              <Ionicons name="document-text-outline" size={22} color={colors.blue} />
              <Text style={[styles.sheetActionText, { color: colors.textPrimary }]}>New Text File</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sheetAction]}
              onPress={() => setShowCreateSheet(false)}
            >
              <Ionicons name="close-outline" size={22} color={colors.textMuted} />
              <Text style={[styles.sheetActionText, { color: colors.textMuted }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* New Folder modal */}
      <Modal visible={showNewFolder} transparent animationType="fade" onRequestClose={() => { setShowNewFolder(false); setNewItemName(''); }}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: SCREEN_WIDTH > SCREEN_HEIGHT ? 0 : 24, paddingBottom: SCREEN_WIDTH > SCREEN_HEIGHT ? 0 : SCREEN_HEIGHT * 0.35 }}>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={() => { setShowNewFolder(false); setNewItemName(''); }} />
            <View style={{ backgroundColor: colors.card, borderRadius: 16, padding: 20, width: SCREEN_WIDTH > SCREEN_HEIGHT ? SCREEN_WIDTH * 0.4 : '100%' }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <Text style={{ fontSize: 16, fontWeight: '600', color: colors.textPrimary }}>New Folder</Text>
                <TouchableOpacity onPress={() => { setShowNewFolder(false); setNewItemName(''); }}>
                  <Ionicons name="close" size={20} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
              <TextInput
                style={[styles.renameInput, { backgroundColor: colors.surface, color: colors.textPrimary }]}
                value={newItemName}
                onChangeText={setNewItemName}
                placeholder="Folder name..."
                autoFocus
                placeholderTextColor={colors.textMuted}
                returnKeyType="done"
                onSubmitEditing={handleCreateFolder}
              />
              <View style={[styles.renameActions, { marginTop: 12 }]}>
                <TouchableOpacity style={[styles.renameCancelBtn, { backgroundColor: colors.surface }]} onPress={() => { setShowNewFolder(false); setNewItemName(''); }}>
                  <Text style={[styles.renameCancelText, { color: colors.textSecondary }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.renameConfirmBtn, creatingItem && { opacity: 0.6 }]}
                  onPress={handleCreateFolder}
                  disabled={creatingItem}
                >
                  {creatingItem ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.renameConfirmText}>Create</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </View>
      </Modal>

      {/* New Text File modal */}
      <Modal visible={showNewTextFile} animationType="slide" onRequestClose={() => { setShowNewTextFile(false); setNewItemName(''); setTextFileContent(''); setEditingFile(null); if (editorListening) ExpoSpeechRecognitionModule.stop(); setEditorListening(false); }}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
          <TouchableOpacity onPress={() => { setShowNewTextFile(false); setNewItemName(''); setTextFileContent(''); setEditingFile(null); if (editorListening) ExpoSpeechRecognitionModule.stop(); }} style={{ marginRight: 12 }}>
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
            <TextInput
              style={{ flex: 1, fontSize: 16, fontWeight: '500', color: colors.textPrimary, padding: 0 }}
              value={newItemName}
              onChangeText={setNewItemName}
              placeholder="File name..."
              placeholderTextColor={colors.textMuted}
              autoFocus={!editingFile}
              editable={!editingFile}
              returnKeyType="next"
              autoCapitalize="none"
            />
            <View style={{ position: 'relative', marginLeft: 8 }}>
              {editorMicTooltip && (
                <View style={{
                  position: 'absolute', bottom: 40, right: 0,
                  backgroundColor: '#222', paddingHorizontal: 12, paddingVertical: 8,
                  borderRadius: 10, width: 200, zIndex: 10,
                }}>
                  <Text style={{ color: '#fff', fontSize: 11, lineHeight: 16 }}>
                    Enable microphone access in Settings to use voice dictation
                  </Text>
                </View>
              )}
              <TouchableOpacity onPress={toggleEditorListening} style={{ padding: 8 }}>
                <Ionicons
                  name={editorListening ? 'stop-circle' : 'mic-outline'}
                  size={22}
                  color={editorListening ? colors.deleteRed : colors.textMuted}
                />
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              onPress={handleCreateTextFile}
              disabled={creatingItem}
              style={{ marginLeft: 12, backgroundColor: colors.blue, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, opacity: creatingItem ? 0.6 : 1 }}
            >
              {creatingItem
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>{editingFile ? 'Save' : 'Create'}</Text>
              }
            </TouchableOpacity>
          </View>
        <TextInput
            style={{ flex: 1, padding: 16, fontSize: 15, color: colors.textPrimary, textAlignVertical: 'top', lineHeight: 22 }}
            value={textFileContent}
            onChangeText={setTextFileContent}
            placeholder="Start typing..."
            placeholderTextColor={colors.textMuted}
            multiline
            autoFocus={!!editingFile}
            returnKeyType="default"
            autoCorrect={true}
          />
        </SafeAreaView>
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
      {/* File Details Modal */}
      <FileDetailsModal visible={showDetailsModal} name={detailsName} data={detailsData} onClose={() => setShowDetailsModal(false)} />
      <Modal visible={showMultiRename} transparent animationType="fade" onRequestClose={() => { setShowMultiRename(false); setMultiRenameBase(''); }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={undefined}>
          <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: SCREEN_WIDTH > SCREEN_HEIGHT ? SCREEN_WIDTH * 0.2 : 24, paddingBottom: SCREEN_WIDTH > SCREEN_HEIGHT ? 0 : SCREEN_HEIGHT * 0.3 }}
            onPress={() => { setShowMultiRename(false); setMultiRenameBase(''); }}>
            <Pressable style={{ backgroundColor: colors.card, borderRadius: 16, padding: 20, width: '100%' }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <Text style={{ fontSize: 16, fontWeight: '600', color: colors.textPrimary }}>
                  Rename {Array.from(selectedItemsMap.values()).filter(f => !f.isDirectory).length} file{Array.from(selectedItemsMap.values()).filter(f => !f.isDirectory).length !== 1 ? 's' : ''}
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
                <ScrollView style={{ maxHeight: SCREEN_HEIGHT * (SCREEN_WIDTH > SCREEN_HEIGHT ? 0.5 : 0.45) }} showsVerticalScrollIndicator={true} bounces={true} nestedScrollEnabled={true}>
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
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  pathRow: { flexDirection: 'row', flexWrap: 'wrap', paddingLeft: 52, paddingBottom: 4 },
  pathSegment: { fontSize: 12 },
  pathSegmentActive: { color: '#2E7D32', fontWeight: '600' },
  backBtn: { width: 36, height: 36, justifyContent: 'center' },
  title: { flex: 1, fontSize: 20, fontWeight: '500', letterSpacing: -0.5, textAlign: 'center' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 14 },
  listContent: { paddingHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 0.5 },
  fileIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12, overflow: 'hidden' },
  thumbnail: { width: 40, height: 40, borderRadius: 10 },
  extLabel: { fontSize: 9, fontWeight: '500' },
  dotsBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  fileInfo: { flex: 1 },
  fileName: { fontSize: 14, fontWeight: '500', marginBottom: 2 },
  fileMeta: { fontSize: 11 },
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
  busyBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
  busyText: { fontSize: 13 },
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
  passwordModalSub: {
    fontSize: 13,
  },
  centeredOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-start', alignItems: 'center' },
  qrCard: { borderRadius: 16, padding: 16, paddingBottom: 24, alignItems: 'center', margin: 32, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 8, overflow: 'hidden' },
  qrTitle: { fontSize: 18, fontWeight: '600', marginBottom: 4, letterSpacing: -0.3 },
  qrSub: { fontSize: 12, textAlign: 'center', marginBottom: 4 },
  qrOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
});
