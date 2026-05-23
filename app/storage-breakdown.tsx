import { StyleSheet, Text, View, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useStorage } from '@/hooks/useStorage';
import StorageSummaryCard from '@/components/StorageSummaryCard';
import { useTheme } from '@/hooks/useTheme';
import { useCallback } from 'react';

interface Category {
  label: string;
  size: string;
  bytes: number;
  color: string;
  icon: string;
  route: string | null;
}

function parseSize(readable: string): number {
  const num = parseFloat(readable);
  if (readable.includes('GB')) return num * 1073741824;
  if (readable.includes('MB')) return num * 1048576;
  if (readable.includes('KB')) return num * 1024;
  return num;
}

export default function StorageBreakdownScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { storageInfo, folderSizes, loading, silentReload } = useStorage();

  const categories: Category[] = [
    { label: 'Images',    size: folderSizes.pictures, bytes: parseSize(folderSizes.pictures), color: '#185FA5', icon: 'image-outline',      route: '/category?category=images' },
    { label: 'Videos',    size: folderSizes.videos,   bytes: parseSize(folderSizes.videos),   color: '#993C1D', icon: 'videocam-outline',    route: '/category?category=videos' },
    { label: 'Downloads', size: folderSizes.downloads,bytes: parseSize(folderSizes.downloads),color: '#3B6D11', icon: 'download-outline',    route: '/category?category=downloads' },
    { label: 'Documents', size: folderSizes.documents,bytes: parseSize(folderSizes.documents),color: '#534AB7', icon: 'document-outline',    route: '/category?category=documents' },
    { label: 'Other',     size: folderSizes.other,    bytes: parseSize(folderSizes.other),    color: '#888780', icon: 'ellipsis-horizontal-circle-outline', route: null },
  ].sort((a, b) => b.bytes - a.bytes);

  const totalBytes = storageInfo?.totalBytes ?? 1;
  const freeBytes = storageInfo?.freeBytes ?? 0;
  const usedBytes = storageInfo?.usedBytes ?? 0;

  // useFocusEffect(useCallback(() => {
  //   silentReload();
  // }, []));

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.background }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Storage Breakdown</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.purple} />
          <Text style={[styles.loadingText, { color: colors.textMuted }]}>Calculating...</Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          <StorageSummaryCard
            usedBytes={usedBytes}
            totalBytes={totalBytes}
            freeBytes={freeBytes}
            note="Includes apps and user files"
            showChevron={false}
          />

          <View style={[styles.segmentCard, { backgroundColor: colors.surfaceAlt }]}>
            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>BY CATEGORY</Text>
            <View style={[styles.segmentBar, { backgroundColor: colors.surface }]}>
              {categories.map(cat => {
                const pct = totalBytes > 0 ? (cat.bytes / totalBytes) * 100 : 0;
                if (pct < 0.5) return null;
                return (
                  <View key={cat.label} style={[styles.segment, { width: `${pct}%`, backgroundColor: cat.color }]} />
                );
              })}
            </View>
            <View style={styles.legend}>
              {categories.map(cat => (
                <View key={cat.label} style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: cat.color }]} />
                  <Text style={[styles.legendLabel, { color: colors.textSecondary }]}>{cat.label}</Text>
                </View>
              ))}
            </View>
          </View>

          <Text style={[styles.sectionLabel, { color: colors.textMuted, marginHorizontal: 16, marginTop: 8 }]}>DETAILS</Text>
          <View style={[styles.categoriesCard, { backgroundColor: colors.surfaceAlt }]}>
            {categories.map((cat, i) => {
              const pct = totalBytes > 0 ? Math.min((cat.bytes / totalBytes) * 100, 100) : 0;
              return (
                <TouchableOpacity
                  key={cat.label}
                  style={[styles.catRow, i > 0 && [styles.catRowBorder, { borderTopColor: colors.border }]]}
                  onPress={() => cat.route && router.push(cat.route as any)}
                  activeOpacity={cat.route ? 0.7 : 1}
                >
                  <View style={[styles.catIcon, { backgroundColor: cat.color + '22' }]}>
                    <Ionicons name={cat.icon as any} size={20} color={cat.color} />
                  </View>
                  <View style={styles.catInfo}>
                    <View style={styles.catTopRow}>
                      <Text style={[styles.catLabel, { color: colors.textPrimary }]}>{cat.label}</Text>
                      <Text style={[styles.catSize, { color: colors.textSecondary }]}>{cat.size}</Text>
                    </View>
                    <View style={[styles.catBarTrack, { backgroundColor: colors.border }]}>
                      <View style={[styles.catBarFill, { width: `${pct}%`, backgroundColor: cat.color }]} />
                    </View>
                  </View>
                  {cat.route && <Ionicons name="chevron-forward" size={14} color={colors.textDisabled} style={{ marginLeft: 8 }} />}
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[styles.note, { color: colors.textMuted }]}>Sizes shown are for files you can see and manage in AskFiles.</Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  title: { flex: 1, fontSize: 20, fontWeight: '500', textAlign: 'center', letterSpacing: -0.5 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 14 },
  content: { paddingBottom: 32 },
  sectionLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 0.5, marginBottom: 8 },
  barTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: '#185FA5', borderRadius: 3 },
  segmentCard: { marginHorizontal: 16, marginBottom: 16, borderRadius: 14, padding: 14 },
  segmentBar: { flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', marginBottom: 12 },
  segment: { height: '100%' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { fontSize: 11 },
  categoriesCard: { marginHorizontal: 16, borderRadius: 14, padding: 4 },
  catRow: { flexDirection: 'row', alignItems: 'center', padding: 12 },
  catRowBorder: { borderTopWidth: 0.5 },
  catIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  catInfo: { flex: 1 },
  catTopRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  catLabel: { fontSize: 14, fontWeight: '500' },
  catSize: { fontSize: 13 },
  catBarTrack: { height: 4, borderRadius: 2, overflow: 'hidden' },
  catBarFill: { height: '100%', borderRadius: 2 },
  note: { fontSize: 10, textAlign: 'center', marginTop: 16, marginHorizontal: 16 },
  storageNote: { fontSize: 10, marginTop: 6 },
  overallCard: { marginHorizontal: 16, marginBottom: 16, borderRadius: 14, padding: 14 },
  overallRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  overallLabel: { fontSize: 13, fontWeight: '500' },
  overallVal: { fontSize: 13, fontWeight: '600' },
  overallFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  overallSub: { fontSize: 11 },
});
