import { useState } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity, FlatList,
  ActivityIndicator, Alert, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useDuplicates, DuplicateGroup, DuplicateFile } from '@/hooks/useDuplicates';
import { useTheme } from '@/hooks/useTheme';

function isImage(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase();
  return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic'].includes(ext ?? '');
}

function getFileColor(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic'].includes(ext ?? '')) return '#185FA5';
  if (['mp4', 'mkv', 'avi', 'mov', 'webm'].includes(ext ?? '')) return '#993C1D';
  if (['pdf', 'doc', 'docx', 'txt', 'xls', 'xlsx'].includes(ext ?? '')) return '#534AB7';
  if (['mp3', 'wav', 'aac', 'flac', 'm4a'].includes(ext ?? '')) return '#854F0B';
  return '#5F5E5A';
}

export default function DuplicatesScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { groups, scanning, scanned, totalWasted, listVersion, scan, deleteFile, formatSize } = useDuplicates();
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
    const showThumb = isImage(group.name) && group.files[0]?.uri;
    return (
      <View style={[styles.groupCard, { backgroundColor: colors.surfaceAlt }]}>
        <View style={styles.groupHeader}>
          {showThumb ? (
            <Image source={{ uri: group.files[0].uri }} style={styles.thumbnail} resizeMode="cover" />
          ) : (
            <View style={[styles.fileIcon, { backgroundColor: color + '22' }]}>
              <Text style={[styles.extLabel, { color }]}>{ext.slice(0, 4)}</Text>
            </View>
          )}
          <View style={styles.groupInfo}>
            <Text style={[styles.groupName, { color: colors.textPrimary }]} numberOfLines={1}>{group.name}</Text>
            <Text style={[styles.groupMeta, { color: colors.textMuted }]}>
              {group.files.length} copies · {formatSize(group.size)} each · {formatSize(group.size * (group.files.length - 1))} wasted
            </Text>
          </View>
        </View>

        {group.files.map((file) => (
          <View key={file.uri} style={[styles.fileRow, { borderTopColor: colors.border }]}>
            <Ionicons name="copy-outline" size={16} color={colors.textMuted} style={{ marginRight: 8 }} />
            <Text style={[styles.filePath, { color: colors.textSecondary }]} numberOfLines={1}>
              {(() => { try { return 'Internal Storage/' + decodeURIComponent(file.uri.replace('file:///storage/emulated/0/', '').replace(file.name, '')) || '/'; } catch { return 'Internal Storage/' + file.uri.replace('file:///storage/emulated/0/', '').replace(file.name, '') || '/'; } })()}
            </Text>
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
          </View>
        ))}
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.background }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Duplicate Finder</Text>
        <View style={{ width: 40 }} />
      </View>

      {!scanned && !scanning && (
        <View style={styles.startScreen}>
          <View style={[styles.startIcon, { backgroundColor: colors.blueTint }]}>
            <Ionicons name="duplicate-outline" size={40} color={colors.blue} />
          </View>
          <Text style={[styles.startTitle, { color: colors.textPrimary }]}>Find duplicate files</Text>
          <Text style={[styles.startSub, { color: colors.textMuted }]}>
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
          <ActivityIndicator size="large" color={colors.blue} />
          <Text style={[styles.scanningText, { color: colors.textPrimary }]}>Scanning your storage...</Text>
          <Text style={[styles.scanningSubText, { color: colors.textMuted }]}>This may take a moment</Text>
        </View>
      )}

      {scanned && !scanning && (
        <>
          {groups.length === 0 ? (
            <View style={styles.centered}>
              <Ionicons name="checkmark-circle-outline" size={56} color="#2E7D32" />
              <Text style={[styles.cleanTitle, { color: colors.textPrimary }]}>No duplicates found!</Text>
              <Text style={[styles.cleanSub, { color: colors.textMuted }]}>Your storage is clean.</Text>
              <TouchableOpacity style={styles.rescanBtn} onPress={scan}>
                <Text style={[styles.rescanText, { color: colors.blue }]}>Scan again</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              key={listVersion}
              data={groups}
              keyExtractor={item => item.key}
              renderItem={renderGroup}
              contentContainerStyle={styles.list}
              showsVerticalScrollIndicator={false}
              ListHeaderComponent={
                <View style={[styles.summaryCard, { backgroundColor: colors.surfaceAlt }]}>
                  <View style={styles.summaryRow}>
                    <Text style={[styles.summaryCount, { color: colors.textPrimary }]}>{groups.length}</Text>
                    <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>duplicate groups</Text>
                  </View>
                  <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
                  <View style={styles.summaryRow}>
                    <Text style={[styles.summaryCount, { color: colors.deleteRed }]}>{formatSize(totalWasted)}</Text>
                    <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>wasted space</Text>
                  </View>
                  <TouchableOpacity style={styles.rescanBtn} onPress={scan}>
                    <Text style={[styles.rescanText, { color: colors.blue }]}>Scan again</Text>
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
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  title: { flex: 1, fontSize: 20, fontWeight: '500', textAlign: 'center', letterSpacing: -0.5 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 32 },
  startScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 12 },
  startIcon: { width: 88, height: 88, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  startTitle: { fontSize: 22, fontWeight: '600', letterSpacing: -0.5 },
  startSub: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  scanBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#185FA5', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32, marginTop: 8 },
  scanBtnText: { fontSize: 15, fontWeight: '600', color: '#fff' },
  scanningText: { fontSize: 16, fontWeight: '500', marginTop: 16 },
  scanningSubText: { fontSize: 13 },
  cleanTitle: { fontSize: 20, fontWeight: '600' },
  cleanSub: { fontSize: 14 },
  list: { paddingHorizontal: 16, paddingBottom: 32 },
  summaryCard: { borderRadius: 16, padding: 16, marginBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 8 },
  summaryRow: { alignItems: 'center', flex: 1, minWidth: 0 },
  summaryCount: { fontSize: 22, fontWeight: '700', letterSpacing: -0.5 },
  summaryLabel: { fontSize: 12, marginTop: 2 },
  summaryDivider: { width: 1, height: 40 },
  rescanBtn: { paddingVertical: 8, paddingHorizontal: 16 },
  rescanText: { fontSize: 13 },
  groupCard: { borderRadius: 12, padding: 14, marginBottom: 12 },
  groupHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  thumbnail: { width: 40, height: 40, borderRadius: 8, marginRight: 12 },
  fileIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  extLabel: { fontSize: 9, fontWeight: '500' },
  groupInfo: { flex: 1 },
  groupName: { fontSize: 14, fontWeight: '500', marginBottom: 2 },
  groupMeta: { fontSize: 11 },
  fileRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: 0.5 },
  filePath: { flex: 1, fontSize: 11 },
  deleteBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  keepBadge: { backgroundColor: '#E8F5E9', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  keepBadgeText: { fontSize: 9, fontWeight: '700', color: '#2E7D32', letterSpacing: 0.5 },
});
