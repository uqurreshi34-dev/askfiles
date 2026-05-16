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
import { getMimeType, isImageFile, formatSize } from '@/utils/files';
import { addRecent } from '@/hooks/useRecents';
import * as MediaLibrary from 'expo-media-library';
import * as IntentLauncher from 'expo-intent-launcher';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { useVault } from '@/hooks/useVault';
import { usePro } from '@/hooks/usePro';
import { addFavourite, removeFavourite, isFavourite } from '@/hooks/useFavourites';
import RNFS from 'react-native-fs';
import JSZip from 'jszip';
import { useTheme } from '@/hooks/useTheme';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import { shareFiles, openFile as openFileNative } from '@/modules/share-module';
import { useTrash } from '@/hooks/useTrash';

interface FileItem {
  name: string;
  uri: string;
  isDirectory: boolean;
}

const ROOT_PATH = 'file:///storage/emulated/0/';

function getFileColor(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic'].includes(ext ?? '')) return '#185FA5';
  if (['mp4', 'mkv', 'avi', 'mov', 'webm'].includes(ext ?? '')) return '#993C1D';
  if (['pdf', 'doc', 'docx', 'txt', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext ?? '')) return '#534AB7';
  if (['mp3', 'wav', 'aac', 'flac', 'm4a'].includes(ext ?? '')) return '#854F0B';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext ?? '')) return '#3B6D11';
  if (['apk'].includes(ext ?? '')) return '#A32D2D';
  return '#5F5E5A';
}

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
  const [selectMode, setSelectMode] = useState(false);
  const [selectedUris, setSelectedUris] = useState<Set<string>>(new Set());
  const [selectedItemsMap, setSelectedItemsMap] = useState<Map<string, FileItem>>(new Map());
  const [showPicker, setShowPicker] = useState(false);
  const [pickerMode, setPickerMode] = useState<'copy' | 'move'>('copy');
  const [pickerPath, setPickerPath] = useState(ROOT_PATH);
  const [pickerItems, setPickerItems] = useState<FileItem[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pasting, setPasting] = useState(false);
  const [vaulting, setVaulting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletingCount, setDeletingCount] = useState(0);
  const sharingRef = useRef(false);
  const pendingItem = useRef<FileItem | null>(null);
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
    setLoading(true);
    try {
      const dir = new FileSystem.Directory(path);
      const contents = dir.list();
      const fileItems: FileItem[] = contents
        .map(item => ({
          name: decodeName(item instanceof FileSystem.File
            ? item.name
            : item.uri.split('/').filter(Boolean).pop() ?? ''),
          uri: item.uri,
          isDirectory: item instanceof FileSystem.Directory,
        }))
        .filter(item => !item.name.startsWith('.'))
        .sort((a, b) => {
          if (a.isDirectory && !b.isDirectory) return -1;
          if (!a.isDirectory && b.isDirectory) return 1;
          return a.name.localeCompare(b.name);
        });
      setItems(fileItems);
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
    } catch (e) {
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
                const dir = new FileSystem.Directory(selectedItem.uri);
                dir.delete();
                closeSheet();
                await loadDirectory(currentPath);
              } catch {
                Alert.alert('Permission needed', 'AskFiles needs full storage access to delete folders.', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Open Settings', onPress: requestManagePermission },
                ]);
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
            await loadDirectory(currentPath);
          } else {
            Alert.alert('Error', 'Could not move file to Trash.');
          }
          setDeleting(false);
          setDeletingCount(0);
        }},
      ]);
    }
  }

  async function handleUnzip() {
    if (!selectedItem) return;
    closeSheet();
    setZipping(true);
    try {
      const srcPath = toPath(selectedItem.uri);
      const content = await RNFS.readFile(srcPath, 'base64');
      const zip = await JSZip.loadAsync(content, { base64: true });
      const destDir = srcPath.substring(0, srcPath.lastIndexOf('/') + 1);
      const folderName = selectedItem.name.replace(/\.zip$/i, '');
      const extractDir = destDir + folderName + '/';
      await RNFS.mkdir(extractDir);
      const promises: Promise<void>[] = [];
      zip.forEach((relativePath, file) => {
        if (!file.dir) {
          const p = file.async('base64').then(async (data) => {
            const filePath = extractDir + relativePath;
            const fileDir = filePath.substring(0, filePath.lastIndexOf('/') + 1);
            await RNFS.mkdir(fileDir);
            await RNFS.writeFile(filePath, data, 'base64');
          });
          promises.push(p);
        }
      });
      await Promise.all(promises);
      await loadDirectory(currentPath);
      Alert.alert('Extracted', `Files extracted to "${folderName}" folder.`);
    } catch (e) {
      Alert.alert('Error', 'Could not extract zip file.');
    } finally {
      setZipping(false);
    }
  }

  async function handleMultiZip() {
    if (selectedItemsMap.size === 0) return;
    const selectedFiles = Array.from(selectedItemsMap.values()).filter(f => !f.name.toLowerCase().endsWith('.zip'));
    if (selectedFiles.length === 0) {
      Alert.alert('No files to zip', 'ZIP files cannot be zipped again.');
      return;
    }
    let totalSize = 0;
    for (const file of selectedFiles) {
      try {
        const f = new FileSystem.File(file.uri);
        totalSize += f.size ?? 0;
      } catch {}
    }
    if (totalSize > 20 * 1024 * 1024) {
      Alert.alert('Too large', `Selected files total ${formatSize(totalSize)} which exceeds the 20 MB limit. Deselect some files and try again.`);
      return;
    }
    setSelectMode(false);
    setSelectedUris(new Set());
    setSelectedItemsMap(new Map());
    setZipping(true);
    try {
      const zip = new JSZip();
      const nameCount: Record<string, number> = {};
      for (const file of selectedFiles) {
        nameCount[file.name] = (nameCount[file.name] ?? 0) + 1;
      }
      for (const file of selectedFiles) {
        const content = await RNFS.readFile(toPath(file.uri), 'base64');
        let zipPath = file.name;
        if (nameCount[file.name] > 1) {
          const parts = toPath(file.uri).replace('/storage/emulated/0/', '').split('/');
          const folder = parts.length > 1 ? parts[parts.length - 2] : 'File';
          zipPath = `${folder}/${file.name}`;
        }
        zip.file(zipPath, content, { base64: true });
      }
      const zipName = `AskFiles_${Date.now()}.zip`;
      const destPath = toPath(currentPath) + zipName;
      const zipContent = await zip.generateAsync({ type: 'base64' });
      await RNFS.writeFile(destPath, zipContent, 'base64');
      await loadDirectory(currentPath);
      Alert.alert('Zipped', `"${zipName}" created with ${selectedFiles.length} file${selectedFiles.length !== 1 ? 's' : ''}.`);
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
        setVaulting(false);
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
        for (const file of files) {
          if (file.isDirectory) {
            try {
              const dir = new FileSystem.Directory(file.uri);
              dir.delete();
            } catch {}
          } else {
            await moveToTrash(file.uri, file.name);
            await removeFavourite(file.uri);
          }
        }
        setDeleting(false);
        setDeletingCount(0);
        setSelectMode(false); setSelectedUris(new Set()); setSelectedItemsMap(new Map());
        await loadDirectory(currentPath);
      }},
    ]);
  }
  
  function handleMultiInfo() {
    const files = Array.from(selectedItemsMap.values());
    let totalSize = 0;
    for (const file of files) {
      try {
        if (!file.isDirectory) {
          const f = new FileSystem.File(file.uri);
          totalSize += f.size ?? 0;
        }
      } catch {}
    }
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
          const decoded = decodeName(raw);
          return { name: decoded, uri: item.uri, isDirectory: true };
        })
        .filter(f => !f.name.startsWith('.'))
        .sort((a, b) => a.name.localeCompare(b.name));
      setPickerItems(folders);
    } catch (e) {}
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
        Alert.alert('Success', `"${item.name}" copied successfully.`);
      } else {
        await RNFS.moveFile(src, dst);
        try {
          const sourceFilename = decodeURIComponent(item.uri.split('/').pop() ?? '');
          const sourcePath = toPath(item.uri);
          const allAssets = await MediaLibrary.getAssetsAsync({ first: 5000, mediaType: ['photo', 'video', 'unknown'] });
          const ghost = allAssets.assets.find(a => a.filename === sourceFilename && toPath(a.uri) === sourcePath);
          if (ghost) await MediaLibrary.deleteAssetsAsync([ghost]);
        } catch {}
        const destFolder = pickerPath.endsWith('/') ? pickerPath : pickerPath + '/';
        const destName = (() => { try { return decodeURIComponent(destFolder.split('/').filter(Boolean).pop() ?? 'Folder'); } catch { return destFolder.split('/').filter(Boolean).pop() ?? 'Folder'; } })();
        setCurrentPath(destFolder);
        setBreadcrumbs([{ name: 'Storage', path: ROOT_PATH }, { name: destName, path: destFolder }]);
        await loadDirectory(destFolder);
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
      try {
        const sourceFilename = decodeURIComponent(selectedItem.uri.split('/').pop() ?? '');
        const allAssets = await MediaLibrary.getAssetsAsync({ first: 5000, mediaType: ['photo', 'video', 'unknown'] });
        const ghost = allAssets.assets.find((a: any) => a.filename === sourceFilename && toPath(a.uri) === toPath(selectedItem.uri));
        if (ghost) await MediaLibrary.deleteAssetsAsync([ghost]);
      } catch (e) {}
      closeSheet();
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

  function renderItem({ item }: { item: FileItem }) {
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
        onLongPress={() => openSheet(item)}
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
          <Text style={[styles.fileMeta, { color: colors.textMuted }]}>{item.isDirectory ? 'Folder' : ext + ' file'}</Text>
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
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.background }]}>
        <View style={styles.headerRow}>
          {breadcrumbs.length > 1 ? (
            <TouchableOpacity onPress={() => navigateToBreadcrumb(breadcrumbs.length - 2)} style={styles.backBtn}>
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
      </View>

      {zipping && (
        <View style={[styles.busyBanner, { backgroundColor: colors.busyBg }]}>
          <ActivityIndicator size="small" color={colors.blue} />
          <Text style={[styles.busyText, { color: colors.blue }]}>Processing...</Text>
        </View>
      )}

      {pasting && (
        <View style={[styles.busyBanner, { backgroundColor: colors.busyBg }]}>
          <ActivityIndicator size="small" color={colors.blue} />
          <Text style={[styles.busyText, { color: colors.blue }]}>{pickerMode === 'copy' ? 'Copying...' : 'Moving...'} {pendingItem.current?.name}</Text>
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
            Moving {deletingCount} file{deletingCount !== 1 ? 's' : ''} to Trash...
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
                      <TouchableOpacity style={styles.sheetAction} onPress={handleUnzip}>
                        <Ionicons name="archive-outline" size={20} color={colors.green} />
                        <Text style={[styles.sheetActionText, { color: colors.green }]}>Extract ZIP</Text>
                      </TouchableOpacity>
                    )}
                    <View style={[styles.sheetDivider, { backgroundColor: colors.border }]} />
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
                {pickerMode === 'copy' ? 'Copy to...' : 'Move to...'}
              </Text>
              <View style={styles.backBtn} />
            </View>
            <Text style={[styles.pathSegment, { color: colors.textMuted, paddingLeft: 52, paddingBottom: 4 }]}>
              {pickerPath.replace('file:///storage/emulated/0/', 'Storage/').split('/').map((seg: string) => { try { return decodeURIComponent(seg); } catch { return seg; } }).join('/')}
            </Text>
          </View>
          {pickerLoading ? (
            <View style={styles.centered}><ActivityIndicator color={colors.blue} /></View>
          ) : pickerItems.length === 0 ? (
            <View style={styles.centered}><Text style={[styles.emptyText, { color: colors.textMuted }]}>No folders here</Text></View>
          ) : (
            <FlatList
              data={pickerItems}
              keyExtractor={item => item.uri}
              contentContainerStyle={[styles.listContent, { paddingBottom: 100 }]}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.row, { borderBottomColor: colors.border }]}
                  onPress={() => { setPickerPath(item.uri); loadPickerDir(item.uri); }}
                  activeOpacity={0.6}
                >
                  <View style={[styles.fileIcon, { backgroundColor: colors.yellow + '22' }]}>
                    <Ionicons name="folder" size={22} color={colors.yellow} />
                  </View>
                  <View style={styles.fileInfo}>
                    <Text style={[styles.fileName, { color: colors.textPrimary }]} numberOfLines={1}>{item.name}</Text>
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
            onPress={handleMultiZip}
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
  title: { flex: 1, fontSize: 22, fontWeight: '500', letterSpacing: -0.5, textAlign: 'center' },
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
});
