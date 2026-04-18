import { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, FlatList, ActivityIndicator, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getMimeType, isImageFile } from '@/utils/files';

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

export default function BrowseScreen() {
  const [currentPath, setCurrentPath] = useState(ROOT_PATH);
  const [items, setItems] = useState<FileItem[]>([]);
  const [breadcrumbs, setBreadcrumbs] = useState<{ name: string; path: string }[]>([
    { name: 'Storage', path: ROOT_PATH },
  ]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    loadDirectory(currentPath);
  }, [currentPath]);

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

  function renderItem({ item }: { item: FileItem }) {
    const color = item.isDirectory ? '#BA7517' : getFileColor(item.name);
    const ext = item.isDirectory ? null : (item.name.split('.').pop()?.toUpperCase() ?? '?');

    return (
      <TouchableOpacity style={styles.row} onPress={() => navigateTo(item)} activeOpacity={0.6}>
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
});
