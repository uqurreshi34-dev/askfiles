import React, { useState, useEffect, useRef, useCallback } from 'react';
import { PanResponder } from 'react-native';
import { isVideoFile, VideoThumb } from '@/utils/videoThumb';
import { StyleSheet, Text, View, TouchableOpacity, FlatList,
  ActivityIndicator, Image, Modal, TextInput, Alert,
  Animated, Pressable, KeyboardAvoidingView, Platform, ScrollView, useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getMimeType, isImageFile, formatSize, getFileColor } from '@/utils/files';
import { addRecent } from '@/hooks/useRecents';
import * as MediaLibrary from 'expo-media-library';
import * as IntentLauncher from 'expo-intent-launcher';
import { useVault } from '@/hooks/useVault';
import { usePro } from '@/hooks/usePro';
import { addFavourite, removeFavourite, isFavourite } from '@/hooks/useFavourites';
import RNFS from 'react-native-fs';
import { useTheme } from '@/hooks/useTheme';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import { shareFiles, openFile as openFileNative } from '@/modules/share-module';
import { useTrash } from '@/hooks/useTrash';
import { DocIndexer } from '@/modules/doc-indexer';
import { readDirectory, countFolder, copyFileStream, moveFileStream, addCopyProgressListener, zipFiles, unzipFile, zipFilesWithPassword, unzipFileWithPassword, statFiles } from 'file-reader';
import { scanFile } from '@/modules/share-module';
import QRCode from 'react-native-qrcode-svg';
import { startWifiServer, deleteDirectory } from '@/modules/file-reader';
import { getStorageVolumes } from '@/modules/storage-stats';
import * as Haptics from 'expo-haptics';

interface FileItem {
  name: string;
  uri: string;
  isDirectory: boolean;
}

const dirCacheStore: Record<string, FileItem[]> = {};
const folderCountsStore: Record<string, number> = {};
const ROOT_PATH = 'file:///storage/emulated/0/';

function decodeName(name: string): string {
  try { return decodeURIComponent(name); } catch { return name; }
}

function toPath(uri: string): string {
  try { return decodeURIComponent(uri.replace('file://', '')); } catch { return uri.replace('file://', ''); }
}

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
  const sheetAnim = useRef(new Animated.Value(400)).current;
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => gestureState.dy > 10,
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) sheetAnim.setValue(gestureState.dy);
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 80 || gestureState.vy > 0.5) {
          Animated.timing(sheetAnim, { toValue: 400, duration: 200, useNativeDriver: true }).start(() => {
            setShowSheet(false);
            setSelectedItem(null);
            setShowRename(false);
            setRenameValue('');
          });
        } else {
          Animated.spring(sheetAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }).start();
        }
      },
    })
  ).current;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [openingUri, setOpeningUri] = useState<string | null>(null);
  const [movingUri, setMovingUri] = useState<string | null>(null);
  const [folderCounts, setFolderCounts] = useState<Record<string, number>>(folderCountsStore);
  const [qrModalVisible, setQrModalVisible] = useState(false);
  const [qrUrl, setQrUrl] = useState('');
  const [volumes, setVolumes] = useState<{ name: string; path: string; type: string }[]>([]);

  useEffect(() => {
    getStorageVolumes().then((volumes: any) => setVolumes(volumes));
  }, []);

  useEffect(() => {
    loadDirectory(currentPath);
  }, [currentPath]);

  useFocusEffect(useCallback(() => {
    loadDirectory(currentPath);
  }, [currentPath]));

  async function openSheet(item: FileItem) {
    setSelectedItem(item);
    setFileSize(null);
    setShowRename(false);
    setRenameValue('');
    setShowSheet(true);
    setIsFav(await isFavourite(item.uri));
    Animated.spring(sheetAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }).start();
    if (!item.isDirectory) {
      try {
        const file = new FileSystem.File(item.uri);
        setFileSize(formatSize(file.size ?? 0));
      } catch {
        setFileSize('Unknown');
      }
    }
  }

  function closeSheet() {
    Animated.timing(sheetAnim, { toValue: 400, duration: 200, useNativeDriver: true }).start(() => {
      setShowSheet(false);
      setSelectedItem(null);
      setShowRename(false);
      setRenameValue('');
    });
  }

  async function loadDirectory(path: string) {
    if (dirCacheStore[path]) {
      setItems(dirCacheStore[path]);
      setLoading(false);
      readDirectory(toPath(path)).then(fileItems => {
        dirCacheStore[path] = fileItems;
        setItems(fileItems);
        fileItems.filter(f => f.isDirectory).slice(0, 30).forEach(folder => {
          const folderPath = toPath(folder.uri);
          if (folderPath.includes('/Android/data')) return;
          countFolder(folderPath)
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
      const fileItems = await readDirectory(toPath(path));
      dirCacheStore[path] = fileItems;
      setItems(fileItems);
  
      fileItems.filter(f => f.isDirectory).slice(0, 30).forEach(folder => {
        const folderPath = toPath(folder.uri);
        if (folderPath.includes('/Android/data')) return;
        countFolder(folderPath)
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
      Alert.alert(
        'Delete Folder',
        `Delete "${selectedItem.name}" and all its contents? This cannot be undone.`,
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

  async function loadPickerDir(path: string) {
    setPickerLoading(true);
    try {
      const dir = new FileSystem.Directory(path);
      const contents = dir.list();
      const folders: FileItem[] = contents
        .filter(item => item instanceof FileSystem.Directory)
        .map(item => {
          const raw = item.uri.split('/').filter(Boolean).pop() ?? '';
          return { name: decodeName(raw), uri: item.uri, isDirectory: true };
        })
        .filter(f => !f.name.startsWith('.'))
        .sort((a, b) => a.name.localeCompare(b.name));
      const files: FileItem[] = contents
        .filter(item => item instanceof FileSystem.File)
        .map(item => ({ name: decodeName(item.name), uri: item.uri, isDirectory: false }))
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
            <Text style={[styles.extLabel, { color }]}>{ext?.slice(0, 4)}</Text>
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
              : ext + ' file'}
          </Text>
        </View>
        {!selectMode && (
          item.isDirectory ? (
            <Ionicons name="chevron-forward" size={16} color={colors.textDisabled} />
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

  const displayItems = searchActive && searchQuery.length > 0
    ? items.filter(item => item.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : items;

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
        {volumes.length > 1 && currentPath === ROOT_PATH && (
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
                <View style={[styles.sheetIcon, { backgroundColor: (selectedItem?.isDirectory ? colors.yellow : getFileColor(selectedItem?.name ?? '')) + '22' }]}>
                    {selectedItem?.isDirectory ? (
                      <Ionicons name="folder" size={22} color={colors.yellow} />
                    ) : isImageFile(selectedItem?.name ?? '') ? (
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
                      <TouchableOpacity style={styles.renameConfirmBtn} onPress={handleRename}>
                        <Text style={styles.renameConfirmText}>Rename</Text>
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
                    <TouchableOpacity
                      style={styles.sheetAction}
                      onPress={() => {
                        closeSheet();
                        const location = selectedItem?.uri.replace('file:///storage/emulated/0/', '').split('/').slice(0, -1).join('/') || 'Storage';
                        const locationDecoded = decodeURIComponent(location);
                        Alert.alert(
                          selectedItem?.name ?? '',
                          [
                            fileSize ? `Size: ${fileSize}` : null,
                            selectedItem?.isDirectory ? 'Type: Folder' : `Type: ${selectedItem?.name.split('.').pop()?.toUpperCase()} file`,
                            `Location: /${locationDecoded}`,
                          ].filter(Boolean).join('\n')
                        );
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
              {pendingMultiItems.current.length > 0
                ? (multiPasteMode === 'copy' ? 'Copy to...' : 'Move to...')
                : (pickerMode === 'copy' ? 'Copy to...' : 'Move to...')}
              </Text>
              <View style={styles.backBtn} />
            </View>
            <Text style={[styles.pathSegment, { color: colors.textMuted, paddingLeft: 52, paddingBottom: 4 }]}>
              {pickerPath.replace('file:///storage/emulated/0/', 'Storage/').split('/').map((seg: string) => { try { return decodeURIComponent(seg); } catch { return seg; } }).join('/')}
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
                      <Text style={[styles.extLabel, { color: getFileColor(item.name) }]}>{item.name.split('.').pop()?.toUpperCase().slice(0, 4)}</Text>
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
            onPress={handleMultiInfo}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderRadius: 12, paddingVertical: 12 }}
          >
            <Ionicons name="information-circle-outline" size={20} color={colors.textPrimary} />
            <Text style={{ fontSize: 11, color: colors.textPrimary, marginTop: 2 }}>Info</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleMultiDelete}
            disabled={sharing || zipping || deleting || vaulting || multiPasting}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderRadius: 12, paddingVertical: 12 }}
          >
            <Ionicons name="trash-outline" size={20} color={colors.deleteRed} />
            <Text style={{ fontSize: 11, color: colors.deleteRed, marginTop: 2 }}>Delete</Text>
          </TouchableOpacity>
          </View>
        </>
      )}
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
