import { useState, useRef, useCallback } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity, FlatList,
  ActivityIndicator, Alert, Image, Modal, Animated,
  Pressable, PanResponder,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { useVault, VaultFile } from '@/hooks/useVault';
import RNFS from 'react-native-fs';
import { isImageFile, getMimeType } from '@/utils/files';

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
  if (['pdf', 'doc', 'docx', 'txt', 'xls', 'xlsx'].includes(ext ?? '')) return '#534AB7';
  return '#5F5E5A';
}

export default function VaultScreen() {
  const router = useRouter();
  const { files, loading, authenticated, authError, authenticate, deleteFromVault, lock } = useVault();
  const [busy, setBusy] = useState(false);
  const [selectedFile, setSelectedFile] = useState<VaultFile | null>(null);
  const [showSheet, setShowSheet] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerPath, setPickerPath] = useState('file:///storage/emulated/0/');
  const [pickerItems, setPickerItems] = useState<{ name: string; uri: string }[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const pendingFile = useRef<VaultFile | null>(null);
  const sheetAnim = useRef(new Animated.Value(400)).current;
  const insets = useSafeAreaInsets();

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy > 10,
      onPanResponderMove: (_, g) => { if (g.dy > 0) sheetAnim.setValue(g.dy); },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 80 || g.vy > 0.5) {
          Animated.timing(sheetAnim, { toValue: 400, duration: 200, useNativeDriver: true })
            .start(() => { setShowSheet(false); setSelectedFile(null); });
        } else {
          Animated.spring(sheetAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }).start();
        }
      },
    })
  ).current;

  const ROOT_PATH = 'file:///storage/emulated/0/';

  function toPath(uri: string): string {
    try { return decodeURIComponent(uri.replace('file://', '')); } catch { return uri.replace('file://', ''); }
  }

  async function loadPickerDir(path: string) {
    setPickerLoading(true);
    try {
      const dir = new FileSystem.Directory(path.endsWith('/') ? path : path + '/');
      const contents = dir.list();
      const folders = contents
        .filter((item: any) => item instanceof FileSystem.Directory)
        .map((item: any) => {
          const raw = item.uri.split('/').filter(Boolean).pop() ?? '';
          let name = raw;
          try { name = decodeURIComponent(raw); } catch {}
          return { name, uri: item.uri };
        })
        .filter((f: any) => !f.name.startsWith('.'))
        .sort((a: any, b: any) => a.name.localeCompare(b.name));
      setPickerItems(folders);
    } catch { setPickerItems([]); }
    finally { setPickerLoading(false); }
  }

  function openMovePicker(file: VaultFile) {
    pendingFile.current = file;
    setPickerPath(ROOT_PATH);
    loadPickerDir(ROOT_PATH);
    setShowPicker(true);
    closeSheet();
  }

  async function handleMoveOut() {
    const file = pendingFile.current;
    if (!file) return;
    const destDir = pickerPath.endsWith('/') ? pickerPath : pickerPath + '/';
    const destUri = destDir + file.name;
    try {
      const dst = toPath(destUri);
      const exists = await RNFS.exists(dst);
      if (exists) {
        setShowPicker(false);
        Alert.alert('File already exists', `"${file.name}" already exists in this folder.`);
        return;
      }
      await RNFS.copyFile(toPath(file.uri), dst);
      setShowPicker(false);
      await deleteFromVault(file);
      Alert.alert('Moved', `"${file.name}" moved out of Vault successfully.`);
    } catch (e) {
      console.log('Move out error:', e);
      Alert.alert('Error', 'Could not move file out of Vault.');
    }
  }

  function openSheet(file: VaultFile) {
    setSelectedFile(file);
    setShowSheet(true);
    Animated.spring(sheetAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }).start();
  }

  function closeSheet() {
    Animated.timing(sheetAnim, { toValue: 400, duration: 200, useNativeDriver: true })
      .start(() => { setShowSheet(false); setSelectedFile(null); });
  }

  async function handleAuth() {
    await authenticate();
  }

  async function openFile(file: VaultFile) {
    if (isImageFile(file.name)) {
      router.push({ pathname: '/viewer', params: { uri: file.uri, name: file.name, fromVault: 'true' } });
      return;
    }
    try {
      await Sharing.shareAsync(file.uri, {
        mimeType: getMimeType(file.name),
        dialogTitle: file.name,
      });
    } catch {}
  }

  async function handleShare(file: VaultFile) {
    closeSheet();
    try {
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
        await Sharing.shareAsync(cacheUri, { dialogTitle: file.name, mimeType: 'image/jpeg' });
      } else {
        await Sharing.shareAsync(file.uri, { mimeType: getMimeType(file.name), dialogTitle: file.name });
      }
    } catch (e) {
      console.log('Share error:', e);
    }
  }

  async function handleDelete(file: VaultFile) {
    closeSheet();
    Alert.alert(
      'Delete permanently',
      `Delete "${file.name}" forever? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            await deleteFromVault(file);
            setBusy(false);
          },
        },
      ]
    );
  }

  function renderFile({ item }: { item: VaultFile }) {
    const color = getFileColor(item.name);
    const ext = item.name.split('.').pop()?.toUpperCase() ?? '?';
    return (
      <TouchableOpacity style={styles.row} onPress={() => openFile(item)} activeOpacity={0.7}>
        <View style={[styles.icon, { backgroundColor: color + '22', overflow: 'hidden' }]}>
          {isImageFile(item.name) ? (
            <Image source={{ uri: item.uri }} style={styles.thumb} resizeMode="cover" />
          ) : (
            <Text style={[styles.ext, { color }]}>{ext.slice(0, 4)}</Text>
          )}
        </View>
        <View style={styles.info}>
          <Text style={styles.fileName} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.fileMeta}>{formatSize(item.size)}</Text>
        </View>
        <TouchableOpacity style={styles.menuBtn} onPress={() => openSheet(item)}>
          <Ionicons name="ellipsis-vertical" size={16} color="#888780" />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  }

  // Locked state
  if (!authenticated) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#111" />
          </TouchableOpacity>
          <Text style={styles.title}>Vault</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.lockScreen}>
          <View style={styles.lockIcon}>
            <Ionicons name="lock-closed" size={40} color="#185FA5" />
          </View>
          <Text style={styles.lockTitle}>Secure Vault</Text>
          <Text style={styles.lockSub}>Your files are protected. Authenticate to access your vault.</Text>
          {authError && <Text style={styles.errorText}>{authError}</Text>}
          <TouchableOpacity style={styles.authBtn} onPress={handleAuth} activeOpacity={0.85}>
            <Ionicons name="finger-print-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.authBtnText}>Unlock with Biometrics</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#111" />
        </TouchableOpacity>
        <Text style={styles.title}>Vault</Text>
        <TouchableOpacity onPress={lock} style={styles.backBtn}>
          <Ionicons name="lock-closed-outline" size={22} color="#185FA5" />
        </TouchableOpacity>
      </View>

      {busy && (
        <View style={styles.busyBanner}>
          <ActivityIndicator size="small" color="#185FA5" />
          <Text style={styles.busyText}>Working...</Text>
        </View>
      )}

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color="#185FA5" />
        </View>
      ) : files.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="shield-checkmark-outline" size={48} color="#D3D1C7" />
          <Text style={styles.emptyTitle}>Vault is empty</Text>
          <Text style={styles.emptySub}>Move files here from Browse using long press → Move to Vault</Text>
        </View>
      ) : (
        <FlatList
          data={files}
          keyExtractor={item => item.uri}
          renderItem={renderFile}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <Text style={styles.count}>{files.length} file{files.length !== 1 ? 's' : ''} secured</Text>
          }
        />
      )}

      <Modal visible={showSheet} transparent animationType="none" onRequestClose={closeSheet}>
        <Pressable style={styles.overlay} onPress={closeSheet}>
          <Animated.View
            style={[styles.sheet, { transform: [{ translateY: sheetAnim }], paddingBottom: insets.bottom + 16 }]}
            {...panResponder.panHandlers}
          >
            <Pressable>
              <View style={styles.sheetHandle} />
              <View style={styles.sheetHeader}>
                <View style={[styles.sheetIcon, { backgroundColor: selectedFile ? getFileColor(selectedFile.name) + '22' : '#F1EFE8', overflow: 'hidden' }]}>
                  {selectedFile && isImageFile(selectedFile.name) ? (
                    <Image source={{ uri: selectedFile.uri }} style={styles.sheetThumb} resizeMode="cover" />
                  ) : (
                    <Text style={[styles.sheetExt, { color: selectedFile ? getFileColor(selectedFile.name) : '#888780' }]}>
                      {selectedFile?.name.split('.').pop()?.toUpperCase().slice(0, 4)}
                    </Text>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sheetFileName} numberOfLines={2}>{selectedFile?.name}</Text>
                  <Text style={styles.sheetFileMeta}>{selectedFile ? formatSize(selectedFile.size) : ''}</Text>
                </View>
              </View>

              <View style={styles.sheetDivider} />

              <TouchableOpacity style={styles.sheetAction} onPress={() => { closeSheet(); selectedFile && openFile(selectedFile); }}>
                <Ionicons name="open-outline" size={20} color="#111" />
                <Text style={styles.sheetActionText}>Open</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.sheetAction} onPress={() => selectedFile && handleShare(selectedFile)}>
                <Ionicons name="share-outline" size={20} color="#111" />
                <Text style={styles.sheetActionText}>Share</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.sheetAction} onPress={() => {
                if (!selectedFile) return;
                closeSheet();
                const ext = selectedFile.name.split('.').pop()?.toUpperCase() ?? 'FILE';
                Alert.alert(
                  selectedFile.name,
                  `Size: ${formatSize(selectedFile.size)}\nType: ${ext} file\nLocation: Secure Vault`
                );
              }}>
                <Ionicons name="information-circle-outline" size={20} color="#111" />
                <Text style={styles.sheetActionText}>Info</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.sheetAction} onPress={() => selectedFile && openMovePicker(selectedFile)}>
                <Ionicons name="arrow-redo-outline" size={20} color="#111" />
                <Text style={styles.sheetActionText}>Move out of Vault</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.sheetAction} onPress={() => selectedFile && handleDelete(selectedFile)}>
                <Ionicons name="trash-outline" size={20} color="#E24B4A" />
                <Text style={[styles.sheetActionText, { color: '#E24B4A' }]}>Delete permanently</Text>
              </TouchableOpacity>

              <View style={styles.sheetDivider} />

              <TouchableOpacity style={styles.sheetAction} onPress={closeSheet}>
                <Ionicons name="close-outline" size={20} color="#888780" />
                <Text style={[styles.sheetActionText, { color: '#888780' }]}>Cancel</Text>
              </TouchableOpacity>
            </Pressable>
          </Animated.View>
        </Pressable>
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
            <Text style={styles.title} numberOfLines={1}>Move to...</Text>
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
            <TouchableOpacity style={styles.pickerPasteBtn} onPress={handleMoveOut}>
              <Ionicons name="checkmark" size={18} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.pickerPasteText}>Move here</Text>
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
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 32 },

  lockScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 12 },
  lockIcon: { width: 88, height: 88, borderRadius: 24, backgroundColor: '#EBF3FC', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  lockTitle: { fontSize: 22, fontWeight: '600', color: '#111', letterSpacing: -0.5 },
  lockSub: { fontSize: 14, color: '#888780', textAlign: 'center', lineHeight: 20 },
  errorText: { fontSize: 13, color: '#E24B4A', textAlign: 'center' },
  authBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#185FA5', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 28, marginTop: 8 },
  authBtnText: { fontSize: 15, fontWeight: '600', color: '#fff' },

  busyBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#EBF3FC' },
  busyText: { fontSize: 13, color: '#185FA5' },

  list: { paddingHorizontal: 16, paddingBottom: 24 },
  count: { fontSize: 11, color: '#888780', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: '#F1EFE8' },
  icon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  thumb: { width: 40, height: 40 },
  ext: { fontSize: 9, fontWeight: '500' },
  info: { flex: 1 },
  fileName: { fontSize: 14, fontWeight: '500', color: '#111', marginBottom: 2 },
  fileMeta: { fontSize: 11, color: '#888780' },
  menuBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: '500', color: '#111' },
  emptySub: { fontSize: 13, color: '#888780', textAlign: 'center', lineHeight: 18 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 16 },
  sheetHandle: { width: 36, height: 4, backgroundColor: '#D3D1C7', borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 16 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 12 },
  sheetIcon: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  sheetThumb: { width: 44, height: 44 },
  sheetExt: { fontSize: 9, fontWeight: '500' },
  sheetFileName: { fontSize: 14, fontWeight: '500', color: '#111', marginBottom: 2 },
  sheetFileMeta: { fontSize: 12, color: '#888780' },
  sheetDivider: { height: 0.5, backgroundColor: '#F1EFE8', marginVertical: 8 },
  sheetAction: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 },
  sheetActionText: { fontSize: 15, color: '#111' },
  pickerFooter: { flexDirection: 'row', gap: 8, padding: 16, borderTopWidth: 0.5, borderTopColor: '#F1EFE8' },
  pickerCancelBtn: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: '#F1EFE8', alignItems: 'center' },
  pickerCancelText: { fontSize: 14, color: '#5F5E5A', fontWeight: '500' },
  pickerPasteBtn: { flex: 2, flexDirection: 'row', padding: 14, borderRadius: 12, backgroundColor: '#185FA5', alignItems: 'center', justifyContent: 'center' },
  pickerPasteText: { fontSize: 14, color: '#fff', fontWeight: '600' },
});
