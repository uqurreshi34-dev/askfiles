import { useCallback } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useStorage, pluralise } from '@/hooks/useStorage';
import { useRecents, timeAgo } from '@/hooks/useRecents';
import { isImageFile } from '@/utils/files';

const CATEGORY_ROUTES: Record<string, string> = {
  '1': 'images',
  '2': 'videos',
  '3': 'documents',
  '4': 'downloads',
};

export default function HomeScreen() {
  const { storageInfo, fileCounts, loading } = useStorage();
  const { recents, reload } = useRecents();
  const router = useRouter();

  useFocusEffect(useCallback(() => {
    reload();
  }, [reload]));

  const QUICK_ACCESS = [
    { id: '1', label: 'Images', count: pluralise(fileCounts.images, 'file'), color: '#E6F1FB', iconColor: '#185FA5', icon: 'image-outline' },
    { id: '2', label: 'Videos', count: pluralise(fileCounts.videos, 'file'), color: '#FAECE7', iconColor: '#993C1D', icon: 'videocam-outline' },
    { id: '3', label: 'Documents', count: pluralise(fileCounts.documents, 'file'), color: '#EEEDFE', iconColor: '#534AB7', icon: 'document-outline' },
    { id: '4', label: 'Downloads', count: pluralise(fileCounts.downloads, 'file'), color: '#EAF3DE', iconColor: '#3B6D11', icon: 'download-outline' },
  ];

  function getFileColor(name: string): string {
    const ext = name.split('.').pop()?.toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic'].includes(ext ?? '')) return '#185FA5';
    if (['mp4', 'mkv', 'avi', 'mov', 'webm'].includes(ext ?? '')) return '#993C1D';
    if (['pdf', 'doc', 'docx', 'txt', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext ?? '')) return '#534AB7';
    if (['mp3', 'wav', 'aac', 'flac', 'm4a'].includes(ext ?? '')) return '#854F0B';
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext ?? '')) return '#3B6D11';
    return '#5F5E5A';
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="auto" />
      <ScrollView showsVerticalScrollIndicator={false}>

        <View style={styles.header}>
          <Text style={styles.appName}>AskFiles</Text>
          <TouchableOpacity style={styles.menuBtn}>
            <View style={styles.menuLine} />
            <View style={styles.menuLine} />
            <View style={styles.menuLine} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.searchBar}
          onPress={() => router.push('/(tabs)/search')}
          activeOpacity={0.7}
        >
          <Ionicons name="search-outline" size={16} color="#888780" style={{ marginRight: 8 }} />
          <Text style={styles.searchText}>Search files, folders...</Text>
        </TouchableOpacity>

        <Text style={styles.sectionLabel}>Quick access</Text>
        <View style={styles.quickGrid}>
          {QUICK_ACCESS.map(item => (
            <TouchableOpacity
              key={item.id}
              style={[styles.quickCard, { backgroundColor: item.color }]}
              activeOpacity={0.7}
              onPress={() => router.push({
                pathname: '/category',
                params: { category: CATEGORY_ROUTES[item.id] },
              })}
            >
              <Ionicons
                name={item.icon as any}
                size={24}
                color={item.iconColor}
                style={{ marginBottom: 8 }}
              />
              <Text style={styles.cardName}>{item.label}</Text>
              <Text style={styles.cardCount}>{item.count}</Text>
            </TouchableOpacity>
          ))}
        </View>

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

        <Text style={styles.sectionLabel}>Recent</Text>
        <View style={styles.recentsList}>
          {recents.length === 0 ? (
            <Text style={styles.emptyText}>No recent files — open something from Browse</Text>
          ) : (
            recents.map(file => {
              const color = getFileColor(file.name);
              const ext = file.name.split('.').pop()?.toUpperCase() ?? '?';
              return (
                <TouchableOpacity
                  key={file.uri}
                  style={styles.recentRow}
                  onPress={() => {
                    if (isImageFile(file.name)) {
                      router.push({ pathname: '/viewer', params: { uri: file.uri, name: file.name } });
                    }
                  }}
                  activeOpacity={0.7}
                >
                  <View style={[styles.recentIcon, { backgroundColor: color + '22', overflow: 'hidden' }]}>
                    {isImageFile(file.name) ? (
                      <Image source={{ uri: file.uri }} style={styles.recentThumb} resizeMode="cover" />
                    ) : (
                      <Text style={[styles.recentExt, { color }]}>{ext.slice(0, 4)}</Text>
                    )}
                  </View>
                  <View style={styles.recentInfo}>
                    <Text style={styles.recentName} numberOfLines={1}>{file.name}</Text>
                    <Text style={styles.recentMeta}>{ext} · {timeAgo(file.openedAt)}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#D3D1C7" />
                </TouchableOpacity>
              );
            })
          )}
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
  searchBar: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 20, backgroundColor: '#F1EFE8', borderRadius: 10, padding: 12 },
  searchText: { fontSize: 14, color: '#888780' },
  sectionLabel: { fontSize: 11, fontWeight: '500', color: '#888780', letterSpacing: 0.5, paddingHorizontal: 16, marginBottom: 8, textTransform: 'uppercase' },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 8, marginBottom: 16 },
  quickCard: { width: '48%', borderRadius: 12, padding: 12 },
  cardName: { fontSize: 14, fontWeight: '500', color: '#111', marginBottom: 2 },
  cardCount: { fontSize: 11, color: '#5F5E5A' },
  storageWrap: { marginHorizontal: 16, marginBottom: 20, backgroundColor: '#F1EFE8', borderRadius: 10, padding: 12 },
  storageRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  storageLabel: { fontSize: 13, color: '#5F5E5A' },
  storageVal: { fontSize: 13, fontWeight: '500', color: '#111' },
  barTrack: { height: 4, backgroundColor: '#D3D1C7', borderRadius: 2, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: '#185FA5', borderRadius: 2 },
  recentsList: { paddingHorizontal: 16, paddingBottom: 24 },
  emptyText: { fontSize: 13, color: '#888780', textAlign: 'center', paddingVertical: 20 },
  recentRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: '#F1EFE8' },
  recentIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  recentThumb: { width: 40, height: 40 },
  recentExt: { fontSize: 9, fontWeight: '500' },
  recentInfo: { flex: 1 },
  recentName: { fontSize: 14, fontWeight: '500', color: '#111', marginBottom: 2 },
  recentMeta: { fontSize: 11, color: '#888780' },
});
