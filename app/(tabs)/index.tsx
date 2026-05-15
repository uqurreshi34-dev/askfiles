import { useCallback, useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Image, Modal, Linking, useWindowDimensions, AppState, ActivityIndicator } from 'react-native';
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
import { useTrash } from '@/hooks/useTrash';
import { isAppLockEnabled, disableAppLock, isPinSet, enableAppLock } from '@/hooks/usePin';
import * as LocalAuthentication from 'expo-local-authentication';
import { useTheme } from '@/hooks/useTheme';
import { isVideoFile, VideoThumb } from '@/utils/videoThumb';
import * as IntentLauncher from 'expo-intent-launcher';
import { isStorageManager } from '@/modules/storage-stats';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import RNFS from 'react-native-fs';
import { getMimeType } from '@/utils/files';
import { openFile as openFileNative } from '@/modules/share-module';
import Constants from 'expo-constants';

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0'
const PRIVACY_POLICY_URL = 'https://uqurreshi34-dev.github.io/askfiles-privacy/';

export default function HomeScreen() {
  const { colors, dark } = useTheme();
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const modalWidth = Math.min(280, SCREEN_WIDTH * 0.8);
  const { storageInfo, fileCounts, loading, permissionGranted, reload: reloadStorage, reloadCounts } = useStorage();
  const { recents, reload } = useRecents();
  const { count: favCount } = useFavourites();
  const router = useRouter();
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [whatsNewVisible, setWhatsNewVisible] = useState(false);
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const { isPro } = usePro();
  const [hasAllFilesAccess, setHasAllFilesAccess] = useState(true);
  const { files: trashFiles, loadFiles: reloadTrash } = useTrash();
  const [appLockEnabled, setAppLockEnabled] = useState(false);
  const [openingUri, setOpeningUri] = useState<string | null>(null);

  useEffect(() => {
    async function checkOnboarding() {
      const done = await AsyncStorage.getItem('askfiles-onboarding-done');
      if (!done) {
        router.replace('/onboarding' as any);
      } else {
        setOnboardingChecked(true);
        const lockEnabled = isAppLockEnabled();
        setAppLockEnabled(lockEnabled);
        const seenVersion = await AsyncStorage.getItem(`askfiles-whats-new-${APP_VERSION}`);
        if (!seenVersion) {
          setWhatsNewVisible(true);
          await AsyncStorage.setItem(`askfiles-whats-new-${APP_VERSION}`, 'true');
          return; // notifications fire after What's New is dismissed
        }
      }
    }
    checkOnboarding();
  }, [isPro]);

  useFocusEffect(useCallback(() => {
    reload();
    reloadCounts();
    reloadTrash();
    isStorageManager().then(setHasAllFilesAccess);
  }, [reload, reloadCounts]));

  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') {
        isStorageManager().then(granted => {
          setHasAllFilesAccess(granted);
          if (granted && !hasAllFilesAccess) {
            reloadStorage();
          }
        });
      }
    });
    return () => sub.remove();
  }, [hasAllFilesAccess, reloadStorage]);

  useFocusEffect(useCallback(() => {
    setAppLockEnabled(isAppLockEnabled());
  }, []));

  const QUICK_ACCESS = [
    { id: '1', label: 'Images', count: pluralise(fileCounts.images, 'file'), color: colors.blueBg, iconColor: colors.blue, icon: 'image-outline', route: '/category?category=images' },
    { id: '2', label: 'Videos', count: pluralise(fileCounts.videos, 'file'), color: colors.redBrownBg, iconColor: colors.redBrown, icon: 'videocam-outline', route: '/category?category=videos' },
    { id: '3', label: 'Documents', count: pluralise(fileCounts.documents, 'file'), color: colors.purpleBg, iconColor: colors.purple, icon: 'document-outline', route: '/category?category=documents' },
    { id: '4', label: 'Downloads', count: pluralise(fileCounts.downloads, 'file'), color: colors.greenBg, iconColor: colors.green, icon: 'download-outline', route: '/category?category=downloads' },
    { id: '5', label: 'Favourites', count: pluralise(favCount, 'file'), color: colors.favRedBg, iconColor: colors.favRed, icon: 'heart-outline', route: '/favourites' },
    { id: '6', label: 'Trash', count: trashFiles.length > 0 ? pluralise(trashFiles.length, 'file') : '', color: trashFiles.length > 0 ? colors.trashBg : colors.surface, iconColor: trashFiles.length > 0 ? colors.trashAmber : colors.textMuted, icon: 'trash-outline', route: '/trash' },
  ];

  function toPath(uri: string): string {
    try { return decodeURIComponent(uri.replace('file://', '')); }
    catch { return uri.replace('file://', ''); }
  }

  function getFileColor(name: string): string {
    const ext = name.split('.').pop()?.toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic'].includes(ext ?? '')) return colors.blue;
    if (['mp4', 'mkv', 'avi', 'mov', 'webm'].includes(ext ?? '')) return colors.redBrown;
    if (['pdf', 'doc', 'docx', 'txt', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext ?? '')) return colors.purple;
    if (['mp3', 'wav', 'aac', 'flac', 'm4a'].includes(ext ?? '')) return colors.amber;
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext ?? '')) return colors.green;
    return colors.textSecondary;
  }

  if (!onboardingChecked) return <View style={{ flex: 1, backgroundColor: colors.background }} />;

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <ScrollView showsVerticalScrollIndicator={false}>

        <View style={styles.header}>
          <Text style={[styles.appName, { color: colors.textPrimary }]}>AskFiles</Text>
          <TouchableOpacity
            style={styles.settingsBtn}
            onPress={() => setSettingsVisible(true)}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="settings-outline" size={22} color={colors.textSecondary} />
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
            <View style={[styles.modalCard, { backgroundColor: colors.modalCard, width: modalWidth }]} onStartShouldSetResponder={() => true}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>AskFiles</Text>
              <Text style={[styles.modalVersion, { color: colors.textMuted }]}>Version {APP_VERSION}</Text>
              <View style={styles.modalRow}>
                <Ionicons name="phone-portrait-outline" size={18} color={colors.blue} style={{ marginRight: 10 }} />
                <Text style={[styles.modalRowText, { color: colors.textPrimary }]}>
                  Device storage: {Math.round((storageInfo?.totalBytes ?? 0) / 1_073_741_824)} GB
                </Text>
              </View>
              <View style={[styles.modalDivider, { backgroundColor: colors.divider }]} />

              <TouchableOpacity style={styles.modalRow} activeOpacity={0.7} onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}>
                <Ionicons name="shield-checkmark-outline" size={18} color={colors.purple} style={{ marginRight: 10 }} />
                <Text style={[styles.modalRowText, { color: colors.textPrimary }]}>Privacy Policy</Text>
                <Ionicons name="open-outline" size={14} color={colors.textMuted} style={{ marginLeft: 'auto' }} />
              </TouchableOpacity>

              <TouchableOpacity style={styles.modalRow} activeOpacity={0.7} onPress={() => Linking.openURL('market://details?id=com.askfiles.mobile')}>
                <Ionicons name="star-outline" size={18} color={colors.amber} style={{ marginRight: 10 }} />
                <Text style={[styles.modalRowText, { color: colors.textPrimary }]}>Rate App</Text>
                <Ionicons name="chevron-forward" size={14} color={colors.textMuted} style={{ marginLeft: 'auto' }} />
              </TouchableOpacity>

              <View style={[styles.modalDivider, { backgroundColor: colors.divider }]} />
              <TouchableOpacity
                style={styles.modalRow}
                activeOpacity={0.7}
                onPress={async () => {
                  if (appLockEnabled) {
                    const result = await LocalAuthentication.authenticateAsync({
                      promptMessage: 'Verify identity to disable app lock',
                      cancelLabel: 'Cancel',
                      disableDeviceFallback: true,
                    });
                    if (result.success) {
                      await disableAppLock();
                      setAppLockEnabled(false);
                    }
                  } else {
                    const pinSet = await isPinSet();
                    setSettingsVisible(false);
                    if (pinSet) {
                      await enableAppLock();
                      setAppLockEnabled(true);
                    } else {
                      router.push('/setpin' as any);
                    }
                  }
                }}
              >
                <Ionicons name="lock-closed-outline" size={18} color={colors.blue} style={{ marginRight: 10 }} />
                <Text style={[styles.modalRowText, { color: colors.textPrimary }]}>App Lock</Text>
                <View style={{ marginLeft: 'auto', width: 44, height: 26, borderRadius: 13, backgroundColor: appLockEnabled ? colors.blue : colors.textDisabled, justifyContent: 'center', paddingHorizontal: 3 }}>
                  <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff', alignSelf: appLockEnabled ? 'flex-end' : 'flex-start' }} />
                </View>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.modalClose, { backgroundColor: colors.surface }]} activeOpacity={0.7} onPress={() => setSettingsVisible(false)}>
                <Text style={[styles.modalCloseText, { color: colors.textSecondary }]}>Close</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>

        {/* What's New Modal */}
        <Modal
          visible={whatsNewVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setWhatsNewVisible(false)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => { setWhatsNewVisible(false); scheduleDailyReminder(isPro); }}
          >
            <View style={[styles.modalCard, { backgroundColor: colors.modalCard, width: modalWidth }]} onStartShouldSetResponder={() => true}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>What's New</Text>
              <Text style={[styles.modalVersion, { color: colors.textMuted }]}>Version {APP_VERSION}</Text>
              <View style={[styles.modalDivider, { backgroundColor: colors.divider }]} />
              {[
                { icon: 'sparkles-outline', color: colors.blue, text: 'AI-powered file search — ask in plain English' },
                { icon: 'shield-checkmark-outline', color: colors.purple, text: 'Vault — lock your private files securely' },
                { icon: 'copy-outline', color: colors.redBrown, text: 'Duplicate finder — free up storage space' },
                { icon: 'notifications-outline', color: colors.green, text: 'Daily reminders to keep your storage clean' },
              ].map((item, i) => (
                <View key={i} style={styles.modalRow}>
                  <Ionicons name={item.icon as any} size={18} color={item.color} style={{ marginRight: 10 }} />
                  <Text style={[styles.modalRowText, { flex: 1, color: colors.textPrimary }]}>{item.text}</Text>
                </View>
              ))}
              <TouchableOpacity style={[styles.modalClose, { backgroundColor: colors.surface }]} activeOpacity={0.7} onPress={() => { setWhatsNewVisible(false); scheduleDailyReminder(isPro); }}>
                <Text style={[styles.modalCloseText, { color: colors.textSecondary }]}>Got it</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>

        {!hasAllFilesAccess && (
          <TouchableOpacity
            style={[styles.permissionCard, { backgroundColor: colors.amberTint }]}
            onPress={async () => {
              try {
                await IntentLauncher.startActivityAsync(
                  'android.settings.MANAGE_APP_ALL_FILES_ACCESS_PERMISSION',
                  { data: 'package:com.askfiles.mobile' }
                );
              } catch {
                try {
                  await IntentLauncher.startActivityAsync(
                    'android.settings.MANAGE_ALL_FILES_ACCESS_PERMISSION'
                  );
                } catch {}
              }
            }}
            activeOpacity={0.8}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Ionicons name="folder-open-outline" size={18} color={colors.amber} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.permissionTitle, { color: colors.textPrimary }]}>Full storage access needed</Text>
                <Text style={[styles.permissionSub, { color: colors.textSecondary }]}>Tap to enable — required for Browse, Documents and file operations</Text>
              </View>
              <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
            </View>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.searchBar, { backgroundColor: colors.surface }]}
          onPress={() => router.push('/(tabs)/search?autofocus=1')}
          activeOpacity={0.7}
        >
          <Ionicons name="search-outline" size={16} color={colors.textMuted} style={{ marginRight: 8 }} />
          <Text style={[styles.searchText, { color: colors.textMuted }]}>Search files, folders...</Text>
        </TouchableOpacity>

        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Quick access</Text>
        <View style={styles.quickGrid}>
          {QUICK_ACCESS.map(item => (
            <TouchableOpacity
              key={item.id}
              style={[styles.quickCard, { backgroundColor: item.color }]}
              activeOpacity={0.7}
              onPress={() => router.push(item.route as any)}
            >
              <Ionicons name={item.icon as any} size={24} color={item.iconColor} style={{ marginBottom: 8 }} />
              <Text style={[styles.cardName, { color: colors.textPrimary }]}>{item.label}</Text>
              {loading ? (
                <View style={{
                  height: 12,
                  width: 48,
                  borderRadius: 6,
                  backgroundColor: dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
                  marginTop: 2,
                }} />
              ) : (
                <Text style={[styles.cardCount, { color: colors.textSecondary }]}>{item.count}</Text>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {!loading && !permissionGranted ? (
          <TouchableOpacity activeOpacity={0.8} style={[styles.permissionCard, { backgroundColor: colors.amberTint }]} onPress={() => Linking.openSettings()}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Ionicons name="warning-outline" size={18} color={colors.amber} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.permissionTitle, { color: colors.textPrimary }]}>Storage permission needed</Text>
                <Text style={[styles.permissionSub, { color: colors.textSecondary }]}>Tap to open Settings and grant access</Text>
              </View>
              <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
            </View>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity activeOpacity={0.8} onPress={() => router.push('/(tabs)/browse')}>
            {loading ? (
              <View style={{ marginHorizontal: 16, marginBottom: 20, borderRadius: 10, padding: 16, backgroundColor: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }}>
                <View style={{ height: 14, width: 120, borderRadius: 7, backgroundColor: dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)', marginBottom: 12 }} />
                <View style={{ height: 4, borderRadius: 2, backgroundColor: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', marginBottom: 8 }} />
                <View style={{ height: 10, width: 80, borderRadius: 5, backgroundColor: dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)' }} />
              </View>
            ) : (
              <StorageSummaryCard
                usedBytes={storageInfo?.usedBytes ?? 0}
                totalBytes={storageInfo?.totalBytes ?? 0}
                freeBytes={storageInfo?.freeBytes ?? 0}
                note="Includes apps and user files"
                showChevron={true}
              />
            )}
          </TouchableOpacity>
        )}

        <TouchableOpacity activeOpacity={0.8} style={[styles.largeFilesCard, { backgroundColor: colors.redBrownBg }]} onPress={() => router.push('/large-files')}>
          <View style={styles.largeFilesLeft}>
            <View style={[styles.largeFilesIcon, { backgroundColor: colors.redBrownTint }]}>
              <Ionicons name="folder-open-outline" size={22} color={colors.redBrown} />
            </View>
            <View>
              <Text style={[styles.largeFilesTitle, { color: colors.textPrimary }]}>Large Files</Text>
              <Text style={[styles.largeFilesSub, { color: colors.textSecondary }]}>Find files taking up the most space</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity activeOpacity={0.8} style={[styles.largeFilesCard, { backgroundColor: colors.amberTint }]} onPress={() => router.push('/sensitive-files' as any)}>
          <View style={styles.largeFilesLeft}>
            <View style={[styles.largeFilesIcon, { backgroundColor: colors.amberTint }]}>
              <Ionicons name="shield-outline" size={22} color={colors.amber} />
            </View>
            <View>
              <Text style={[styles.largeFilesTitle, { color: colors.textPrimary }]}>Sensitive Files</Text>
              <Text style={[styles.largeFilesSub, { color: colors.textSecondary }]}>Find and protect sensitive documents</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity activeOpacity={0.8} style={[styles.breakdownCard, { backgroundColor: colors.purpleBg }]} onPress={() => router.push('/storage-breakdown')}>
          <View style={styles.largeFilesLeft}>
            <View style={[styles.breakdownIcon, { backgroundColor: colors.purpleTint }]}>
              <Ionicons name="pie-chart-outline" size={22} color={colors.purple} />
            </View>
            <View>
              <Text style={[styles.largeFilesTitle, { color: colors.textPrimary }]}>Storage Breakdown</Text>
              <Text style={[styles.largeFilesSub, { color: colors.textSecondary }]}>See what's using your space</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </TouchableOpacity>

        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Recent</Text>
        <View style={styles.recentsList}>
          {recents.length === 0 ? (
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>No recent files — open something from Browse</Text>
          ) : (
            recents.map(file => {
              const color = getFileColor(file.name);
              const ext = file.name.split('.').pop()?.toUpperCase() ?? '?';
              return (
                <TouchableOpacity
                  key={file.uri}
                  style={[styles.recentRow, { borderBottomColor: colors.border }]}
                  onPress={async () => {
                    setOpeningUri(file.uri);
                    const mime = getMimeType(file.name);
                    try {
                      const filePath = toPath(file.uri);
                      await openFileNative(filePath, mime);
                    } catch (e) {
                      try {
                        const cachePath = `${RNFS.CachesDirectoryPath}/${file.name}`;
                        await RNFS.copyFile(toPath(file.uri), cachePath);
                        const contentUri = await FileSystemLegacy.getContentUriAsync('file://' + cachePath);
                        await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
                          data: contentUri, flags: 1, type: mime,
                        });
                      } catch (e2) {}
                    }
                    setOpeningUri(null);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={[styles.recentIcon, { backgroundColor: color + '22', overflow: 'hidden' }]}>
                    {isImageFile(file.name) ? (
                      <Image source={{ uri: file.uri }} style={styles.recentThumb} resizeMode="cover" />
                    ) : isVideoFile(file.name) ? (
                      <VideoThumb uri={file.uri} style={styles.recentThumb} />
                    ) : (
                      <Text style={[styles.recentExt, { color }]}>{ext.slice(0, 4)}</Text>
                    )}
                  </View>
                  <View style={styles.recentInfo}>
                    <Text style={[styles.recentName, { color: colors.textPrimary }]} numberOfLines={1}>{file.name}</Text>
                    <Text style={[styles.recentMeta, { color: colors.textMuted }]}>{ext} · {timeAgo(file.openedAt)}</Text>
                  </View>
                  {openingUri === file.uri && <ActivityIndicator size="small" color={colors.blue} />}
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
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  appName: { fontSize: 26, fontWeight: '500', letterSpacing: -0.5 },
  settingsBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  searchBar: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 20, borderRadius: 10, padding: 12 },
  searchText: { fontSize: 14 },
  sectionLabel: { fontSize: 11, fontWeight: '500', letterSpacing: 0.5, paddingHorizontal: 16, marginBottom: 8, textTransform: 'uppercase' },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 8, marginBottom: 16 },
  quickCard: { width: '48%', borderRadius: 12, padding: 12 },
  cardName: { fontSize: 14, fontWeight: '500', marginBottom: 2 },
  cardCount: { fontSize: 11 },
  storageWrap: { marginHorizontal: 16, marginBottom: 20, borderRadius: 10, padding: 12 },
  storageRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  storageLabel: { fontSize: 13 },
  storageVal: { fontSize: 13, fontWeight: '500' },
  storageNote: { fontSize: 10, marginTop: 6 },
  barTrack: { height: 4, borderRadius: 2, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: '#185FA5', borderRadius: 2 },
  largeFilesCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 16, marginBottom: 20, borderRadius: 12, padding: 14 },
  largeFilesLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  largeFilesIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  largeFilesTitle: { fontSize: 14, fontWeight: '600', marginBottom: 2 },
  largeFilesSub: { fontSize: 11 },
  breakdownCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 16, marginBottom: 20, borderRadius: 12, padding: 14 },
  breakdownIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  recentsList: { paddingHorizontal: 16, paddingBottom: 24 },
  emptyText: { fontSize: 13, textAlign: 'center', paddingVertical: 20 },
  recentRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 0.5 },
  recentIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  recentThumb: { width: 40, height: 40 },
  recentExt: { fontSize: 9, fontWeight: '500' },
  recentInfo: { flex: 1 },
  recentName: { fontSize: 14, fontWeight: '500', marginBottom: 2 },
  recentMeta: { fontSize: 11 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center' },
  modalCard: { borderRadius: 16, padding: 16, paddingBottom: 24, maxHeight: '90%', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 8 },
  modalTitle: { fontSize: 18, fontWeight: '600', textAlign: 'center', letterSpacing: -0.3 },
  modalVersion: { fontSize: 12, textAlign: 'center', marginTop: 4, marginBottom: 16 },
  modalDivider: { height: 0.5, marginBottom: 8 },
  modalRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  modalRowText: { fontSize: 14 },
  modalClose: { marginTop: 12, borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  modalCloseText: { fontSize: 14, fontWeight: '500' },
  permissionCard: { marginHorizontal: 16, marginBottom: 20, borderRadius: 10, padding: 14 },
  permissionTitle: { fontSize: 13, fontWeight: '600', marginBottom: 2 },
  permissionSub: { fontSize: 11 },
});
