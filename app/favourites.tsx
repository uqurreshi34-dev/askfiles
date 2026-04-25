import { useRef, useState } from 'react';
import {
  StyleSheet, Text, View, FlatList, TouchableOpacity, Image,
  ActivityIndicator, Modal, Animated, PanResponder, Pressable, Alert, TextInput,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { isImageFile, getMimeType } from '@/utils/files';
import { addRecent } from '@/hooks/useRecents';
import { useFavourites, addFavourite, removeFavourite, FavouriteItem } from '@/hooks/useFavourites';
import { useVault } from '@/hooks/useVault';
import RNFS from 'react-native-fs';

function formatSize(bytes: number): string {
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + ' GB';
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
  if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return bytes + ' B';
}

function getFileColor(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic'].includes(ext ?? '')) return '#185FA5';
  if (['mp4', 'mkv', 'avi', 'mov', 'webm'].includes(ext ?? '')) return '#993C1D';
  if (['pdf', 'doc', 'docx', 'txt', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext ?? '')) return '#534AB7';
  if (['mp3', 'wav', 'aac', 'flac', 'm4a'].includes(ext ?? '')) return '#854F0B';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext ?? '')) return '#3B6D11';
  return '#5F5E5A';
}

export default function FavouritesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { favourites } = useFavourites();
  const { addToVault } = useVault();
  const [selectedItem, setSelectedItem] = useState<FavouriteItem | null>(null);
  const [showSheet, setShowSheet] = useState(false);
  const [fileSize, setFileSize] = useState<string | null>(null);
  const [showRename, setShowRename] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [pickerMode, setPickerMode] = useState<'copy' | 'move'>('copy');
  const [pickerPath, setPickerPath] = useState('file:///storage/emulated/0/');
  const [pickerItems, setPickerItems] = useState<{ name: string; uri: string }[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const pendingItem = useRef<FavouriteItem | null>(null);
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

  async function openSheet(item: FavouriteItem) {
    setSelectedItem(item);
    setFileSize('Calculating...');
    setShowSheet(true);
    Animated.spring(sheetAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }).start();
    try {
      const file = new FileSystem.File(item.uri);
      if (file.size && file.size > 0) { setFileSize(formatSize(file.size)); return; }
    } catch {}
    setFileSize('Unknown');
  }

  function closeSheet() {
    Animated.timing(sheetAnim, { toValue: 400, duration: 200, useNativeDriver: true }).start(() => {
      setShowSheet(false); setSelectedItem(null); setShowRename(false); setRenameValue('');
    });
  }

  const ROOT_PATH = 'file:///storage/emulated/0/';
  function toPath(uri: string): string { 
    try { 
      return decodeURIComponent(uri.replace('file://', '')); 
    } 
    catch { 
      return uri.replace('file://', ''); 
    } 
  }

  async function resolveUri(uri: string): Promise<string> {
    if (!uri.startsWith('content://')) return uri.replace('file://', '');
    try {
      const info = await MediaLibrary.getAssetInfoAsync(uri as any);
      return (info.localUri ?? uri).replace('file://', '');
    } catch { return uri.replace('file://', ''); }
  }

  async function loadPickerDir(path: string) {
    setPickerLoading(true);
    try {
      const dir = new FileSystem.Directory(path.endsWith('/') ? path : path + '/');
      const contents = dir.list();
      const folders = contents
        .filter((item: any) => item instanceof FileSystem.Directory)
        .map((item: any) => { const raw = item.uri.split('/').filter(Boolean).pop() ?? ''; let name = raw; try { name = decodeURIComponent(raw); } catch {} return { name, uri: item.uri }; })
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
      const src = await resolveUri(item.uri);
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
        await RNFS.moveFile(src, dst);
        try {
          const sourceFilename = decodeURIComponent(item.uri.split('/').pop() ?? '');
          const allAssets = await MediaLibrary.getAssetsAsync({ first: 5000, mediaType: ['photo', 'video', 'unknown'] });
          const ghost = allAssets.assets.find((a: any) => a.filename === sourceFilename && toPath(a.uri) === src);
          if (ghost) await MediaLibrary.deleteAssetsAsync([ghost]);
        } catch {}
        await removeFavourite(item.uri);
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
      const srcPath = await resolveUri(selectedItem.uri);
      const dstPath = toPath(newUri);
      await RNFS.moveFile(srcPath, dstPath);
      try {
        const sourceFilename = decodeURIComponent(selectedItem.uri.split('/').pop() ?? '');
        const allAssets = await MediaLibrary.getAssetsAsync({ first: 5000, mediaType: ['photo', 'video', 'unknown'] });
        const ghost = allAssets.assets.find((a: any) => a.filename === sourceFilename && toPath(a.uri) === srcPath);
        if (ghost) await MediaLibrary.deleteAssetsAsync([ghost]);
      } catch {}
      await removeFavourite(selectedItem.uri);
      await addFavourite({ name: renameValue.trim(), uri: newUri });
      closeSheet();
    } catch (e: any) {
      console.log('Rename error:', e);
      Alert.alert('Rename failed', 'Could not rename this file.');
    }
  }

  async function openItem(item: FavouriteItem) {
    await addRecent({ name: item.name, uri: item.uri, openedAt: Date.now() });
    if (isImageFile(item.name)) {
      router.push({ pathname: '/viewer', params: { uri: item.uri, name: item.name } });
      return;
    }
    try {
      await Sharing.shareAsync(item.uri, { mimeType: getMimeType(item.name), dialogTitle: item.name });
    } catch (e) { console.log('Open error:', e); }
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

  async function handleMoveToVault() {
    if (!selectedItem) return;
    Alert.alert('Move to Vault', `Move "${selectedItem.name}" to your Secure Vault?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Move to Vault', onPress: async () => {
        closeSheet();
        const ok = await addToVault(selectedItem.uri, selectedItem.name);
        if (ok) { await removeFavourite(selectedItem.uri); }
        else Alert.alert('Error', 'Could not move file to Vault. Try again.');
      }},
    ]);
  }

  async function handleRemove() {
    if (!selectedItem) return;
    Alert.alert('Remove from Favourites', `Remove "${selectedItem.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        closeSheet();
        await removeFavourite(selectedItem.uri);
      }},
    ]);
  }

  async function handleDelete() {
    if (!selectedItem) return;
    Alert.alert('Delete file', `Delete "${selectedItem.name}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        closeSheet();
        try {
          const assets = await MediaLibrary.getAssetsAsync({ first: 1000 });
          const match = assets.assets.find(a => selectedItem.uri.includes(a.filename));
          if (match) { await MediaLibrary.deleteAssetsAsync([match]); }
          else { const f = new FileSystem.File(selectedItem.uri); f.delete(); }
          await removeFavourite(selectedItem.uri);
        } catch { Alert.alert('Error', 'Could not delete file.'); }
      }},
    ]);
  }

  function renderItem({ item }: { item: FavouriteItem }) {
    const color = getFileColor(item.name);
    const ext = item.name.split('.').pop()?.toUpperCase() ?? '?';
    return (
      <TouchableOpacity
        style={styles.row}
        onPress={() => openItem(item)}
        onLongPress={() => openSheet(item)}
        activeOpacity={0.7}
      >
        <View style={[styles.icon, { backgroundColor: color + '22', overflow: 'hidden' }]}>
          {isImageFile(item.name) ? (
            <Image source={{ uri: item.uri }} style={styles.thumb} resizeMode="cover" />
          ) : (
            <Text style={[styles.ext, { color }]}>{ext.slice(0, 4)}</Text>
          )}
        </View>
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.meta}>{ext} file</Text>
        </View>
        <TouchableOpacity onPress={() => openSheet(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-forward" size={16} color="#D3D1C7" />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#111" />
        </TouchableOpacity>
        <Text style={styles.title}>Favourites</Text>
        <View style={{ width: 40 }} />
      </View>

      {favourites.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="heart-outline" size={48} color="#D3D1C7" />
          <Text style={styles.emptyTitle}>No favourites yet</Text>
          <Text style={styles.emptySub}>Long press any file and tap "Add to Favourites"</Text>
        </View>
      ) : (
        <FlatList
          data={favourites}
          keyExtractor={item => item.uri}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <Text style={styles.count}>{favourites.length} favourite{favourites.length !== 1 ? 's' : ''}</Text>
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
                <View style={[styles.sheetIcon, { backgroundColor: getFileColor(selectedItem?.name ?? '') + '22', overflow: 'hidden' }]}>
                  {isImageFile(selectedItem?.name ?? '') ? (
                    <Image source={{ uri: selectedItem?.uri }} style={styles.sheetThumb} resizeMode="cover" />
                  ) : (
                    <Text style={[styles.ext, { color: getFileColor(selectedItem?.name ?? '') }]}>
                      {selectedItem?.name.split('.').pop()?.toUpperCase().slice(0, 4)}
                    </Text>
                  )}
                </View>
                <View style={styles.sheetInfo}>
                  <Text style={styles.sheetName} numberOfLines={2}>{selectedItem?.name}</Text>
                  <Text style={styles.sheetMeta}>{fileSize}</Text>
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
              <TouchableOpacity style={styles.sheetAction} onPress={() => {
                closeSheet();
                const location = selectedItem?.uri.replace('file:///storage/emulated/0/', '').split('/').slice(0, -1).join('/') || 'Storage';
                Alert.alert(selectedItem?.name ?? '', [
                  `Size: ${fileSize ?? 'Unknown'}`,
                  `Type: ${selectedItem?.name.split('.').pop()?.toUpperCase()} file`,
                  `Location: /${location}`,
                ].join('\n'));
              }}>
                <Ionicons name="information-circle-outline" size={20} color="#111" />
                <Text style={styles.sheetActionText}>Info</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.sheetAction} onPress={handleRemove}>
                <Ionicons name="heart-dislike-outline" size={20} color="#E24B4A" />
                <Text style={[styles.sheetActionText, { color: '#E24B4A' }]}>Remove from Favourites</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.sheetAction} onPress={handleDelete}>
                <Ionicons name="trash-outline" size={20} color="#E24B4A" />
                <Text style={[styles.sheetActionText, { color: '#E24B4A' }]}>Delete file</Text>
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
                  setPickerPath(up); loadPickerDir(up);
                }
              }}
              style={styles.backBtn}
            >
              <Ionicons name="arrow-back" size={22} color="#111" />
            </TouchableOpacity>
            <Text style={styles.title}>{pickerMode === 'copy' ? 'Copy to...' : 'Move to...'}</Text>
            <View style={{ width: 40 }} />
          </View>
          <Text style={{ fontSize: 12, color: '#888780', paddingHorizontal: 16, paddingBottom: 8 }}>
            {(() => { try { return decodeURIComponent(pickerPath.replace('file:///storage/emulated/0/', 'Storage/')); } catch { return pickerPath.replace('file:///storage/emulated/0/', 'Storage/'); } })()}
          </Text>
          {pickerLoading ? (
            <View style={styles.centered}><ActivityIndicator color="#185FA5" /></View>
          ) : pickerItems.length === 0 ? (
            <View style={styles.centered}><Text style={styles.emptyTitle}>No folders here</Text></View>
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
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#111' },
  emptySub: { fontSize: 13, color: '#888780', textAlign: 'center', lineHeight: 20 },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
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
