import React, { useEffect, useState } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity, FlatList,
  ActivityIndicator, Alert, Image, useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useImageDuplicates } from '@/hooks/useImageDuplicates';
import { ImageDuplicateGroup, ImageDuplicateFile } from '@/modules/image-hash';
import { useTheme } from '@/hooks/useTheme';
import { usePro } from '@/hooks/usePro';
import { getFriendlyPath } from '@/utils/files';
import { getStorageVolumes } from '@/modules/storage-stats';

export default function ImageDuplicatesScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = useWindowDimensions();
  const { groups, scanning, scanned, totalWasted, listVersion, scan, deleteFile, deleteAllButOne, formatSize } = useImageDuplicates();
  const { isPro } = usePro();
  const [deleting, setDeleting] = useState<string | null>(null);
  const [keepingGroup, setKeepingGroup] = useState<string | null>(null);
  const [volumes, setVolumes] = useState<{ name: string; path: string; type: string }[]>([]);

  useEffect(() => {
    getStorageVolumes().then(setVolumes);
  }, []);

  async function handleDelete(group: ImageDuplicateGroup, file: ImageDuplicateFile) {
    Alert.alert(
      'Delete image',
      'Delete this copy? This cannot be undone.',
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

  async function handleKeepOne(group: ImageDuplicateGroup) {
    Alert.alert(
      'Keep one copy',
      'Keep the largest copy and delete the rest?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete rest',
          style: 'destructive',
          onPress: async () => {
            setKeepingGroup(group.key);
            await deleteAllButOne(group);
            setKeepingGroup(null);
          },
        },
      ]
    );
  }

  function renderGroup({ item: group }: { item: ImageDuplicateGroup }) {
    return (
      <View style={[styles.groupCard, { backgroundColor: colors.surfaceAlt }]}>
        <View style={styles.groupHeader}>
          {group.files[0]?.uri ? (
            <Image source={{ uri: group.files[0].uri }} style={styles.thumbnail} resizeMode="cover" />
          ) : (
            <View style={[styles.fileIcon, { backgroundColor: colors.blueTint }]}>
              <Ionicons name="images-outline" size={20} color={colors.blue} />
            </View>
          )}
          <View style={styles.groupInfo}>
            <Text style={[styles.groupName, { color: colors.textPrimary }]} numberOfLines={1}>
              {group.files[0]?.name ?? 'Similar images'}
            </Text>
            <Text style={[styles.groupMeta, { color: colors.textMuted }]}>
              {group.files.length} similar · {formatSize(Math.max(...group.files.map(f => f.size)) * (group.files.length - 1))} wasted
            </Text>
          </View>
        </View>

        {group.files.map((file) => (
          <View key={file.uri} style={[styles.fileRow, { borderTopColor: colors.border }]}>
            <Image source={{ uri: file.uri }} style={styles.rowThumb} resizeMode="cover" />
            <View style={styles.fileInfo}>
              <Text style={[styles.fileName, { color: colors.textSecondary }]} numberOfLines={1}>
                {file.name}
              </Text>
              <Text style={[styles.filePath, { color: colors.textMuted }]} numberOfLines={1}>
                {getFriendlyPath(file.path, volumes)} · {formatSize(file.size)}
              </Text>
            </View>
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

        <TouchableOpacity
          style={[styles.keepOneRow, { borderTopColor: colors.border }]}
          onPress={() => handleKeepOne(group)}
          disabled={keepingGroup === group.key}
        >
          {keepingGroup === group.key ? (
            <ActivityIndicator size="small" color={colors.deleteRed} />
          ) : (
            <>
              <Ionicons name="trash-outline" size={16} color={colors.deleteRed} style={{ marginRight: 8 }} />
              <Text style={[styles.keepOneText, { color: colors.deleteRed }]}>Keep largest, delete rest</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    );
  }

  if (!isPro) {
    return (
      <SafeAreaView edges={['left', 'right', 'bottom']} style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { backgroundColor: colors.background }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Similar Image Finder</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.startScreen}>
          <View style={[styles.startIcon, { backgroundColor: colors.blueTint }]}>
            <Ionicons name="images-outline" size={40} color={colors.blue} />
          </View>
          <Text style={[styles.startTitle, { color: colors.textPrimary }]}>Pro Feature</Text>
          <Text style={[styles.startSub, { color: colors.textMuted }]}>
            Similar Image Finder is part of AskFiles Pro. Upgrade once, use forever.
          </Text>
          <TouchableOpacity style={styles.scanBtn} onPress={() => router.push('/(tabs)/cloud')} activeOpacity={0.85}>
            <Ionicons name="sparkles-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.scanBtnText}>Upgrade to Pro</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.background }]}>
        <TouchableOpacity
          onPress={() => !scanning && router.back()}
          style={styles.backBtn}
          disabled={scanning}
        >
          <Ionicons name="arrow-back" size={24} color={scanning ? colors.textDisabled : colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Similar Image Finder</Text>
        <View style={{ width: 40 }} />
      </View>

      {!scanned && !scanning && (
        <View style={styles.startScreen}>
          <View style={[styles.startIcon, { backgroundColor: colors.blueTint }]}>
            <Ionicons name="images-outline" size={40} color={colors.blue} />
          </View>
          <Text style={[styles.startTitle, { color: colors.textPrimary }]}>Find similar images</Text>
          <Text style={[styles.startSub, { color: colors.textMuted }]}>
            Scans all your photos for visually similar duplicates — even if they have different filenames, sizes or formats.
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
          <Text style={[styles.scanningText, { color: colors.textPrimary }]}>Scanning your images...</Text>
          <Text style={[styles.scanningSubText, { color: colors.textMuted }]}>This may take a moment</Text>
        </View>
      )}

      {scanned && !scanning && (
        <>
          {groups.length === 0 ? (
            <View style={styles.centered}>
              <Ionicons name="checkmark-circle-outline" size={56} color="#2E7D32" />
              <Text style={[styles.cleanTitle, { color: colors.textPrimary }]}>No similar images found!</Text>
              <Text style={[styles.cleanSub, { color: colors.textMuted }]}>Your photo library looks clean.</Text>
              <TouchableOpacity style={styles.rescanBtn} onPress={scan}>
                <Text style={[styles.rescanText, { color: colors.blue }]}>Scan again</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              key={`${listVersion}-${SCREEN_WIDTH > SCREEN_HEIGHT}`}
              data={groups}
              keyExtractor={item => item.key}
              renderItem={renderGroup}
              contentContainerStyle={styles.list}
              showsVerticalScrollIndicator={false}
              ListHeaderComponent={
                <View style={[styles.summaryCard, { backgroundColor: colors.surfaceAlt }]}>
                  <View style={styles.summaryRow}>
                    <Text style={[styles.summaryCount, { color: colors.textPrimary }]}>{groups.length}</Text>
                    <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>similar groups</Text>
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
  groupInfo: { flex: 1 },
  groupName: { fontSize: 14, fontWeight: '500', marginBottom: 2 },
  groupMeta: { fontSize: 11 },
  fileRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: 0.5 },
  fileInfo: { flex: 1 },
  fileName: { fontSize: 12, fontWeight: '500' },
  filePath: { fontSize: 10, marginTop: 1 },
  deleteBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  keepOneRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderTopWidth: 0.5, marginTop: 4 },
  keepOneText: { fontSize: 13, fontWeight: '600' },
  rowThumb: { width: 36, height: 36, borderRadius: 6, marginRight: 8 },
});
