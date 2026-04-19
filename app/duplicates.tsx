import { useState } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity, FlatList,
  ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useDuplicates, DuplicateGroup, DuplicateFile } from '@/hooks/useDuplicates';

function getFileColor(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic'].includes(ext ?? '')) return '#185FA5';
  if (['mp4', 'mkv', 'avi', 'mov', 'webm'].includes(ext ?? '')) return '#993C1D';
  if (['pdf', 'doc', 'docx', 'txt', 'xls', 'xlsx'].includes(ext ?? '')) return '#534AB7';
  if (['mp3', 'wav', 'aac', 'flac', 'm4a'].includes(ext ?? '')) return '#854F0B';
  return '#5F5E5A';
}

export default function DuplicatesScreen() {
  const router = useRouter();
  const { groups, scanning, scanned, totalWasted, scan, deleteFile, formatSize } = useDuplicates();
  const [deleting, setDeleting] = useState<string | null>(null);

  async function handleDelete(group: DuplicateGroup, file: DuplicateFile) {
    Alert.alert(
      'Delete duplicate',
      `Delete "${file.name}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(file.uri);
            await deleteFile(group.key, file.uri);
            setDeleting(null);
          },
        },
      ]
    );
  }

  function renderGroup({ item: group }: { item: DuplicateGroup }) {
    const color = getFileColor(group.name);
    const ext = group.name.split('.').pop()?.toUpperCase() ?? '?';
    return (
      <View style={styles.groupCard}>
        <View style={styles.groupHeader}>
          <View style={[styles.fileIcon, { backgroundColor: color + '22' }]}>
            <Text style={[styles.extLabel, { color }]}>{ext.slice(0, 4)}</Text>
          </View>
          <View style={styles.groupInfo}>
            <Text style={styles.groupName} numberOfLines={1}>{group.name}</Text>
            <Text style={styles.groupMeta}>
              {group.files.length} copies · {formatSize(group.size)} each · {formatSize(group.size * (group.files.length - 1))} wasted
            </Text>
          </View>
        </View>

        {group.files.map((file, i) => (
          <View key={file.uri} style={styles.fileRow}>
            <Ionicons
              name={i === 0 ? 'checkmark-circle' : 'copy-outline'}
              size={16}
              color={i === 0 ? '#2E7D32' : '#888780'}
              style={{ marginRight: 8 }}
            />
            <Text style={styles.filePath} numberOfLines={1}>
              {file.uri.replace('file:///storage/emulated/0/', '').replace(file.name, '') || '/'}
            </Text>
            {i > 0 && (
              <TouchableOpacity
                style={[styles.deleteBtn, deleting === file.uri && { opacity: 0.5 }]}
                onPress={() => handleDelete(group, file)}
                disabled={deleting === file.uri}
              >
                {deleting === file.uri ? (
                  <ActivityIndicator size="small" color="#E24B4A" />
                ) : (
                  <Ionicons name="trash-outline" size={16} color="#E24B4A" />
                )}
              </TouchableOpacity>
            )}
            {i === 0 && (
              <View style={styles.keepBadge}>
                <Text style={styles.keepBadgeText}>KEEP</Text>
              </View>
            )}
          </View>
        ))}
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#111" />
        </TouchableOpacity>
        <Text style={styles.title}>Duplicate Finder</Text>
        <View style={{ width: 40 }} />
      </View>

      {!scanned && !scanning && (
        <View style={styles.startScreen}>
          <View style={styles.startIcon}>
            <Ionicons name="duplicate-outline" size={40} color="#185FA5" />
          </View>
          <Text style={styles.startTitle}>Find duplicate files</Text>
          <Text style={styles.startSub}>
            Scans your storage for files with the same name and size. Safe to run — nothing is deleted until you choose.
          </Text>
          <TouchableOpacity style={styles.scanBtn} onPress={scan} activeOpacity={0.85}>
            <Ionicons name="search-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.scanBtnText}>Start Scan</Text>
          </TouchableOpacity>
        </View>
      )}

      {scanning && (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#185FA5" />
          <Text style={styles.scanningText}>Scanning your storage...</Text>
          <Text style={styles.scanningSubText}>This may take a moment</Text>
        </View>
      )}

      {scanned && !scanning && (
        <>
          {groups.length === 0 ? (
            <View style={styles.centered}>
              <Ionicons name="checkmark-circle-outline" size={56} color="#2E7D32" />
              <Text style={styles.cleanTitle}>No duplicates found!</Text>
              <Text style={styles.cleanSub}>Your storage is clean.</Text>
              <TouchableOpacity style={styles.rescanBtn} onPress={scan}>
                <Text style={styles.rescanText}>Scan again</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={groups}
              keyExtractor={item => item.key}
              renderItem={renderGroup}
              contentContainerStyle={styles.list}
              showsVerticalScrollIndicator={false}
              ListHeaderComponent={
                <View style={styles.summaryCard}>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryCount}>{groups.length}</Text>
                    <Text style={styles.summaryLabel}>duplicate groups</Text>
                  </View>
                  <View style={styles.summaryDivider} />
                  <View style={styles.summaryRow}>
                    <Text style={[styles.summaryCount, { color: '#E24B4A' }]}>{formatSize(totalWasted)}</Text>
                    <Text style={styles.summaryLabel}>wasted space</Text>
                  </View>
                  <TouchableOpacity style={styles.rescanBtn} onPress={scan}>
                    <Text style={styles.rescanText}>Scan again</Text>
                  </TouchableOpacity>
                </View>
              }
            />
          )}
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  title: { flex: 1, fontSize: 20, fontWeight: '500', color: '#111', textAlign: 'center', letterSpacing: -0.5 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 32 },

  startScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 12 },
  startIcon: { width: 88, height: 88, borderRadius: 24, backgroundColor: '#EBF3FC', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  startTitle: { fontSize: 22, fontWeight: '600', color: '#111', letterSpacing: -0.5 },
  startSub: { fontSize: 14, color: '#888780', textAlign: 'center', lineHeight: 20 },
  scanBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#185FA5', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32, marginTop: 8 },
  scanBtnText: { fontSize: 15, fontWeight: '600', color: '#fff' },

  scanningText: { fontSize: 16, fontWeight: '500', color: '#111', marginTop: 16 },
  scanningSubText: { fontSize: 13, color: '#888780' },

  cleanTitle: { fontSize: 20, fontWeight: '600', color: '#111' },
  cleanSub: { fontSize: 14, color: '#888780' },

  list: { paddingHorizontal: 16, paddingBottom: 32 },

  summaryCard: { backgroundColor: '#FAFAF8', borderRadius: 16, padding: 16, marginBottom: 16, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  summaryRow: { alignItems: 'center', flex: 1 },
  summaryCount: { fontSize: 24, fontWeight: '700', color: '#111', letterSpacing: -0.5 },
  summaryLabel: { fontSize: 12, color: '#888780', marginTop: 2 },
  summaryDivider: { width: 1, height: 40, backgroundColor: '#F1EFE8' },

  rescanBtn: { paddingVertical: 8, paddingHorizontal: 16 },
  rescanText: { fontSize: 13, color: '#185FA5' },

  groupCard: { backgroundColor: '#FAFAF8', borderRadius: 12, padding: 14, marginBottom: 12 },
  groupHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  fileIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  extLabel: { fontSize: 9, fontWeight: '500' },
  groupInfo: { flex: 1 },
  groupName: { fontSize: 14, fontWeight: '500', color: '#111', marginBottom: 2 },
  groupMeta: { fontSize: 11, color: '#888780' },

  fileRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: 0.5, borderTopColor: '#F1EFE8' },
  filePath: { flex: 1, fontSize: 11, color: '#5F5E5A' },
  deleteBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  keepBadge: { backgroundColor: '#E8F5E9', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  keepBadgeText: { fontSize: 9, fontWeight: '700', color: '#2E7D32', letterSpacing: 0.5 },
});
