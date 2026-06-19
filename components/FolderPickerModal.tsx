import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, Modal, FlatList,
  ActivityIndicator, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/next';
import { countFolder } from 'file-reader';
import { useTheme } from '@/hooks/useTheme';
import { getFileColor, getFileIcon } from '@/utils/files';

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

  // Reset to root when modal opens
  React.useEffect(() => {
    if (visible) {
      loadDir(ROOT);
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
    if (currentPath === ROOT) {
      onClose();
      return;
    }
    const parent = currentPath.endsWith('/') ? currentPath.slice(0, -1) : currentPath;
    const up = parent.substring(0, parent.lastIndexOf('/') + 1);
    loadDir(up);
  }

  function displayPath(): string {
    try {
      return decodeURIComponent(currentPath.replace('file:///storage/emulated/0/', 'Storage/'));
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
          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: colors.blue }]}
            onPress={() => onSave(toPath(currentPath))}
            activeOpacity={0.85}
          >
            <Ionicons name="checkmark" size={18} color="#fff" />
            <Text style={styles.saveBtnText}>Save here</Text>
          </TouchableOpacity>
        </View>

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
  footer: { padding: 16, borderTopWidth: 0.5 },
  saveBtn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
