import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, Modal, FlatList,
  ActivityIndicator, StyleSheet, TextInput, Alert,
  KeyboardAvoidingView, useWindowDimensions, Keyboard, Pressable
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/next';
import { countFolder, createDirectory } from 'file-reader';
import { useTheme } from '@/hooks/useTheme';
import { getFileColor, getFileIcon } from '@/utils/files';
import { getStorageVolumes } from '@/modules/storage-stats';
import * as Haptics from 'expo-haptics';

interface FolderItem {
  name: string;
  uri: string;
  isDirectory: boolean;
  count: number;
}

interface FolderPickerModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (folderPath: string) => void;
  defaultPath: string;
  defaultLabel: string;
  defaultSubLabel?: string;
  title?: string;
}

const ROOT = 'file:///storage/emulated/0/';

function toPath(uri: string): string {
  try { return decodeURIComponent(uri.replace('file://', '')); }
  catch { return uri.replace('file://', ''); }
}

export default function FolderPickerModal({
  visible,
  onClose,
  onSave,
  defaultPath,
  defaultLabel,
  defaultSubLabel = 'Default save location',
  title = 'Choose location',
}: FolderPickerModalProps) {
  const { colors } = useTheme();
  const [currentPath, setCurrentPath] = useState(ROOT);
  const [items, setItems] = useState<FolderItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [volumes, setVolumes] = useState<{ name: string; path: string; type: string }[]>([]);
  const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = useWindowDimensions();

useEffect(() => {
  getStorageVolumes().then(setVolumes);
}, []);

  // Reset to root when modal opens
  useEffect(() => {
    if (visible) {
      loadDir(ROOT);
      setShowNewFolder(false);
      setNewFolderName('');
    }
  }, [visible]);

  async function loadDir(path: string) {
    setLoading(true);
    try {
      const dir = new FileSystem.Directory(path);
      const contents = dir.list();

      const folders = await Promise.all(
        contents
          .filter(item => item instanceof FileSystem.Directory)
          .map(item => {
            const raw = item.uri.split('/').filter(Boolean).pop() ?? '';
            let name = raw;
            try { name = decodeURIComponent(raw); } catch {}
            return { name, uri: item.uri, isDirectory: true };
          })
          .filter(f => !f.name.startsWith('.'))
          .sort((a, b) => a.name.localeCompare(b.name))
          .map(async f => {
            let count = 0;
            try { count = await countFolder(toPath(f.uri), false); } catch {}
            return { ...f, count };
          })
      );

      const files: FolderItem[] = contents
        .filter(item => item instanceof FileSystem.File)
        .map(item => ({
          name: (() => { try { return decodeURIComponent(item.name); } catch { return item.name; } })(),
          uri: item.uri,
          isDirectory: false,
          count: 0,
        }))
        .filter(f => !f.name.startsWith('.'))
        .sort((a, b) => a.name.localeCompare(b.name));

      setItems([...folders, ...files]);
      setCurrentPath(path);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  function goBack() {
    const isAnyRoot = currentPath === ROOT || volumes.some(v => currentPath === `file://${v.path}/`);
    if (isAnyRoot) {
      onClose();
      return;
    }
    const parent = currentPath.endsWith('/') ? currentPath.slice(0, -1) : currentPath;
    const up = parent.substring(0, parent.lastIndexOf('/') + 1);
    loadDir(up);
  }

  function displayPath(): string {
    try {
      let path = currentPath;
      const sdVol = volumes.find(v => v.type === 'sdcard' && path.includes(v.path));
      if (sdVol) return decodeURIComponent(path.replace(`file://${sdVol.path}/`, `${sdVol.name}/`));
      return decodeURIComponent(path.replace('file:///storage/emulated/0/', 'Storage/'));
    } catch { return currentPath; }
  }

  return (
    <Modal visible={visible} transparent={false} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>

        {/* Header */}
        <View style={[styles.header, { backgroundColor: colors.background }]}>
          <TouchableOpacity onPress={goBack} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
          <View style={styles.backBtn} />
        </View>

        {/* Current path */}
        <Text style={[styles.pathText, { color: colors.textMuted }]} numberOfLines={1}>
          {displayPath()}
        </Text>

        {/* Volume switcher — only at root level */}
        {volumes.length > 1 && (
          <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 8, gap: 8 }}>
            {volumes.map(vol => {
              const volPath = `file://${vol.path}/`;
              const isActive = currentPath === volPath || (vol.type === 'internal' && currentPath === ROOT);
              return (
                <TouchableOpacity
                  key={vol.path}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: isActive ? colors.blue : colors.surface }}
                  onPress={() => {
                    const newPath = vol.type === 'internal' ? ROOT : `file://${vol.path}/`;
                    loadDir(newPath);
                  }}
                >
                  <Ionicons name={vol.type === 'sdcard' ? 'card-outline' : 'phone-portrait-outline'} size={14} color={isActive ? '#fff' : colors.textSecondary} />
                  <Text style={{ fontSize: 12, fontWeight: '500', color: isActive ? '#fff' : colors.textSecondary }}>{vol.name}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Default location shortcut */}
        <TouchableOpacity
          style={[styles.defaultBtn, { backgroundColor: colors.greenBg }]}
          onPress={() => onSave(defaultPath)}
          activeOpacity={0.8}
        >
          <Ionicons name="folder-outline" size={20} color={colors.green} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.defaultLabel, { color: colors.textPrimary }]}>{defaultLabel}</Text>
            <Text style={[styles.defaultSub, { color: colors.textMuted }]}>{defaultSubLabel}</Text>
          </View>
          <Ionicons name="checkmark-circle" size={18} color={colors.green} />
        </TouchableOpacity>

        {/* Folder/file list */}
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
            data={items}
            keyExtractor={item => item.uri}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }: { item: FolderItem }) => (
              <TouchableOpacity
                style={[styles.row, { borderBottomColor: colors.border }]}
                onPress={() => { if (item.isDirectory) loadDir(item.uri); }}
                activeOpacity={item.isDirectory ? 0.7 : 1}
              >
                <View style={[styles.icon, {
                  backgroundColor: item.isDirectory ? colors.amberTint : getFileColor(item.name) + '22'
                }]}>
                  <Ionicons
                    name={item.isDirectory ? 'folder' : getFileIcon(item.name) as any}
                    size={22}
                    color={item.isDirectory ? colors.amber : getFileColor(item.name)}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.itemName, { color: colors.textPrimary }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  {item.isDirectory && (
                    <Text style={[styles.itemCount, { color: colors.textMuted }]}>
                      {item.count} item{item.count !== 1 ? 's' : ''}
                    </Text>
                  )}
                </View>
                {item.isDirectory && (
                  <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                )}
              </TouchableOpacity>
            )}
          />
        )}

        {/* Save here footer */}
        <View style={[styles.footer, { borderTopColor: colors.border }]}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity
                style={[styles.newFolderBtn, { backgroundColor: colors.greenBg }]}
                onPress={() => setShowNewFolder(true)}
                activeOpacity={0.8}
              >
                <View style={{ position: 'relative' }}>
                  <Ionicons name="folder" size={28} color={colors.amber} />
                  <View style={{ position: 'absolute', bottom: -1, right: -3, width: 14, height: 14, borderRadius: 7, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="add" size={10} color="#fff" />
                  </View>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, { flex: 2, backgroundColor: colors.blue }]}
                onPress={() => onSave(toPath(currentPath))}
                activeOpacity={0.85}
              >
                <Ionicons name="checkmark" size={18} color="#fff" />
                <Text style={styles.saveBtnText}>Save here</Text>
              </TouchableOpacity>
            </View>
        </View>
        <Modal visible={showNewFolder} transparent animationType="fade" onRequestClose={() => { setShowNewFolder(false); setNewFolderName(''); }}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={undefined}>
          <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: SCREEN_WIDTH > SCREEN_HEIGHT ? SCREEN_WIDTH * 0.2 : 24, paddingBottom: SCREEN_WIDTH > SCREEN_HEIGHT ? 0 : SCREEN_HEIGHT * 0.3 }}
              onPress={() => { Keyboard.dismiss(); setShowNewFolder(false); setNewFolderName(''); }}>
              <Pressable style={{ backgroundColor: colors.card, borderRadius: 16, padding: 20, width: '100%' }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: colors.textPrimary }}>New Folder</Text>
                  <TouchableOpacity onPress={() => { Keyboard.dismiss(); setShowNewFolder(false); setNewFolderName(''); }}>
                    <Ionicons name="close" size={20} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>
                <TextInput
                  style={{ backgroundColor: colors.surface, borderRadius: 10, padding: 12, fontSize: 14, color: colors.textPrimary, marginBottom: 16 }}
                  value={newFolderName}
                  onChangeText={setNewFolderName}
                  placeholder="Folder name..."
                  placeholderTextColor={colors.textMuted}
                  autoFocus
                  autoCapitalize="none"
                  returnKeyType="done"
                  onSubmitEditing={async () => {
                    const name = newFolderName.trim();
                    if (!name) return;
                    const invalidChars = /[*\\:?"<>|]/;
                    if (invalidChars.test(name)) {
                      Alert.alert('Invalid name', 'Folder names cannot contain: * \\ : ? " < > |');
                      return;
                    }
                    const newPath = toPath(currentPath) + name;
                    setCreatingFolder(true);
                    try {
                      await createDirectory(newPath);
                      Keyboard.dismiss();
                      setShowNewFolder(false);
                      setNewFolderName('');
                      const newUri = currentPath.endsWith('/') ? currentPath + name + '/' : currentPath + '/' + name + '/';
                      await loadDir(newUri);
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    } catch {
                      Alert.alert('Error', 'Could not create folder.');
                    } finally {
                      setCreatingFolder(false);
                    }
                  }}
                />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity
                    style={{ flex: 1, padding: 12, borderRadius: 10, backgroundColor: colors.surface, alignItems: 'center' }}
                    onPress={() => { Keyboard.dismiss(); setShowNewFolder(false); setNewFolderName(''); }}
                  >
                    <Text style={{ fontSize: 14, color: colors.textSecondary }}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ flex: 1, padding: 12, borderRadius: 10, backgroundColor: newFolderName.trim() ? colors.blue : colors.textDisabled, alignItems: 'center' }}
                    onPress={async () => {
                      const name = newFolderName.trim();
                      if (!name) return;
                      const newPath = toPath(currentPath) + name;
                      setCreatingFolder(true);
                      try {
                        await createDirectory(newPath);
                        Keyboard.dismiss();
                        setShowNewFolder(false);
                        setNewFolderName('');
                        const newUri = currentPath.endsWith('/') ? currentPath + name + '/' : currentPath + '/' + name + '/';
                        await loadDir(newUri);
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                      } catch {
                        Alert.alert('Error', 'Could not create folder.');
                      } finally {
                        setCreatingFolder(false);
                      }
                    }}
                    disabled={!newFolderName.trim() || creatingFolder}
                  >
                    {creatingFolder
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Text style={{ fontSize: 14, color: '#fff', fontWeight: '500' }}>Create</Text>
                    }
                  </TouchableOpacity>
                </View>
              </Pressable>
            </Pressable>
          </KeyboardAvoidingView>
        </Modal>
        </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  title: { flex: 1, fontSize: 20, fontWeight: '500', textAlign: 'center', letterSpacing: -0.5 },
  pathText: { fontSize: 12, paddingHorizontal: 16, paddingBottom: 8 },
  defaultBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginBottom: 12, padding: 12, borderRadius: 10 },
  defaultLabel: { fontSize: 13, fontWeight: '600' },
  defaultSub: { fontSize: 11 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 13 },
  listContent: { paddingHorizontal: 16, paddingBottom: 100 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 0.5 },
  icon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  itemName: { fontSize: 14, fontWeight: '500' },
  itemCount: { fontSize: 11 },
  footer: { padding: 16, borderTopWidth: 0.5, flexShrink: 0 },
  saveBtn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  newFolderBtn: { width: 52, borderRadius: 12, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
});
