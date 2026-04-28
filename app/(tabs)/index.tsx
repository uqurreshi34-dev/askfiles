import { useCallback, useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Image, Modal, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useStorage, pluralise } from '@/hooks/useStorage';
import { useRecents, timeAgo } from '@/hooks/useRecents';
import { isImageFile } from '@/utils/files';
import { useFavourites } from '@/hooks/useFavourites';
import StorageSummaryCard from '@/components/StorageSummaryCard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { scheduleDailyReminder } from '@/hooks/useNotifications';
import { usePro } from '@/hooks/usePro';

const APP_VERSION = '1.0.0';
const PRIVACY_POLICY_URL = 'https://uqurreshi34-dev.github.io/askfiles-privacy/';

export default function HomeScreen() {
  const { storageInfo, fileCounts, loading, permissionGranted, reload: reloadStorage } = useStorage();
  const { recents, reload } = useRecents();
  const { count: favCount } = useFavourites();
  const router = useRouter();
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const { isPro } = usePro();

  useEffect(() => {
    async function checkOnboarding() {
      const done = await AsyncStorage.getItem('askfiles-onboarding-done');
      if (!done) {
        router.replace('/onboarding' as any);
      } else {
        setOnboardingChecked(true);
        scheduleDailyReminder(isPro);
      }
    }
    checkOnboarding();
  }, [isPro]);

  useFocusEffect(useCallback(() => {
    reload();
    reloadStorage();
  }, [reload, reloadStorage]));

  const QUICK_ACCESS = [
    { id: '1', label: 'Images', count: pluralise(fileCounts.images, 'file'), color: '#E6F1FB', iconColor: '#185FA5', icon: 'image-outline', route: '/category?category=images' },
    { id: '2', label: 'Videos', count: pluralise(fileCounts.videos, 'file'), color: '#FAECE7', iconColor: '#993C1D', icon: 'videocam-outline', route: '/category?category=videos' },
    { id: '3', label: 'Documents', count: pluralise(fileCounts.documents, 'file'), color: '#EEEDFE', iconColor: '#534AB7', icon: 'document-outline', route: '/category?category=documents' },
    { id: '4', label: 'Downloads', count: pluralise(fileCounts.downloads, 'file'), color: '#EAF3DE', iconColor: '#3B6D11', icon: 'download-outline', route: '/category?category=downloads' },
    { id: '5', label: 'Favourites', count: pluralise(favCount, 'file'), color: '#FEE9E9', iconColor: '#C0392B', icon: 'heart-outline', route: '/favourites' },
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

  if (!onboardingChecked) return <View style={{ flex: 1, backgroundColor: '#fff' }} />;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="auto" />
      <ScrollView showsVerticalScrollIndicator={false}>

        <View style={styles.header}>
          <Text style={styles.appName}>AskFiles</Text>
          <TouchableOpacity
            style={styles.settingsBtn}
            onPress={() => setSettingsVisible(true)}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="settings-outline" size={22} color="#5F5E5A" />
          </TouchableOpacity>
        </View>

        {/* Settings Modal */}
        <Modal
          visible={settingsVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setSettingsVisible(false)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setSettingsVisible(false)}
          >
            <View style={styles.modalCard} onStartShouldSetResponder={() => true}>
              <Text style={styles.modalTitle}>AskFiles</Text>
              <Text style={styles.modalVersion}>Version {APP_VERSION}</Text>
              <View style={styles.modalRow}>
                <Ionicons
                  name="phone-portrait-outline"
                  size={18}
                  color="#185FA5"
                  style={{ marginRight: 10 }}
                />
                <Text style={styles.modalRowText}>
                  Device storage: {Math.round((storageInfo?.totalBytes ?? 0) / 1_073_741_824)} GB
                </Text>
              </View>
              <View style={styles.modalDivider} />

              <TouchableOpacity
                style={styles.modalRow}
                activeOpacity={0.7}
                onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}
              >
                <Ionicons name="shield-checkmark-outline" size={18} color="#534AB7" style={{ marginRight: 10 }} />
                <Text style={styles.modalRowText}>Privacy Policy</Text>
                <Ionicons name="open-outline" size={14} color="#888780" style={{ marginLeft: 'auto' }} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalRow}
                activeOpacity={0.7}
                onPress={() => Linking.openURL('market://details?id=com.askfiles.mobile')}
              >
                <Ionicons name="star-outline" size={18} color="#854F0B" style={{ marginRight: 10 }} />
                <Text style={styles.modalRowText}>Rate App</Text>
                <Ionicons name="chevron-forward" size={14} color="#888780" style={{ marginLeft: 'auto' }} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalClose}
                activeOpacity={0.7}
                onPress={() => setSettingsVisible(false)}
              >
                <Text style={styles.modalCloseText}>Close</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>

        <TouchableOpacity
          style={styles.searchBar}
          onPress={() => router.push('/(tabs)/search?autofocus=1')}
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
              onPress={() => router.push(item.route as any)}
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

        {!loading && !permissionGranted ? (
          <TouchableOpacity
            activeOpacity={0.8}
            style={styles.permissionCard}
            onPress={() => Linking.openSettings()}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Ionicons name="warning-outline" size={18} color="#854F0B" />
              <View style={{ flex: 1 }}>
                <Text style={styles.permissionTitle}>Storage permission needed</Text>
                <Text style={styles.permissionSub}>Tap to open Settings and grant access</Text>
              </View>
              <Ionicons name="chevron-forward" size={14} color="#888780" />
            </View>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => router.push('/(tabs)/browse')}
        >
          <StorageSummaryCard
            usedBytes={storageInfo?.usedBytes ?? 0}
            totalBytes={storageInfo?.totalBytes ?? 0}
            freeBytes={storageInfo?.freeBytes ?? 0}
            note="User-accessible storage only"
            showChevron={true}
          />
        </TouchableOpacity>
        )}

        <TouchableOpacity
          activeOpacity={0.8}
          style={styles.largeFilesCard}
          onPress={() => router.push('/large-files')}
        >
          <View style={styles.largeFilesLeft}>
            <View style={styles.largeFilesIcon}>
              <Ionicons name="folder-open-outline" size={22} color="#993C1D" />
            </View>
            <View>
              <Text style={styles.largeFilesTitle}>Large Files</Text>
              <Text style={styles.largeFilesSub}>Find files taking up the most space</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={16} color="#888780" />
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.8}
          style={styles.breakdownCard}
          onPress={() => router.push('/storage-breakdown')}
        >
          <View style={styles.largeFilesLeft}>
            <View style={styles.breakdownIcon}>
              <Ionicons name="pie-chart-outline" size={22} color="#534AB7" />
            </View>
            <View>
              <Text style={styles.largeFilesTitle}>Storage Breakdown</Text>
              <Text style={styles.largeFilesSub}>See what's using your space</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={16} color="#888780" />
        </TouchableOpacity>

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
  settingsBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
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
  storageNote: { fontSize: 10, color: '#9A9890', marginTop: 6 },
  barTrack: { height: 4, backgroundColor: '#D3D1C7', borderRadius: 2, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: '#185FA5', borderRadius: 2 },
  largeFilesCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 16, marginBottom: 20, backgroundColor: '#FAECE7', borderRadius: 12, padding: 14 },
  largeFilesLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  largeFilesIcon: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#F5D5CB', alignItems: 'center', justifyContent: 'center' },
  largeFilesTitle: { fontSize: 14, fontWeight: '600', color: '#111', marginBottom: 2 },
  largeFilesSub: { fontSize: 11, color: '#5F5E5A' },
  breakdownCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 16, marginBottom: 20, backgroundColor: '#EEEDFE', borderRadius: 12, padding: 14 },
  breakdownIcon: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#D9D8F8', alignItems: 'center', justifyContent: 'center' },
  recentsList: { paddingHorizontal: 16, paddingBottom: 24 },
  emptyText: { fontSize: 13, color: '#888780', textAlign: 'center', paddingVertical: 20 },
  recentRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: '#F1EFE8' },
  recentIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  recentThumb: { width: 40, height: 40 },
  recentExt: { fontSize: 9, fontWeight: '500' },
  recentInfo: { flex: 1 },
  recentName: { fontSize: 14, fontWeight: '500', color: '#111', marginBottom: 2 },
  recentMeta: { fontSize: 11, color: '#888780' },
  // Modal styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center' },
  modalCard: { backgroundColor: '#fff', borderRadius: 16, padding: 24, width: 280, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 8 },
  modalTitle: { fontSize: 18, fontWeight: '600', color: '#111', textAlign: 'center', letterSpacing: -0.3 },
  modalVersion: { fontSize: 12, color: '#888780', textAlign: 'center', marginTop: 4, marginBottom: 16 },
  modalDivider: { height: 0.5, backgroundColor: '#E8E6DF', marginBottom: 8 },
  modalRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13 },
  modalRowText: { fontSize: 14, color: '#111' },
  modalClose: { marginTop: 12, backgroundColor: '#F1EFE8', borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  modalCloseText: { fontSize: 14, fontWeight: '500', color: '#5F5E5A' },
  permissionCard: { marginHorizontal: 16, marginBottom: 20, backgroundColor: '#FEF3E2', borderRadius: 10, padding: 14 },
  permissionTitle: { fontSize: 13, fontWeight: '600', color: '#111', marginBottom: 2 },
  permissionSub: { fontSize: 11, color: '#5F5E5A' },
});
