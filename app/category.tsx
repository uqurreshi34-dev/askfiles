import { useState, useEffect, useRef } from 'react';
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

// Ensure URI ends with slash so FileSystem.Directory resolves subdirs correctly
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
        // Recursive — catches docs in subdirectories
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

export default function CategoryScreen() {
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

  const ROOT_PATH = 'file:///storage/emulated/0/';

  function toPath(uri: string): string {
    return uri.replace('file://', '');
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
        await RNFS.copyFile(src, dst);
        setShowPicker(false);
        Alert.alert('Success', `"${item.name}" copied successfully.`);
      } else {
        await RNFS.moveFile(src, dst);
        try {
          const sourceFilename = decodeURIComponent(item.uri.split('/').pop() ?? '');
          const allAssets = await MediaLibrary.getAssetsAsync({ first: 5000, mediaType: ['photo', 'video', 'unknown'] });
          const ghost = allAssets.assets.find((a: any) =>
            a.filename === sourceFilename && toPath(a.uri) === src
          );
          if (ghost) await MediaLibrary.deleteAssetsAsync([ghost]);
        } catch {}
        setItems(prev => prev.filter(f => f.uri !== item.uri));
        setShowPicker(false);
        Alert.alert('Success', `"${item.name}" moved successfully.`);
      }
    } catch (e: any) {
      console.log('Paste error:', e);
      Alert.alert('Error', `Could not ${pickerMode} file.`);
    }
  }

  async function handleRename() {
    if (!selectedItem || !renameValue.trim()) return;
    const uri = selectedItem.uri.endsWith('/') ? selectedItem.uri.slice(0, -1) : selectedItem.uri;
    const parentPath = uri.substring(0, uri.lastIndexOf('/') + 1);
    const newUri = parentPath + renameValue.trim();
    try {
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
      console.log('Rename error:', e);
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
        const results = await Promise.all(docPaths.map(p => scanDirForDocs(p)));
        const all = results.flat();
        const unique = all.filter((f, i, arr) => arr.findIndex(x => x.uri === f.uri) === i);
        setItems(unique.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '')));
      }
    } catch (e) {
      console.log('Category load error:', e);
    } finally {
      setLoading(false);
    }
  }

  async function openItem(item: FileItem) {
    await addRecent({ name: item.name, uri: item.uri, openedAt: Date.now() });
    if (isImageFile(item.name)) {
      router.push({ pathname: '/viewer', params: { uri: item.uri, name: item.name } });
      return;
    }
    try {
      await Sharing.shareAsync(item.uri, {
        mimeType: getMimeType(item.name),
        dialogTitle: item.name,
      });
    } catch (e) { console.log('Open error:', e); }
  }

  async function handleMoveToVault() {
    if (!selectedItem) return;
    Alert.alert('Move to Vault', `Move "${selectedItem.name}" to your Secure Vault?`, [
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
    } catch (e) { console.log('Share error:', e); }
  }

  function renderItem({ item }: { item: FileItem }) {
    const isImg = isImageFile(item.name);
    const ext = item.name.split('.').pop()?.toUpperCase() ?? '?';
    return (
      <TouchableOpacity
        style={styles.row}
        onPress={() => openItem(item)}
        onLongPress={() => openSheet(item)}
        activeOpacity={0.7}
      >
        <View style={[styles.icon, { backgroundColor: config.color + '22', overflow: 'hidden' }]}>
          {isImg ? (
            <Image source={{ uri: item.uri }} style={styles.thumb} resizeMode="cover" />
          ) : (
            <Text style={[styles.ext, { color: config.color }]}>{ext.slice(0, 4)}</Text>
          )}
        </View>
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.meta}>
            {item.size ? formatSize(item.size) : ''}
            {item.size && item.date ? ' · ' : ''}
            {item.date ? timeAgo(item.date) : ''}
          </Text>
        </View>
        <TouchableOpacity onPress={() => openSheet(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-forward" size={16} color="#D3D1C7" />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  }

  const tabs = category === 'documents' ? DOC_TABS : category === 'downloads' ? DL_TABS : null;

  const filteredItems = tabs && activeTab !== 'All'
    ? items.filter(item => {
        const tab = category === 'documents' ? getDocTab(item.name) : getDlTab(item.name);
        return tab === activeTab;
      })
    : items;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#111" />
        </TouchableOpacity>
        <Text style={styles.title}>{config.title}</Text>
        <View style={{ width: 40 }} />
      </View>
      {tabs && (
        <View style={styles.tabsRow}>
          {tabs.map(tab => (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, activeTab === tab && styles.tabActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab}</Text>
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
          <Ionicons name={config.icon as any} size={40} color="#D3D1C7" />
          <Text style={styles.empty}>No {activeTab === 'All' ? config.title.toLowerCase() : activeTab + ' files'} found</Text>
        </View>
      ) : (
        <FlatList
          data={filteredItems}
          keyExtractor={item => item.uri}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <Text style={styles.count}>{filteredItems.length} {activeTab === 'All' ? config.title.toLowerCase() : activeTab.toLowerCase() + ' files'}</Text>
          }
        />
      )}
      <Modal visible={showSheet} transparent animationType="none" onRequestClose={closeSheet}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'android' ? 'height' : 'padding'}>
        <Pressable style={styles.overlay} onPress={closeSheet}>
          <Animated.View
            style={[styles.sheet, { transform: [{ translateY: sheetAnim }], paddingBottom: insets.bottom + 16 }]}
            {...panResponder.panHandlers}
          >
            <Pressable>
              <View style={styles.sheetHandle} />
              <View style={styles.sheetHeader}>
                <View style={[styles.sheetIcon, { backgroundColor: config.color + '22', overflow: 'hidden' }]}>
                  {isImageFile(selectedItem?.name ?? '') ? (
                    <Image source={{ uri: selectedItem?.uri }} style={styles.sheetThumb} resizeMode="cover" />
                  ) : (
                    <Text style={[styles.ext, { color: config.color }]}>
                      {selectedItem?.name.split('.').pop()?.toUpperCase().slice(0, 4)}
                    </Text>
                  )}
                </View>
                <View style={styles.sheetInfo}>
                  <Text style={styles.sheetName} numberOfLines={2}>{selectedItem?.name}</Text>
                  {fileSize && <Text style={styles.sheetMeta}>{fileSize}</Text>}
                </View>
              </View>
              <View style={styles.sheetDivider} />
              <TouchableOpacity style={styles.sheetAction} onPress={handleShare}>
                <Ionicons name="share-outline" size={20} color="#111" />
                <Text style={styles.sheetActionText}>Share</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.sheetAction} onPress={handleMoveToVault}>
                <Ionicons name="shield-checkmark-outline" size={20} color="#185FA5" />
                <Text style={[styles.sheetActionText, { color: '#185FA5' }]}>Move to Vault</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.sheetAction} onPress={handleToggleFavourite}>
                <Ionicons name={isFav ? 'heart' : 'heart-outline'} size={20} color={isFav ? '#E24B4A' : '#111'} />
                <Text style={[styles.sheetActionText, isFav && { color: '#E24B4A' }]}>
                  {isFav ? 'Remove from Favourites' : 'Add to Favourites'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.sheetAction} onPress={() => {
                closeSheet();
                const location = selectedItem?.uri.replace('file:///storage/emulated/0/', '').split('/').slice(0, -1).join('/') || 'Storage';
                Alert.alert(selectedItem?.name ?? '', [
                  fileSize ? `Size: ${fileSize}` : null,
                  `Type: ${selectedItem?.name.split('.').pop()?.toUpperCase()} file`,
                  `Location: /${location}`,
                ].filter(Boolean).join('\n'));
              }}>
                <Ionicons name="information-circle-outline" size={20} color="#111" />
                <Text style={styles.sheetActionText}>Info</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.sheetAction} onPress={handleDelete}>
                <Ionicons name="trash-outline" size={20} color="#E24B4A" />
                <Text style={[styles.sheetActionText, { color: '#E24B4A' }]}>Delete</Text>
              </TouchableOpacity>
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
                    <TouchableOpacity style={styles.renameCancelBtn} onPress={() => { setShowRename(false); setRenameValue(''); }}>
                      <Text style={styles.renameCancelText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.renameConfirmBtn} onPress={handleRename}>
                      <Text style={styles.renameConfirmText}>Rename</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <>
                  <TouchableOpacity style={styles.sheetAction} onPress={() => openPicker('copy')}>
                    <Ionicons name="copy-outline" size={20} color="#111" />
                    <Text style={styles.sheetActionText}>Copy</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.sheetAction} onPress={() => openPicker('move')}>
                    <Ionicons name="arrow-redo-outline" size={20} color="#111" />
                    <Text style={styles.sheetActionText}>Move</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.sheetAction} onPress={() => { setRenameValue(selectedItem?.name ?? ''); setShowRename(true); }}>
                    <Ionicons name="pencil-outline" size={20} color="#111" />
                    <Text style={styles.sheetActionText}>Rename</Text>
                  </TouchableOpacity>
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
            <View style={{ width: 40 }} />
          </View>
          <Text style={{ fontSize: 12, color: '#888780', paddingHorizontal: 16, paddingBottom: 8 }}>
            {(() => { try { return decodeURIComponent(pickerPath.replace('file:///storage/emulated/0/', 'Storage/')); } catch { return pickerPath.replace('file:///storage/emulated/0/', 'Storage/'); } })()}
          </Text>
          {pickerLoading ? (
            <View style={styles.centered}><ActivityIndicator color="#185FA5" /></View>
          ) : pickerItems.length === 0 ? (
            <View style={styles.centered}><Text style={styles.empty}>No folders here</Text></View>
          ) : (
            <FlatList
              data={pickerItems}
              keyExtractor={item => item.uri}
              contentContainerStyle={[styles.list, { paddingBottom: 100 }]}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.row}
                  onPress={() => { setPickerPath(item.uri); loadPickerDir(item.uri); }}
                  activeOpacity={0.6}
                >
                  <View style={[styles.icon, { backgroundColor: '#BA751722' }]}>
                    <Ionicons name="folder" size={22} color="#BA7517" />
                  </View>
                  <View style={styles.info}>
                    <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
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
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  title: { flex: 1, fontSize: 20, fontWeight: '500', color: '#111', textAlign: 'center', letterSpacing: -0.5 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  empty: { fontSize: 14, color: '#888780' },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  tabsRow: { flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  tab: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: '#F1EFE8' },
  tabActive: { backgroundColor: '#111' },
  tabText: { fontSize: 12, fontWeight: '500', color: '#5F5E5A' },
  tabTextActive: { color: '#fff' },
  count: { fontSize: 11, color: '#888780', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: '#F1EFE8' },
  icon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  thumb: { width: 40, height: 40 },
  ext: { fontSize: 9, fontWeight: '500' },
  info: { flex: 1 },
  name: { fontSize: 14, fontWeight: '500', color: '#111', marginBottom: 2 },
  meta: { fontSize: 11, color: '#888780' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 16 },
  sheetHandle: { width: 36, height: 4, backgroundColor: '#D3D1C7', borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 16 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 12 },
  sheetIcon: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  sheetThumb: { width: 44, height: 44 },
  sheetInfo: { flex: 1 },
  sheetName: { fontSize: 14, fontWeight: '500', color: '#111', marginBottom: 2 },
  sheetMeta: { fontSize: 12, color: '#888780' },
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
