import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStorage, pluralise } from '@/hooks/useStorage';


export default function HomeScreen() {
  const { storageInfo, fileCounts, loading } = useStorage();
  const QUICK_ACCESS = [
    { id: '1', label: 'Images', count: pluralise(fileCounts.images, 'file'), color: '#E6F1FB', iconColor: '#185FA5' },
    { id: '2', label: 'Videos', count: pluralise(fileCounts.videos, 'file'), color: '#FAECE7', iconColor: '#993C1D' },
    { id: '3', label: 'Documents', count: pluralise(fileCounts.documents, 'file'), color: '#EEEDFE', iconColor: '#534AB7' },
    { id: '4', label: 'Downloads', count: pluralise(fileCounts.downloads, 'file'), color: '#EAF3DE', iconColor: '#3B6D11' },
  ];
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="auto" />
      <ScrollView showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.appName}>AskFiles</Text>
          <TouchableOpacity style={styles.menuBtn}>
            <View style={styles.menuLine} />
            <View style={styles.menuLine} />
            <View style={styles.menuLine} />
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View style={styles.searchBar}>
          <Text style={styles.searchText}>Search files, folders...</Text>
        </View>

        {/* Quick Access */}
        <Text style={styles.sectionLabel}>Quick access</Text>
        <View style={styles.quickGrid}>
          {QUICK_ACCESS.map(item => (
            <TouchableOpacity
              key={item.id}
              style={[styles.quickCard, { backgroundColor: item.color }]}
            >
              <View style={[styles.cardIcon, { backgroundColor: item.iconColor }]} />
              <Text style={styles.cardName}>{item.label}</Text>
              <Text style={styles.cardCount}>{item.count}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Storage Bar */}
        <View style={styles.storageWrap}>
          <View style={styles.storageRow}>
            <Text style={styles.storageLabel}>Usable storage</Text>
            <Text style={styles.storageVal}>
              {loading ? 'Calculating...' : `${storageInfo?.usedReadable} / ${storageInfo?.totalReadable}`}
            </Text>
          </View>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${storageInfo?.usedPercent ?? 0}%` }]} />
          </View>
        </View>

        {/* Recents */}
        <Text style={styles.sectionLabel}>Recent</Text>
        <View style={styles.recentsList}>
          <Text style={styles.emptyText}>No recent files</Text>
        </View>

      </ScrollView>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  appName: { fontSize: 26, fontWeight: '500', letterSpacing: -0.5, color: '#111' },
  menuBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center', gap: 4 },
  menuLine: { width: 18, height: 2, backgroundColor: '#111', borderRadius: 1 },
  searchBar: { marginHorizontal: 16, marginBottom: 20, backgroundColor: '#F1EFE8', borderRadius: 10, padding: 12 },
  searchText: { fontSize: 14, color: '#888780' },
  sectionLabel: { fontSize: 11, fontWeight: '500', color: '#888780', letterSpacing: 0.5, paddingHorizontal: 16, marginBottom: 8, textTransform: 'uppercase' },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 8, marginBottom: 16 },
  quickCard: { width: '48%', borderRadius: 12, padding: 12 },
  cardIcon: { width: 28, height: 28, borderRadius: 6, marginBottom: 8 },
  cardName: { fontSize: 14, fontWeight: '500', color: '#111', marginBottom: 2 },
  cardCount: { fontSize: 11, color: '#5F5E5A' },
  storageWrap: { marginHorizontal: 16, marginBottom: 20, backgroundColor: '#F1EFE8', borderRadius: 10, padding: 12 },
  storageRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  storageLabel: { fontSize: 13, color: '#5F5E5A' },
  storageVal: { fontSize: 13, fontWeight: '500', color: '#111' },
  barTrack: { height: 4, backgroundColor: '#D3D1C7', borderRadius: 2, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: '#185FA5', borderRadius: 2 },
  recentsList: { paddingHorizontal: 16, paddingBottom: 16 },
  emptyText: { fontSize: 13, color: '#888780', textAlign: 'center', paddingVertical: 20 },
});
