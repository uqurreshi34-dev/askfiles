import { StyleSheet, Text, View, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useStorage } from '@/hooks/useStorage';
import { formatBytes } from '@/utils/formatBytes';
import StorageSummaryCard from '@/components/StorageSummaryCard';

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
  const router = useRouter();
  const { storageInfo, folderSizes, loading } = useStorage();

  const categories: Category[] = [
    { label: 'Images',    size: folderSizes.pictures, bytes: parseSize(folderSizes.pictures), color: '#185FA5', icon: 'image-outline',      route: '/category?category=images' },
    { label: 'Videos',    size: folderSizes.videos,   bytes: parseSize(folderSizes.videos),   color: '#993C1D', icon: 'videocam-outline',    route: '/category?category=videos' },
    { label: 'Downloads', size: folderSizes.downloads,bytes: parseSize(folderSizes.downloads),color: '#3B6D11', icon: 'download-outline',    route: '/category?category=downloads' },
    { label: 'Documents', size: folderSizes.documents,bytes: parseSize(folderSizes.documents),color: '#534AB7', icon: 'document-outline',    route: '/category?category=documents' },
    { label: 'Music',     size: folderSizes.music,    bytes: parseSize(folderSizes.music),    color: '#854F0B', icon: 'musical-notes-outline',route: null },
    { label: 'Other',     size: folderSizes.other,    bytes: parseSize(folderSizes.other),    color: '#888780', icon: 'ellipsis-horizontal-circle-outline', route: null },
  ].sort((a, b) => b.bytes - a.bytes);


  const totalBytes = storageInfo?.totalBytes ?? 1;
  const freeBytes = storageInfo?.freeBytes ?? 0;
  const usedBytes = storageInfo?.usedBytes ?? 0;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#111" />
        </TouchableOpacity>
        <Text style={styles.title}>Storage Breakdown</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#534AB7" />
          <Text style={styles.loadingText}>Calculating...</Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

          {/* Overall bar */}
          <StorageSummaryCard
              usedBytes={usedBytes}
              totalBytes={totalBytes}
              freeBytes={freeBytes}
              note="User-accessible storage only"
              showChevron={false}
            />

          {/* Segmented colour bar */}
          <View style={styles.segmentCard}>
            <Text style={styles.sectionLabel}>BY CATEGORY</Text>
            <View style={styles.segmentBar}>
              {categories.map(cat => {
                const pct = totalBytes > 0 ? (cat.bytes / totalBytes) * 100 : 0;
                if (pct < 0.5) return null;
                return (
                  <View
                    key={cat.label}
                    style={[styles.segment, { width: `${pct}%`, backgroundColor: cat.color }]}
                  />
                );
              })}
            </View>
            <View style={styles.legend}>
              {categories.map(cat => (
                <View key={cat.label} style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: cat.color }]} />
                  <Text style={styles.legendLabel}>{cat.label}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Category rows */}
          <Text style={[styles.sectionLabel, { marginHorizontal: 16, marginTop: 8 }]}>DETAILS</Text>
          <View style={styles.categoriesCard}>
            {categories.map((cat, i) => {
              const pct = totalBytes > 0 ? Math.min((cat.bytes / totalBytes) * 100, 100) : 0;
              return (
                <TouchableOpacity
                  key={cat.label}
                  style={[styles.catRow, i > 0 && styles.catRowBorder]}
                  onPress={() => cat.route && router.push(cat.route as any)}
                  activeOpacity={cat.route ? 0.7 : 1}
                >
                  <View style={[styles.catIcon, { backgroundColor: cat.color + '22' }]}>
                    <Ionicons name={cat.icon as any} size={20} color={cat.color} />
                  </View>
                  <View style={styles.catInfo}>
                    <View style={styles.catTopRow}>
                      <Text style={styles.catLabel}>{cat.label}</Text>
                      <Text style={styles.catSize}>{cat.size}</Text>
                    </View>
                    <View style={styles.catBarTrack}>
                      <View style={[styles.catBarFill, { width: `${pct}%`, backgroundColor: cat.color }]} />
                    </View>
                  </View>
                  {cat.route && <Ionicons name="chevron-forward" size={14} color="#D3D1C7" style={{ marginLeft: 8 }} />}
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.note}>Sizes reflect scanned folders. System files not included.</Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  title: { flex: 1, fontSize: 20, fontWeight: '500', color: '#111', textAlign: 'center', letterSpacing: -0.5 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 14, color: '#888780' },
  content: { paddingBottom: 32 },
  sectionLabel: { fontSize: 11, fontWeight: '600', color: '#888780', letterSpacing: 0.5, marginBottom: 8 },

  overallCard: { marginHorizontal: 16, marginBottom: 16, backgroundColor: '#F1EFE8', borderRadius: 14, padding: 14 },
  overallRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  overallLabel: { fontSize: 13, fontWeight: '500', color: '#5F5E5A' },
  overallVal: { fontSize: 13, fontWeight: '600', color: '#111' },
  overallFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  overallSub: { fontSize: 11, color: '#8A887F' },
  barTrack: { height: 6, backgroundColor: '#D3D1C7', borderRadius: 3, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: '#185FA5', borderRadius: 3 },

  segmentCard: { marginHorizontal: 16, marginBottom: 16, backgroundColor: '#FAFAF8', borderRadius: 14, padding: 14 },
  segmentBar: { flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', backgroundColor: '#F1EFE8', marginBottom: 12 },
  segment: { height: '100%' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { fontSize: 11, color: '#5F5E5A' },

  categoriesCard: { marginHorizontal: 16, backgroundColor: '#FAFAF8', borderRadius: 14, padding: 4 },
  catRow: { flexDirection: 'row', alignItems: 'center', padding: 12 },
  catRowBorder: { borderTopWidth: 0.5, borderTopColor: '#F1EFE8' },
  catIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  catInfo: { flex: 1 },
  catTopRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  catLabel: { fontSize: 14, fontWeight: '500', color: '#111' },
  catSize: { fontSize: 13, color: '#5F5E5A' },
  catBarTrack: { height: 4, backgroundColor: '#E8E6DF', borderRadius: 2, overflow: 'hidden' },
  catBarFill: { height: '100%', borderRadius: 2 },

  note: { fontSize: 10, color: '#AFAEA6', textAlign: 'center', marginTop: 16, marginHorizontal: 16 },
  storageNote: { fontSize: 10, color: '#9A9890', marginTop: 6 },
});
