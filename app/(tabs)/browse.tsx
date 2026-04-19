import { useState, useEffect, useRef } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity, FlatList,
  ActivityIndicator, Image, Modal, TextInput, Alert,
  Animated, Pressable, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getMimeType, isImageFile } from '@/utils/files';
import { addRecent } from '@/hooks/useRecents';
import * as MediaLibrary from 'expo-media-library';
import * as IntentLauncher from 'expo-intent-launcher';
import { useVault } from '@/hooks/useVault';

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

export default function BrowseScreen() {
  const [currentPath, setCurrentPath] = useState(ROOT_PATH);
  const [items, setItems] = useState<FileItem[]>([]);
  const [breadcrumbs, setBreadcrumbs] = useState<{ name: string; path: string }[]>([
    { name: 'Storage', path: ROOT_PATH },
  ]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<FileItem | null>(null);
  const { addToVault, vaultDir } = useVault();
  const [showSheet, setShowSheet] = useState(false);
  const [showRename, setShowRename] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [fileSize, setFileSize] = useState<string | null>(null);
  const sheetAnim = useRef(new Animated.Value(400)).current;
  const router = useRouter();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    loadDirectory(currentPath);
  }, [currentPath]);

  function openSheet(item: FileItem) {
    setSelectedItem(item);
    setFileSize(null);
    setShowRename(false);
    setRenameValue('');
    setShowSheet(true);
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
          name: item instanceof FileSystem.File
            ? item.name
            : item.uri.split('/').filter(Boolean).pop() ?? '',
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
      await Sharing.shareAsync(selectedItem.uri, {
        mimeType: getMimeType(selectedItem.name),
        dialogTitle: selectedItem.name,
      });
    } catch (e) {
      console.log('Share error:', e);
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

  async function handleRename() {
    if (!selectedItem || !renameValue.trim()) return;
    try {
      const uri = selectedItem.uri.endsWith('/')
        ? selectedItem.uri.slice(0, -1)
        : selectedItem.uri;
      const parentPath = uri.substring(0, uri.lastIndexOf('/') + 1);
      const newUri = parentPath + renameValue.trim();
      if (selectedItem.isDirectory) {
        const src = new FileSystem.Directory(selectedItem.uri);
        const dst = new FileSystem.Directory(newUri);
        src.move(dst);
      } else {
        const src = new FileSystem.File(selectedItem.uri);
        const dst = new FileSystem.File(newUri);
        src.move(dst);
      }
      closeSheet();
      await loadDirectory(currentPath);
    } catch (e) {
      console.log('Rename error:', e);
      Alert.alert(
        'Permission needed',
        'AskFiles needs full storage access to rename files. Tap "Open Settings", enable "Allow access to manage all files", then try again.',
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
        {item.isDirectory && (
          <Ionicons name="chevron-forward" size={16} color="#D3D1C7" />
        )}
      </TouchableOpacity>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Browse</Text>
      </View>

      <FlatList
        horizontal
        data={breadcrumbs}
        keyExtractor={(_, i) => i.toString()}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.breadcrumbContainer}
        renderItem={({ item, index }) => (
          <TouchableOpacity style={styles.breadcrumbItem} onPress={() => navigateToBreadcrumb(index)}>
            <Text style={[
              styles.breadcrumbText,
              index === breadcrumbs.length - 1 && styles.breadcrumbActive,
            ]}>
              {item.name}
            </Text>
            {index < breadcrumbs.length - 1 && (
              <Text style={styles.breadcrumbSep}> / </Text>
            )}
          </TouchableOpacity>
        )}
      />

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
                    {!selectedItem?.isDirectory && (
                      <TouchableOpacity style={styles.sheetAction} onPress={handleMoveToVault}>
                        <Ionicons name="shield-checkmark-outline" size={20} color="#185FA5" />
                        <Text style={[styles.sheetActionText, { color: '#185FA5' }]}>Move to Vault</Text>
                      </TouchableOpacity>
                    )}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  title: { fontSize: 26, fontWeight: '500', color: '#111', letterSpacing: -0.5 },
  breadcrumbContainer: { paddingHorizontal: 16, paddingVertical: 8 },
  breadcrumbItem: { flexDirection: 'row', alignItems: 'center' },
  breadcrumbText: { fontSize: 13, color: '#888780' },
  breadcrumbActive: { color: '#185FA5', fontWeight: '500' },
  breadcrumbSep: { fontSize: 13, color: '#D3D1C7' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 14, color: '#888780' },
  listContent: { paddingHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: '#F1EFE8' },
  fileIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12, overflow: 'hidden' },
  thumbnail: { width: 40, height: 40, borderRadius: 10 },
  extLabel: { fontSize: 9, fontWeight: '500' },
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
});
