import { useState } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity, FlatList,
  ActivityIndicator, Alert, Image,
} from 'react-native';
import RNFS from 'react-native-fs';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import { isImageFile } from '@/utils/files';

interface LargeFile {
  name: string;
  uri: string;
  size: number;
}

const SCAN_DIRS = [
  'file:///storage/emulated/0/Download/',
  'file:///storage/emulated/0/Documents/',
  'file:///storage/emulated/0/Pictures/',
  'file:///storage/emulated/0/Movies/',
  'file:///storage/emulated/0/DCIM/',
  'file:///storage/emulated/0/Music/',
  'file:///storage/emulated/0/Android/media/',
];

const SIZE_GROUPS = [
  { label: 'Over 75 MB',  min: 75 * 1024 * 1024, max: Infinity },
  { label: '51 – 75 MB',  min: 51 * 1024 * 1024, max: 75 * 1024 * 1024 },
  { label: '25 – 50 MB',  min: 25 * 1024 * 1024, max: 51 * 1024 * 1024 },
];

function formatSize(bytes: number): string {
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + ' GB';
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
  return (bytes / 1024).toFixed(1) + ' KB';
}

function getFileColor(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic'].includes(ext ?? '')) return '#185FA5';
  if (['mp4', 'mkv', 'avi', 'mov', 'webm'].includes(ext ?? '')) return '#993C1D';
  if (['pdf', 'doc', 'docx', 'txt', 'xls', 'xlsx'].includes(ext ?? '')) return '#534AB7';
  if (['mp3', 'wav', 'aac', 'flac', 'm4a'].includes(ext ?? '')) return '#854F0B';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext ?? '')) return '#3B6D11';
  if (['apk'].includes(ext ?? '')) return '#A32D2D';
  return '#5F5E5A';
}

async function scanDir(path: string, results: LargeFile[], minSize: number) {
  try {
    const uri = path.endsWith('/') ? path : path + '/';
    const dir = new FileSystem.Directory(uri);
    const contents = dir.list();
    for (const item of contents) {
      if (item instanceof FileSystem.File) {
        const size = item.size ?? 0;
        if (!item.name.startsWith('.') && size >= minSize) {
          results.push({ name: item.name, uri: item.uri, size });
        }
      } else if (item instanceof FileSystem.Directory) {
        await scanDir(item.uri, results, minSize);
      }
    }
  } catch {}
}

export default function LargeFilesScreen() {
  const router = useRouter();
  const [files, setFiles] = useState<LargeFile[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function scan() {
    setScanning(true);
    setScanned(false);
    setFiles([]);
    await new Promise(r => setTimeout(r, 50));
    try {
      const results: LargeFile[] = [];
      const STANDARD_ROOT_DIRS = ['Download', 'Documents', 'Pictures', 'Movies', 'Music', 'DCIM', 'Recordings', 'Android'];
      const dynamicDirs = [...SCAN_DIRS];
      try {
        const rootItems = await RNFS.readDir('/storage/emulated/0/');
        for (const item of rootItems) {
          if (!item.isDirectory()) continue;
          if (item.name.startsWith('.')) continue;
          if (STANDARD_ROOT_DIRS.includes(item.name)) continue;
          dynamicDirs.push(`file://${item.path}/`);
        }
      } catch {}
      for (const dir of dynamicDirs) {
        await scanDir(dir, results, 25 * 1024 * 1024);
      }
      results.sort((a, b) => b.size - a.size);
      setFiles(results);
    } catch (e) {
      console.log('Scan error:', e);
    } finally {
      setScanning(false);
      setScanned(true);
    }
  }

  async function handleDelete(file: LargeFile) {
    Alert.alert(
      'Delete file',
      `Delete "${file.name}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            setDeleting(file.uri);
            try {
              const assets = await MediaLibrary.getAssetsAsync({ first: 1000 });
              const match = assets.assets.find(a => file.uri.includes(a.filename));
              if (match) { await MediaLibrary.deleteAssetsAsync([match]); }
              else { const f = new FileSystem.File(file.uri); f.delete(); }
              setFiles(prev => prev.filter(f => f.uri !== file.uri));
            } catch (e) {
              console.log('Delete error:', e);
              Alert.alert('Error', 'Could not delete file.');
            } finally {
              setDeleting(null);
            }
          },
        },
      ]
    );
  }

  const grouped: { label: string; data: LargeFile[] }[] = [];
  for (const group of SIZE_GROUPS) {
    const inGroup = files.filter(f => f.size >= group.min && f.size < group.max);
    if (inGroup.length > 0) {
      grouped.push({ label: group.label, data: inGroup });
    }
  }

  // Flatten into FlatList-friendly items with section headers
  type ListItem =
    | { type: 'header'; label: string; key: string }
    | { type: 'file'; file: LargeFile; key: string };

  const flatData: ListItem[] = [];
  for (const group of grouped) {
    flatData.push({ type: 'header', label: group.label, key: `header-${group.label}` });
    for (const file of group.data) {
      flatData.push({ type: 'file', file, key: file.uri });
    }
  }

  const totalSize = files.reduce((sum, f) => sum + f.size, 0);

  function renderFile(file: LargeFile) {
    const color = getFileColor(file.name);
    const ext = file.name.split('.').pop()?.toUpperCase() ?? '?';
    return (
      <View key={file.uri} style={styles.row}>
        <View style={[styles.fileIcon, { backgroundColor: color + '22', overflow: 'hidden' }]}>
          {isImageFile(file.name) ? (
            <Image source={{ uri: file.uri }} style={styles.thumbnail} resizeMode="cover" />
          ) : (
            <Text style={[styles.extLabel, { color }]}>{ext.slice(0, 4)}</Text>
          )}
        </View>
        <View style={styles.fileInfo}>
          <Text style={styles.fileName} numberOfLines={1}>{file.name}</Text>
          <Text style={styles.fileMeta}>
            {formatSize(file.size)} · {(() => { try { return decodeURIComponent(file.uri.replace('file:///storage/emulated/0/', '').split('/').slice(0, -1).join('/')) || 'Storage'; } catch { return file.uri.replace('file:///storage/emulated/0/', '').split('/').slice(0, -1).join('/') || 'Storage'; } })()}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.deleteBtn, deleting === file.uri && { opacity: 0.5 }]}
          onPress={() => handleDelete(file)}
          disabled={deleting === file.uri}
        >
          {deleting === file.uri ? (
            <ActivityIndicator size="small" color="#E24B4A" />
          ) : (
            <Ionicons name="trash-outline" size={18} color="#E24B4A" />
          )}
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#111" />
        </TouchableOpacity>
        <Text style={styles.title}>Large Files</Text>
        <View style={{ width: 40 }} />
      </View>

      {!scanned && !scanning && (
        <View style={styles.centered}>
          <View style={styles.startIcon}>
            <Ionicons name="folder-open-outline" size={40} color="#993C1D" />
          </View>
          <Text style={styles.startTitle}>Find large files</Text>
          <Text style={styles.startSub}>Scans your storage for files over 5 MB, sorted by size.</Text>
          <TouchableOpacity style={styles.scanBtn} onPress={scan} activeOpacity={0.85}>
            <Ionicons name="search-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.scanBtnText}>Start Scan</Text>
          </TouchableOpacity>
        </View>
      )}

      {scanning && (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#993C1D" />
          <Text style={styles.scanningText}>Scanning your storage...</Text>
          <Text style={styles.scanningSubText}>This may take a moment</Text>
        </View>
      )}

      {scanned && !scanning && (
        <FlatList
          data={flatData}
          keyExtractor={item => item.key}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          getItemLayout={(_, index) => ({ length: 61, offset: 61 * index, index })}
          ListHeaderComponent={
            <View style={styles.summaryCard}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryCount}>{files.length}</Text>
                <Text style={styles.summaryLabel}>large files</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryCount, { color: '#993C1D' }]}>{formatSize(totalSize)}</Text>
                <Text style={styles.summaryLabel}>total size</Text>
              </View>
              <TouchableOpacity style={styles.rescanBtn} onPress={scan}>
                <Text style={styles.rescanText}>Scan again</Text>
              </TouchableOpacity>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.centered}>
              <Ionicons name="checkmark-circle-outline" size={56} color="#2E7D32" />
              <Text style={styles.cleanTitle}>No large files found!</Text>
              <Text style={styles.cleanSub}>Your storage looks clean.</Text>
            </View>
          }
          renderItem={({ item }) => {
            if (item.type === 'header') {
              return <Text style={styles.groupLabel}>{item.label}</Text>;
            }
            return renderFile(item.file);
          }}
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
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  startIcon: { width: 88, height: 88, borderRadius: 24, backgroundColor: '#FAECE7', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  startTitle: { fontSize: 22, fontWeight: '600', color: '#111', letterSpacing: -0.5 },
  startSub: { fontSize: 14, color: '#888780', textAlign: 'center', lineHeight: 20 },
  scanBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#993C1D', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32, marginTop: 8 },
  scanBtnText: { fontSize: 15, fontWeight: '600', color: '#fff' },
  scanningText: { fontSize: 16, fontWeight: '500', color: '#111', marginTop: 16 },
  scanningSubText: { fontSize: 13, color: '#888780' },
  cleanTitle: { fontSize: 20, fontWeight: '600', color: '#111' },
  cleanSub: { fontSize: 14, color: '#888780' },
  listContent: { paddingHorizontal: 16, paddingBottom: 32 },
  summaryCard: { backgroundColor: '#FAFAF8', borderRadius: 16, padding: 16, marginBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 8 },
  summaryRow: { alignItems: 'center', flex: 1, minWidth: 0 },
  summaryCount: { fontSize: 22, fontWeight: '700', color: '#111', letterSpacing: -0.5 },
  summaryLabel: { fontSize: 12, color: '#888780', marginTop: 2 },
  summaryDivider: { width: 1, height: 40, backgroundColor: '#F1EFE8' },
  rescanBtn: { paddingVertical: 8, paddingHorizontal: 16 },
  rescanText: { fontSize: 13, color: '#993C1D' },
  groupLabel: { fontSize: 11, fontWeight: '600', color: '#888780', letterSpacing: 0.5, textTransform: 'uppercase', marginTop: 16, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: '#F1EFE8' },
  fileIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  thumbnail: { width: 40, height: 40 },
  extLabel: { fontSize: 9, fontWeight: '500' },
  fileInfo: { flex: 1 },
  fileName: { fontSize: 14, fontWeight: '500', color: '#111', marginBottom: 2 },
  fileMeta: { fontSize: 11, color: '#888780' },
  deleteBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
});
