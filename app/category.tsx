import { useState, useEffect } from 'react';
import { StyleSheet, Text, View, FlatList, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { isImageFile, getMimeType } from '@/utils/files';
import { addRecent } from '@/hooks/useRecents';

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

export default function CategoryScreen() {
  const { category } = useLocalSearchParams<{ category: Category }>();
  const [items, setItems] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const config = CATEGORY_CONFIG[category ?? 'images'];

  useEffect(() => {
    loadCategory();
  }, [category]);

  async function loadCategory() {
    setLoading(true);
    try {
      if (category === 'images' || category === 'videos') {
        const mediaType = category === 'images' ? 'photo' : 'video';
        const all: MediaLibrary.Asset[] = [];
        let after: string | undefined;
        for (let page = 0; page < 50; page++) {
          const result = await MediaLibrary.getAssetsAsync({ mediaType, first: 100, after });
          all.push(...result.assets);
          if (!result.hasNextPage || !result.endCursor) break;
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
    } catch (e) {
      console.log('Open error:', e);
    }
  }

  function renderItem({ item }: { item: FileItem }) {
    const isImg = isImageFile(item.name);
    const ext = item.name.split('.').pop()?.toUpperCase() ?? '?';
    return (
      <TouchableOpacity style={styles.row} onPress={() => openItem(item)} activeOpacity={0.7}>
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
        <Ionicons name="chevron-forward" size={16} color="#D3D1C7" />
      </TouchableOpacity>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#111" />
        </TouchableOpacity>
        <Text style={styles.title}>{config.title}</Text>
        <View style={{ width: 40 }} />
      </View>
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={config.color} />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name={config.icon as any} size={40} color="#D3D1C7" />
          <Text style={styles.empty}>No {config.title.toLowerCase()} found</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={item => item.uri}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <Text style={styles.count}>{items.length} {config.title.toLowerCase()}</Text>
          }
        />
      )}
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
  count: { fontSize: 11, color: '#888780', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: '#F1EFE8' },
  icon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  thumb: { width: 40, height: 40 },
  ext: { fontSize: 9, fontWeight: '500' },
  info: { flex: 1 },
  name: { fontSize: 14, fontWeight: '500', color: '#111', marginBottom: 2 },
  meta: { fontSize: 11, color: '#888780' },
});
