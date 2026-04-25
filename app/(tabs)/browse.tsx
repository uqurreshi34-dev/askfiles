import { useState, useEffect, useRef, useCallback } from 'react';
import { PanResponder } from 'react-native';
import {
  StyleSheet, Text, View, TouchableOpacity, FlatList,
  ActivityIndicator, Image, Modal, TextInput, Alert,
  Animated, Pressable, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getMimeType, isImageFile } from '@/utils/files';
import { addRecent } from '@/hooks/useRecents';
import * as MediaLibrary from 'expo-media-library';
import * as IntentLauncher from 'expo-intent-launcher';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { useVault } from '@/hooks/useVault';
import { addFavourite, removeFavourite, isFavourite } from '@/hooks/useFavourites';
import RNFS from 'react-native-fs';

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

function formatSize(bytes: number): string {
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + ' GB';
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
  if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return bytes + ' B';
}

function decodeName(name: string): string {
  try { return decodeURIComponent(name); } catch { return name; }
}

// Strip file:// prefix for RNFS which works on raw paths
function toPath(uri: string): string {
  try { return decodeURIComponent(uri.replace('file://', '')); } catch { return uri.replace('file://', ''); }
}

export default function BrowseScreen() {
  const [currentPath, setCurrentPath] = useState(ROOT_PATH);
  const [items, setItems] = useState<FileItem[]>([]);
  const [breadcrumbs, setBreadcrumbs] = useState<{ name: string; path: string }[]>([
    { name: 'Storage', path: ROOT_PATH },
  ]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<FileItem | null>(null);
  const { addToVault } = useVault();
  const [showSheet, setShowSheet] = useState(false);
  const [showRename, setShowRename] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [fileSize, setFileSize] = useState<string | null>(null);
  const [isFav, setIsFav] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerMode, setPickerMode] = useState<'copy' | 'move'>('copy');
  const [pickerPath, setPickerPath] = useState(ROOT_PATH);
  const [pickerItems, setPickerItems] = useState<FileItem[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
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
    Animated.spring(sheetAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
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
    Animated.timing(sheetAnim, {
      toValue: 400,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
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
    if (isImageFile(item.name)) {
      router.push({ pathname: '/viewer', params: { uri: item.uri, name: item.name } });
      return;
    }
    try {
      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(item.uri, {
          mimeType: getMimeType(item.name),
          dialogTitle: item.name,
        });
      }
    } catch (e) {
      console.log('Cannot open file:', e);
    }
  }

  function navigateTo(item: FileItem) {
    if (item.isDirectory) {
      setCurrentPath(item.uri);
      setBreadcrumbs(prev => [...prev, { name: item.name, path: item.uri }]);
    } else {
      openFile(item);
    }
  }

  function navigateToBreadcrumb(index: number) {
    const crumb = breadcrumbs[index];
    setBreadcrumbs(prev => prev.slice(0, index + 1));
    setCurrentPath(crumb.path);
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
        await Sharing.shareAsync(cacheUri, {
          dialogTitle: selectedItem.name,
          mimeType: 'image/jpeg',
        });
      } else {
        await Sharing.shareAsync(selectedItem.uri, {
          mimeType: getMimeType(selectedItem.name),
          dialogTitle: selectedItem.name,
        });
      }
    } catch (e) {
      console.log('Share error:', e);
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
            closeSheet();
            const ok = await addToVault(selectedItem.uri, selectedItem.name);
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
      await IntentLauncher.startActivityAsync(
        'android.settings.MANAGE_APP_ALL_FILES_ACCESS_PERMISSION',
        { data: 'package:com.askfiles.mobile' }
      );
    } catch {
      try {
        await IntentLauncher.startActivityAsync(
          'android.settings.MANAGE_ALL_FILES_ACCESS_PERMISSION',
        );
      } catch (e) {
        console.log('Permission intent error:', e);
      }
    }
  }

  async function handleDelete() {
    if (!selectedItem) return;
    Alert.alert(
      'Delete',
      `Are you sure you want to delete "${selectedItem.name}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              if (selectedItem.isDirectory) {
                const dir = new FileSystem.Directory(selectedItem.uri);
                dir.delete();
              } else {
                const assets = await MediaLibrary.getAssetsAsync({ first: 1000 });
                const match = assets.assets.find(a =>
                  selectedItem.uri.includes(a.filename)
                );
                if (match) {
                  await MediaLibrary.deleteAssetsAsync([match]);
                } else {
                  const file = new FileSystem.File(selectedItem.uri);
                  file.delete();
                }
              }
              closeSheet();
              await loadDirectory(currentPath);
            } catch (e) {
              console.log('Delete error:', e);
              Alert.alert(
                'Permission needed',
                'AskFiles needs full storage access to delete files. Tap "Open Settings", enable "Allow access to manage all files", then try again.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Open Settings', onPress: requestManagePermission },
                ]
              );
            }
          },
        },
      ]
    );
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
          //console.log('PICKER folder raw:', raw, 'decoded:', decoded);
          return { name: decoded, uri: item.uri, isDirectory: true };
        })
        .filter(f => !f.name.startsWith('.'))
        .sort((a, b) => a.name.localeCompare(b.name));
      setPickerItems(folders);
    } catch (e) { console.log('loadPickerDir error:', e); setPickerItems([]); }
    finally { setPickerLoading(false); }
  }

  function openPicker(mode: 'copy' | 'move') {
    pendingItem.current = selectedItem; // save before closeSheet nulls selectedItem
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
      // console.log('PASTE src:', src);
      // console.log('PASTE dst:', dst);

      if (pickerMode === 'copy') {
        const alreadyExists = await RNFS.exists(dst);
        if (alreadyExists) {
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
        //console.log('MOVE attempting:', src, '->', dst);
        await RNFS.moveFile(src, dst);
        //console.log('MOVE success');
        const exists = await RNFS.exists(dst);
        //console.log('DST exists after move:', exists);
        try { await RNFS.scanFile(dst); } catch {}
        try {
          const sourceFilename = decodeURIComponent(item.uri.split('/').pop() ?? '');
          const sourcePath = toPath(item.uri);
          const allAssets = await MediaLibrary.getAssetsAsync({ first: 5000, mediaType: ['photo', 'video', 'unknown'] });
          const ghost = allAssets.assets.find(a =>
            a.filename === sourceFilename && toPath(a.uri) === sourcePath
          );
          if (ghost) await MediaLibrary.deleteAssetsAsync([ghost]);
        } catch {}
        setShowPicker(false);
        // Navigate to destination so user can see the moved file
        const destFolder = pickerPath.endsWith('/') ? pickerPath : pickerPath + '/';
        const destName = (() => { try { return decodeURIComponent(destFolder.split('/').filter(Boolean).pop() ?? 'Folder'); } catch { return destFolder.split('/').filter(Boolean).pop() ?? 'Folder'; } })();
        setCurrentPath(destFolder);
        setBreadcrumbs([
          { name: 'Storage', path: ROOT_PATH },
          { name: destName, path: destFolder },
        ]);
        await loadDirectory(destFolder);
        //console.log('DEST FOLDER loaded:', destFolder);
        Alert.alert('Success', `"${item.name}" moved successfully.`);
      }
    } catch (e: any) {
      console.log('Paste error:', e);
      Alert.alert('Error', `Could not ${pickerMode} file.`);
    }
  }

  async function handleRename() {
    if (!selectedItem || !renameValue.trim()) return;

    const uri = selectedItem.uri.endsWith('/')
      ? selectedItem.uri.slice(0, -1)
      : selectedItem.uri;
    const parentPath = uri.substring(0, uri.lastIndexOf('/') + 1);
    const newUri = parentPath + renameValue.trim();

    try {
      await RNFS.moveFile(toPath(selectedItem.uri), toPath(newUri));
      try {
        const sourceFilename = decodeURIComponent(selectedItem.uri.split('/').pop() ?? '');
        const allAssets = await MediaLibrary.getAssetsAsync({ first: 5000, mediaType: ['photo', 'video', 'unknown'] });
        const ghost = allAssets.assets.find((a: any) => a.filename === sourceFilename && toPath(a.uri) === toPath(selectedItem.uri));
        //console.log('Ghost search — filename:', sourceFilename, 'found:', ghost?.uri ?? 'NONE');
        if (ghost) await MediaLibrary.deleteAssetsAsync([ghost]);
      } catch (e) { console.log('Ghost delete error:', e); }
      closeSheet();
      await loadDirectory(currentPath);
    } catch (e: any) {
      console.log('Rename error:', e);
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
    const color = item.isDirectory ? '#BA7517' : getFileColor(item.name);
    const ext = item.isDirectory ? null : (item.name.split('.').pop()?.toUpperCase() ?? '?');

    return (
      <TouchableOpacity
        style={styles.row}
        onPress={() => navigateTo(item)}
        onLongPress={() => openSheet(item)}
        delayLongPress={400}
        activeOpacity={0.6}
      >
        <View style={[styles.fileIcon, { backgroundColor: color + '22' }]}>
          {item.isDirectory ? (
            <Ionicons name="folder" size={22} color={color} />
          ) : isImageFile(item.name) ? (
            <Image source={{ uri: item.uri }} style={styles.thumbnail} resizeMode="cover" />
          ) : (
            <Text style={[styles.extLabel, { color }]}>{ext?.slice(0, 4)}</Text>
          )}
        </View>
        <View style={styles.fileInfo}>
          <Text style={styles.fileName} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.fileMeta}>{item.isDirectory ? 'Folder' : ext + ' file'}</Text>
        </View>
        {item.isDirectory ? (
          <Ionicons name="chevron-forward" size={16} color="#D3D1C7" />
        ) : (
          <TouchableOpacity
            style={styles.dotsBtn}
            onPress={() => openSheet(item)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="ellipsis-vertical" size={16} color="#888780" />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          {breadcrumbs.length > 1 ? (
            <TouchableOpacity onPress={() => navigateToBreadcrumb(breadcrumbs.length - 2)} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={22} color="#111" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={() => router.push('/(tabs)')} style={styles.backBtn}>
              <Ionicons name="home-outline" size={22} color="#111" />
            </TouchableOpacity>
          )}
          <Text style={styles.title} numberOfLines={1}>
            {breadcrumbs[breadcrumbs.length - 1]?.name ?? 'Browse'}
          </Text>
          <View style={styles.backBtn} />
        </View>
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
                index === breadcrumbs.length - 1 && styles.pathSegmentActive,
              ]}>
                {index > 0 ? '/' : ''}{crumb.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color="#185FA5" />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>This folder is empty</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={item => item.uri}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      <Modal
        visible={showSheet}
        transparent
        animationType="none"
        onRequestClose={closeSheet}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'android' ? 'height' : 'padding'}
        >
          <Pressable style={styles.overlay} onPress={closeSheet}>
            <Animated.View
              style={[
                styles.sheet,
                {
                  transform: [{ translateY: sheetAnim }],
                  paddingBottom: insets.bottom + 16,
                },
              ]}
              {...panResponder.panHandlers}
            >
              <Pressable>
                <View style={styles.sheetHandle} />
                <View style={styles.sheetHeader}>
                  <View style={[styles.sheetIcon, { backgroundColor: (selectedItem?.isDirectory ? '#BA7517' : getFileColor(selectedItem?.name ?? '')) + '22' }]}>
                    {selectedItem?.isDirectory ? (
                      <Ionicons name="folder" size={22} color="#BA7517" />
                    ) : isImageFile(selectedItem?.name ?? '') ? (
                      <Image source={{ uri: selectedItem?.uri }} style={styles.sheetThumb} resizeMode="cover" />
                    ) : (
                      <Text style={[styles.extLabel, { color: getFileColor(selectedItem?.name ?? '') }]}>
                        {selectedItem?.name.split('.').pop()?.toUpperCase().slice(0, 4)}
                      </Text>
                    )}
                  </View>
                  <View style={styles.sheetFileInfo}>
                    <Text style={styles.sheetFileName} numberOfLines={2}>{selectedItem?.name}</Text>
                    {fileSize && <Text style={styles.sheetFileMeta}>{fileSize}</Text>}
                    {selectedItem?.isDirectory && <Text style={styles.sheetFileMeta}>Folder</Text>}
                  </View>
                </View>

                <View style={styles.sheetDivider} />

                {showRename ? (
                  <View style={styles.renameWrap}>
                    <TextInput
                      style={styles.renameInput}
                      value={renameValue}
                      onChangeText={setRenameValue}
                      autoFocus
                      selectTextOnFocus
                      placeholder="New name..."
                      placeholderTextColor="#888780"
                      returnKeyType="done"
                      onSubmitEditing={handleRename}
                    />
                    <View style={styles.renameActions}>
                      <TouchableOpacity
                        style={styles.renameCancelBtn}
                        onPress={() => { setShowRename(false); setRenameValue(''); }}
                      >
                        <Text style={styles.renameCancelText}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.renameConfirmBtn}
                        onPress={handleRename}
                      >
                        <Text style={styles.renameConfirmText}>Rename</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <>
                    <TouchableOpacity style={styles.sheetAction} onPress={handleShare}>
                      <Ionicons name="share-outline" size={20} color="#111" />
                      <Text style={styles.sheetActionText}>Share</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.sheetAction} onPress={() => openPicker('copy')}>
                      <Ionicons name="copy-outline" size={20} color="#111" />
                      <Text style={styles.sheetActionText}>Copy</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.sheetAction} onPress={() => openPicker('move')}>
                      <Ionicons name="arrow-redo-outline" size={20} color="#111" />
                      <Text style={styles.sheetActionText}>Move</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.sheetAction}
                      onPress={() => {
                        setRenameValue(selectedItem?.name ?? '');
                        setShowRename(true);
                      }}
                    >
                      <Ionicons name="pencil-outline" size={20} color="#111" />
                      <Text style={styles.sheetActionText}>Rename</Text>
                    </TouchableOpacity>
                    {!selectedItem?.isDirectory && (
                      <TouchableOpacity style={styles.sheetAction} onPress={handleMoveToVault}>
                        <Ionicons name="shield-checkmark-outline" size={20} color="#185FA5" />
                        <Text style={[styles.sheetActionText, { color: '#185FA5' }]}>Move to Vault</Text>
                      </TouchableOpacity>
                    )}
                    {!selectedItem?.isDirectory && (
                      <TouchableOpacity style={styles.sheetAction} onPress={handleToggleFavourite}>
                        <Ionicons name={isFav ? 'heart' : 'heart-outline'} size={20} color={isFav ? '#E24B4A' : '#111'} />
                        <Text style={[styles.sheetActionText, isFav && { color: '#E24B4A' }]}>
                          {isFav ? 'Remove from Favourites' : 'Add to Favourites'}
                        </Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={styles.sheetAction}
                      onPress={() => {
                        closeSheet();
                        const location = selectedItem?.uri
                          .replace('file:///storage/emulated/0/', '')
                          .split('/').slice(0, -1).join('/') || 'Storage';
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
                      <Ionicons name="information-circle-outline" size={20} color="#111" />
                      <Text style={styles.sheetActionText}>Info</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.sheetAction} onPress={handleDelete}>
                      <Ionicons name="trash-outline" size={20} color="#E24B4A" />
                      <Text style={[styles.sheetActionText, { color: '#E24B4A' }]}>Delete</Text>
                    </TouchableOpacity>
                    <View style={styles.sheetDivider} />
                    <TouchableOpacity style={styles.sheetAction} onPress={closeSheet}>
                      <Ionicons name="close-outline" size={20} color="#888780" />
                      <Text style={[styles.sheetActionText, { color: '#888780' }]}>Cancel</Text>
                    </TouchableOpacity>
                  </>
                )}
              </Pressable>
            </Animated.View>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={showPicker} transparent={false} animationType="slide" onRequestClose={() => setShowPicker(false)}>
        <SafeAreaView style={styles.container}>
          <View style={styles.header}>
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
                <Ionicons name="arrow-back" size={22} color="#111" />
              </TouchableOpacity>
              <Text style={styles.title} numberOfLines={1}>
                {pickerMode === 'copy' ? 'Copy to...' : 'Move to...'}
              </Text>
              <View style={styles.backBtn} />
            </View>
            <Text style={[styles.pathSegment, { paddingLeft: 52, paddingBottom: 4 }]}>
              {pickerPath.replace('file:///storage/emulated/0/', 'Storage/').split('/').map((seg: string) => { try { return decodeURIComponent(seg); } catch { return seg; } }).join('/')}
            </Text>
          </View>
          {pickerLoading ? (
            <View style={styles.centered}><ActivityIndicator color="#185FA5" /></View>
          ) : pickerItems.length === 0 ? (
            <View style={styles.centered}><Text style={styles.emptyText}>No folders here</Text></View>
          ) : (
            <FlatList
              data={pickerItems}
              keyExtractor={item => item.uri}
              contentContainerStyle={[styles.listContent, { paddingBottom: 100 }]}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.row}
                  onPress={() => { setPickerPath(item.uri); loadPickerDir(item.uri); }}
                  activeOpacity={0.6}
                >
                  <View style={[styles.fileIcon, { backgroundColor: '#BA751722' }]}>
                    <Ionicons name="folder" size={22} color="#BA7517" />
                  </View>
                  <View style={styles.fileInfo}>
                    <Text style={styles.fileName} numberOfLines={1}>{item.name}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#D3D1C7" />
                </TouchableOpacity>
              )}
            />
          )}
          <View style={styles.pickerFooter}>
            <TouchableOpacity style={styles.pickerCancelBtn} onPress={() => setShowPicker(false)}>
              <Text style={styles.pickerCancelText}>Cancel</Text>
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
  container: { flex: 1, backgroundColor: '#fff' },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  pathRow: { flexDirection: 'row', flexWrap: 'wrap', paddingLeft: 52, paddingBottom: 4 },
  pathSegment: { fontSize: 12, color: '#888780' },
  pathSegmentActive: { color: '#2E7D32', fontWeight: '600' },
  backBtn: { width: 36, height: 36, justifyContent: 'center' },
  title: { flex: 1, fontSize: 22, fontWeight: '500', color: '#111', letterSpacing: -0.5, textAlign: 'center' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 14, color: '#888780' },
  listContent: { paddingHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: '#F1EFE8' },
  fileIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12, overflow: 'hidden' },
  thumbnail: { width: 40, height: 40, borderRadius: 10 },
  extLabel: { fontSize: 9, fontWeight: '500' },
  dotsBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  fileInfo: { flex: 1 },
  fileName: { fontSize: 14, fontWeight: '500', color: '#111', marginBottom: 2 },
  fileMeta: { fontSize: 11, color: '#888780' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 16 },
  sheetHandle: { width: 36, height: 4, backgroundColor: '#D3D1C7', borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 16 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 12 },
  sheetIcon: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  sheetThumb: { width: 44, height: 44 },
  sheetFileInfo: { flex: 1 },
  sheetFileName: { fontSize: 14, fontWeight: '500', color: '#111', marginBottom: 2 },
  sheetFileMeta: { fontSize: 12, color: '#888780' },
  sheetDivider: { height: 0.5, backgroundColor: '#F1EFE8', marginVertical: 8 },
  sheetAction: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 },
  sheetActionText: { fontSize: 15, color: '#111' },
  renameWrap: { paddingVertical: 12, gap: 12 },
  renameInput: { backgroundColor: '#F1EFE8', borderRadius: 10, padding: 12, fontSize: 14, color: '#111' },
  renameActions: { flexDirection: 'row', gap: 8 },
  renameCancelBtn: { flex: 1, padding: 12, borderRadius: 10, backgroundColor: '#F1EFE8', alignItems: 'center' },
  renameCancelText: { fontSize: 14, color: '#5F5E5A' },
  renameConfirmBtn: { flex: 1, padding: 12, borderRadius: 10, backgroundColor: '#185FA5', alignItems: 'center' },
  renameConfirmText: { fontSize: 14, color: '#fff', fontWeight: '500' },
  pickerFooter: { flexDirection: 'row', gap: 8, padding: 16, borderTopWidth: 0.5, borderTopColor: '#F1EFE8' },
  pickerCancelBtn: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: '#F1EFE8', alignItems: 'center' },
  pickerCancelText: { fontSize: 14, color: '#5F5E5A', fontWeight: '500' },
  pickerPasteBtn: { flex: 2, flexDirection: 'row', padding: 14, borderRadius: 12, backgroundColor: '#185FA5', alignItems: 'center', justifyContent: 'center' },
  pickerPasteText: { fontSize: 14, color: '#fff', fontWeight: '600' },
});
