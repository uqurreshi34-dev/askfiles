import { useCallback, useState, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Image, Modal, Linking, Alert, useWindowDimensions, AppState, ActivityIndicator, } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useRecents, timeAgo, getDateGroup, removeRecent, clearRecents } from '@/hooks/useRecents';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { scheduleDailyReminder } from '@/hooks/useNotifications';
import { usePro } from '@/hooks/usePro';
import { useTrash } from '@/hooks/useTrash';
import { isAppLockEnabled, disableAppLock, isPinSet, enableAppLock } from '@/hooks/usePin';
import * as LocalAuthentication from 'expo-local-authentication';
import { useTheme, LIGHT_PALETTES, DARK_PALETTES } from '@/hooks/useTheme';
import { isVideoFile, VideoThumb } from '@/utils/videoThumb';
import * as IntentLauncher from 'expo-intent-launcher';
import { isStorageManager, getPinnedFolders, setPinnedFolders, setPendingBrowsePath } from '@/modules/storage-stats';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import RNFS from 'react-native-fs';
import { isImageFile, getFileIcon, getMimeType, getFileColor, toPath } from '@/utils/files';
import { openFile as openFileNative, shareFiles } from '@/modules/share-module';
import Constants from 'expo-constants';
import * as MediaLibrary from 'expo-media-library';
import { useFavourites } from '@/hooks/useFavourites';
import { scanDocument, saveScanPages, saveScanAsPdf, ocrScanPages } from '@/modules/scan-module';
import { DocIndexer } from '@/modules/doc-indexer';
import { shouldShowRatePrompt, markRatePromptShown } from '@/hooks/useRatePrompt';
import * as Haptics from 'expo-haptics';
import FolderPickerModal from '@/components/FolderPickerModal';
import { useTags } from '@/hooks/useTags';
import { removeTagFromAllFiles } from '@/hooks/useFileTags';
import { setPendingTagId } from '@/modules/storage-stats';
import { removeTag } from '@/hooks/useTags';
import { MediaViewerView } from 'media-viewer';
import VideoPlayerModal from '@/components/VideoPlayerModal';
import { recordOpen, getValidStats, FileStatEntry } from 'file-stats';
import { getMostUsedEnabled, setMostUsedEnabled } from 'file-reader';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useToolsConfig, ToolId } from '@/hooks/useToolsConfig';
import ToolsGrid, { ToolDef } from '@/components/ToolsGrid';

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0'
const PRIVACY_POLICY_URL = 'https://uqurreshi34-dev.github.io/askfiles-privacy/';

export default function HomeScreen() {
  const { colors, dark, toggleTheme, palette, setPalette } = useTheme();
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const modalWidth = Math.min(280, SCREEN_WIDTH * 0.8);
  const { recents, reload } = useRecents();
  const router = useRouter();
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [whatsNewVisible, setWhatsNewVisible] = useState(false);
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const { isPro } = usePro();
  const [hasAllFilesAccess, setHasAllFilesAccess] = useState(true);
  const [hasMediaAccess, setHasMediaAccess] = useState(true);
  const { files: trashFiles, loadFiles: reloadTrash } = useTrash();
  const [appLockEnabled, setAppLockEnabled] = useState(false);
  const [openingUri, setOpeningUri] = useState<string | null>(null);
  const { count: favCount } = useFavourites();
  const [, setTick] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [activeSection, setActiveSection] = useState<'categories' | 'tools'>('categories');
  const [ratePromptVisible, setRatePromptVisible] = useState(false);
  const [scanPickerVisible, setScanPickerVisible] = useState(false);
  const [pendingScanUris, setPendingScanUris] = useState<string[]>([]);
  const [pendingScanFormat, setPendingScanFormat] = useState<'images' | 'pdf'>('images');
  const [pinnedList, setPinnedList] = useState<{ path: string; name: string }[]>([]);
  const { tags } = useTags();
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  const [playerUri, setPlayerUri] = useState<string | null>(null);
  const [mostUsed, setMostUsed] = useState<FileStatEntry[]>([]);
  const [mostUsedEnabled, setMostUsedEnabledState] = useState(() => getMostUsedEnabled());
  const [toolsEditMode, setToolsEditMode] = useState(false);
  const { loaded: toolsLoaded, visibleTools, hiddenTools, reorderTools, hideTool, restoreTool } = useToolsConfig();

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
    reload();        // rebuilds mediaContext → fresh recents, AI context, folder sizes
    reloadTrash();
    try {
      const pins: { path: string; name: string }[] = JSON.parse(getPinnedFolders());
      Promise.all(pins.map(f => RNFS.exists(f.path))).then(results => {
        const alive = pins.filter((_, i) => results[i]);
        if (alive.length !== pins.length) setPinnedFolders(JSON.stringify(alive));
        setPinnedList(alive);
      });
    } catch { setPinnedList([]); }
    isStorageManager().then(setHasAllFilesAccess);
    MediaLibrary.getPermissionsAsync().then(({ granted }) => setHasMediaAccess(granted));

    const top = getValidStats()
      .filter(s => s.count >= 3)
      .sort((a, b) => b.count - a.count || b.lastOpened - a.lastOpened)
      .slice(0, 5);
    setMostUsed(top);
  }, [reload]));

  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') {
        isStorageManager().then(setHasAllFilesAccess);
        MediaLibrary.getPermissionsAsync().then(({ granted }) => setHasMediaAccess(granted));
      }
    });
    return () => sub.remove();
  }, []);

  useFocusEffect(useCallback(() => {
    setAppLockEnabled(isAppLockEnabled());
  }, []));

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

  const QUICK_ACCESS = [
    { id: '1', label: 'Images', color: colors.blueBg, iconColor: colors.blue, icon: 'image-outline', route: '/category?category=images' },
    { id: '2', label: 'Videos', color: colors.redBrownBg, iconColor: colors.redBrown, icon: 'videocam-outline', route: '/category?category=videos' },
    { id: '3', label: 'Documents', color: colors.purpleBg, iconColor: colors.purple, icon: 'document-outline', route: '/category?category=documents' },
    { id: '4', label: 'Downloads', color: colors.greenBg, iconColor: colors.green, icon: 'download-outline', route: '/category?category=downloads' },
    { id: '5', label: 'Favourites', color: colors.favRedBg, iconColor: favCount > 0 ? colors.favRed : colors.textMuted, icon: favCount > 0 ? 'heart' : 'heart-outline', route: '/favourites' },
    { id: '6', label: 'Trash', color: trashFiles.length > 0 ? colors.trashBg : colors.surface, iconColor: trashFiles.length > 0 ? colors.trashAmber : colors.textMuted, icon: 'trash-outline', route: '/trash' },
  ];

  // Helper — fire OCR and index silently in background, never blocks UI
async function indexScansInBackground(paths: string[]) {
  try {
    const ocrResults = await ocrScanPages(paths);
    for (const [path, text] of Object.entries(ocrResults)) {
      const name = path.split('/').pop() ?? 'scan';
      const uri = 'file://' + path;
      await DocIndexer.indexScanWithText(uri, name, text);
    }
  } catch (e) {
    // silent — OCR failure never surfaces to user
  }
}

const ALL_TOOLS: Record<string, ToolDef> = {
  'network': {
    id: 'network', label: 'Network', onPress: () => router.push('/network' as any),
    circle: <View style={[styles.quickCircle, { backgroundColor: colors.blueBg }]}><Ionicons name="globe-outline" size={26} color={colors.blue} /></View>,
  },
  'large-files': {
    id: 'large-files', label: 'Large Files', onPress: () => router.push('/large-files'), disabled: !hasMediaAccess,
    circle: <View style={[styles.quickCircle, { backgroundColor: colors.redBrownBg, opacity: hasMediaAccess ? 1 : 0.4 }]}><Ionicons name="folder-open-outline" size={26} color={colors.redBrown} /></View>,
  },
  'storage': {
    id: 'storage', label: 'Storage', onPress: () => router.push('/storage-breakdown'), disabled: !hasMediaAccess,
    circle: <View style={[styles.quickCircle, { backgroundColor: colors.purpleBg, opacity: hasMediaAccess ? 1 : 0.4 }]}><Ionicons name="stats-chart-outline" size={26} color={colors.purple} /></View>,
  },
  'scanner': {
    id: 'scanner', label: 'Doc Scanner', onPress: async () => {
      if (scanning) return;
      try {
        const uris = await scanDocument();
        if (uris.length === 0) return;
        Alert.alert('Save scan as', `${uris.length} page${uris.length > 1 ? 's' : ''} scanned`, [
          { text: 'Images (JPG)', onPress: () => { setPendingScanUris(uris); setPendingScanFormat('images'); setScanPickerVisible(true); } },
          { text: 'PDF', onPress: () => { setPendingScanUris(uris); setPendingScanFormat('pdf'); setScanPickerVisible(true); } },
          { text: 'Cancel', style: 'cancel' }
        ]);
      } catch (e: any) {
        if (e?.message?.includes('SCAN_CANCELLED')) return;
        Alert.alert('Scan failed', e?.message ?? 'Could not complete scan');
      }
    },
    circle: <View style={[styles.quickCircle, { backgroundColor: colors.greenBg }]}>{scanning ? <ActivityIndicator size="small" color={colors.green} /> : <Ionicons name="camera-outline" size={26} color={colors.green} />}</View>,
  },
  'sensitive': {
    id: 'sensitive', label: 'Sensitive Files', onPress: () => router.push('/sensitive-files'), disabled: !hasMediaAccess,
    circle: <View style={[styles.quickCircle, { backgroundColor: colors.amberTint, opacity: hasMediaAccess ? 1 : 0.4 }]}><Ionicons name="shield-outline" size={26} color={colors.amber} /></View>,
  },
  'converter': {
    id: 'converter', label: 'Image Converter', onPress: () => router.push('/file-converter' as any),
    circle: <View style={[styles.quickCircle, { backgroundColor: colors.favRedBg }]}><Ionicons name="swap-horizontal-outline" size={26} color={colors.favRed} /></View>,
  },
  'csv': {
    id: 'csv', label: 'CSV Reader', onPress: () => router.push('/csv-reader' as any),
    circle: <View style={[styles.quickCircle, { backgroundColor: dark ? '#2A2200' : '#FFF8E1' }]}><Text style={{ fontSize: 13, fontWeight: '800', color: colors.yellow, letterSpacing: 0.5 }}>CSV</Text></View>,
  },
  'pdf': {
    id: 'pdf', label: 'PDF Reader', onPress: () => router.push('/pdf-viewer' as any),
    circle: <View style={[styles.quickCircle, { backgroundColor: dark ? '#2A0000' : '#FFF0F0' }]}><Text style={{ fontSize: 13, fontWeight: '800', color: colors.favRed, letterSpacing: 0.5 }}>PDF</Text></View>,
  },
  'txt': {
    id: 'txt', label: 'Text Editor', onPress: () => router.push('/text-editor' as any),
    circle: <View style={[styles.quickCircle, { backgroundColor: colors.surface }]}><Text style={{ fontSize: 13, fontWeight: '800', color: colors.textSecondary, letterSpacing: 0.5 }}>.TXT</Text></View>,
  },
};

if (!onboardingChecked) return <View style={{ flex: 1, backgroundColor: colors.background }} />;

  return (
    <SafeAreaView edges={['left', 'right']} style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <ScrollView showsVerticalScrollIndicator={false}>

      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ width: 30, height: 30, marginRight: 8, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="folder" size={30} color="#F5B731" />
            <View style={{ position: 'absolute', top: 14, backgroundColor: '#3A7FD4', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 0.5 }}>
              <Text style={{ fontSize: 7, fontWeight: '700', color: '#fff' }} allowFontScaling={false}>AI</Text>
            </View>
          </View>
          <Text style={[styles.appName, { color: colors.textPrimary }]}>AskFiles</Text>
        </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <TouchableOpacity
              style={styles.settingsBtn}
              onPress={toggleTheme}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name={dark ? 'sunny-outline' : 'moon-outline'} size={22} color={colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.settingsBtn}
              onPress={() => setSettingsVisible(true)}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="settings-outline" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
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
              <TouchableOpacity
                style={styles.modalRow}
                activeOpacity={0.7}
                onPress={() => {
                  const next = !mostUsedEnabled;
                  setMostUsedEnabledState(next);
                  setMostUsedEnabled(next);
                }}
              >
                <Ionicons name="star-outline" size={18} color={colors.blue} style={{ marginRight: 10 }} />
                <Text style={[styles.modalRowText, { color: colors.textPrimary }]}>Most Used</Text>
                <View style={{ marginLeft: 'auto', width: 44, height: 26, borderRadius: 13, backgroundColor: mostUsedEnabled ? colors.blue : colors.textDisabled, justifyContent: 'center', paddingHorizontal: 3 }}>
                  <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff', alignSelf: mostUsedEnabled ? 'flex-end' : 'flex-start' }} />
                </View>
              </TouchableOpacity>
              <View style={[styles.modalDivider, { backgroundColor: colors.divider, marginTop: 8 }]} />
              <Text style={{ fontSize: 11, fontWeight: '600', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
                Background
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 4 }}>
                {(dark ? DARK_PALETTES : LIGHT_PALETTES).map(p => (
                  <TouchableOpacity
                    key={p.id}
                    onPress={() => setPalette(p.id)}
                    activeOpacity={0.7}
                    style={{ alignItems: 'center' }}
                  >
                    <View style={{
                      width: 36, height: 36, borderRadius: 18,
                      backgroundColor: p.swatch,
                      borderWidth: palette === p.id ? 2.5 : 1,
                      borderColor: palette === p.id ? colors.blue : colors.border,
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      {palette === p.id && (
                        <Ionicons name="checkmark" size={16} color={dark ? '#fff' : '#111'} />
                      )}
                    </View>
                    <Text style={{ fontSize: 10, color: colors.textMuted, marginTop: 4 }}>{p.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity style={[styles.modalClose, { backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.textDisabled }]} activeOpacity={0.7} onPress={() => setSettingsVisible(false)}>
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
              <TouchableOpacity style={[styles.modalClose, { backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.textDisabled}]} activeOpacity={0.7} onPress={() => { setWhatsNewVisible(false); scheduleDailyReminder(isPro); }}>
                <Text style={[styles.modalCloseText, { color: colors.textSecondary }]}>Got it</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>

        {/* Rate Prompt Modal */}
        <Modal
          visible={ratePromptVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setRatePromptVisible(false)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setRatePromptVisible(false)}
          >
            <View style={[styles.modalCard, { backgroundColor: colors.modalCard, width: modalWidth }]} onStartShouldSetResponder={() => true}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Enjoying AskFiles?</Text>
              <Text style={[styles.modalVersion, { color: colors.textMuted }]}>A quick rating helps a lot ⭐</Text>
              <View style={[styles.modalDivider, { backgroundColor: colors.divider }]} />
              <TouchableOpacity
                style={[styles.modalClose, { backgroundColor: colors.blue, marginBottom: 8 }]}
                activeOpacity={0.7}
                onPress={() => { setRatePromptVisible(false); Linking.openURL('market://details?id=com.askfiles.mobile'); }}
              >
                <Text style={[styles.modalCloseText, { color: '#fff' }]}>Rate AskFiles</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalClose, { backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.textDisabled }]}
                activeOpacity={0.7}
                onPress={() => setRatePromptVisible(false)}
              >
                <Text style={[styles.modalCloseText, { color: colors.textSecondary }]}>Maybe later</Text>
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
        {!hasMediaAccess && (
  <TouchableOpacity
    style={[styles.permissionCard, { backgroundColor: colors.amberTint }]}
    onPress={async () => {
      const { status, canAskAgain } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted' && !canAskAgain) {
        await IntentLauncher.startActivityAsync(
          'android.settings.APPLICATION_DETAILS_SETTINGS',
          { data: 'package:com.askfiles.mobile' }
        );
      }
    }}
    activeOpacity={0.8}
  >
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Ionicons name="images-outline" size={18} color={colors.amber} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.permissionTitle, { color: colors.textPrimary }]}>Media access needed</Text>
        <Text style={[styles.permissionSub, { color: colors.textSecondary }]}>Tap to enable — required for Images, Videos and Storage Breakdown</Text>
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
          <Text style={[styles.searchText, { color: colors.textMuted }]}>Search files...</Text>
        </TouchableOpacity>

        {/* Section tabs */}
        <View style={{ flexDirection: 'row', marginHorizontal: 16, marginBottom: 16, borderRadius: 10, backgroundColor: colors.surface, padding: 3 }}>
          <TouchableOpacity
            style={{ flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center', backgroundColor: activeSection === 'categories' ? colors.card : 'transparent' }}
            onPress={() => setActiveSection('categories')}
          >
            <Text style={{ fontSize: 13, fontWeight: '500', color: activeSection === 'categories' ? colors.blue : colors.textMuted }}>Quick Access</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{ flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center', backgroundColor: activeSection === 'tools' ? colors.card : 'transparent' }}
            onPress={() => setActiveSection('tools')}
          >
            <Text style={{ fontSize: 13, fontWeight: '500', color: activeSection === 'tools' ? colors.blue : colors.textMuted }}>Tools</Text>
          </TouchableOpacity>
        </View>

        {activeSection === 'categories' ? (
          <>
            <View style={styles.quickGrid}>
              {QUICK_ACCESS.map(item => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.quickCell}
                  activeOpacity={0.7}
                  onPress={() => router.push(item.route as any)}
                >
                  <View style={[styles.quickCircle, { backgroundColor: item.color }]}>
                    <Ionicons name={item.icon as any} size={26} color={item.iconColor} />
                  </View>
                  <Text style={[styles.quickCellLabel, { color: colors.textPrimary }]} numberOfLines={1}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {pinnedList.length > 0 && (
              <>
                <Text style={[styles.sectionLabel, { color: colors.textMuted, marginTop: 4, marginBottom: 8 }]}>Pinned</Text>
                <View style={styles.quickGrid}>
                {pinnedList.map((folder) => (
                    <TouchableOpacity
                      key={folder.path}
                      style={styles.quickCell}
                      activeOpacity={0.7}
                      onPress={() => {
                        setPendingBrowsePath(`file://${folder.path.replace(/\/$/, '')}/`);
                        router.push('/browse' as any);
                      }}
                      onLongPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        Alert.alert('Unpin folder', `Remove "${folder.name}" from Home?`, [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Unpin', style: 'destructive', onPress: () => {
                            const updated = pinnedList.filter(f => f.path !== folder.path);
                            setPinnedList(updated);
                            setPinnedFolders(JSON.stringify(updated));
                          }},
                        ]);
                      }}
                    >
                      <View style={[styles.quickCircle, { backgroundColor: colors.yellow + '22' }]}>
                        <Ionicons name="folder" size={28} color={colors.yellow} />
                      </View>
                      <Text style={[styles.quickCellLabel, { color: colors.textPrimary }]} numberOfLines={1}>{folder.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                </>
        )}
        {tags.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { color: colors.textMuted, marginTop: 4, marginBottom: 8 }]}>Tags</Text>
            <View style={styles.quickGrid}>
              {tags.map(tag => (
                <TouchableOpacity
                  key={tag.id}
                  style={styles.quickCell}
                  activeOpacity={0.7}
                  onPress={() => {
                    setPendingTagId(tag.id);
                    router.push('/tag-files' as any);
                  }}
                  onLongPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    Alert.alert('Delete tag', `Delete "${tag.name}" and remove it from all files?`, [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Delete', style: 'destructive', onPress: async () => {
                        await removeTagFromAllFiles(tag.id);
                        await removeTag(tag.id);
                      }},
                    ]);
                  }}
                >
                  <View style={[styles.quickCircle, { backgroundColor: tag.color + '22' }]}>
                    <Ionicons name={tag.icon as any} size={26} color={tag.color} />
                  </View>
                  <Text style={[styles.quickCellLabel, { color: colors.textPrimary }]} numberOfLines={1}>{tag.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}
      </>
    ) : (
      toolsLoaded ? (
        <ToolsGrid
          tools={visibleTools.map(id => ALL_TOOLS[id]).filter(Boolean) as ToolDef[]}
          hiddenTools={hiddenTools}
          editMode={toolsEditMode}
          onEditMode={setToolsEditMode}
          onReorder={reorderTools}
          onHide={hideTool}
          onRestore={restoreTool}
          getToolDef={(id) => ALL_TOOLS[id]}
          colors={colors}
        />
      ) : null
    )}
        {mostUsedEnabled && mostUsed.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { color: colors.textMuted, marginTop: 8 }]}>Most Used</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16, gap: 12, paddingBottom: 16 }}
            >
              {mostUsed.map(stat => {
                const name = stat.uri.split('/').pop() ?? '';
                const decodedName = (() => { try { return decodeURIComponent(name); } catch { return name; } })();
                const color = getFileColor(decodedName);
                return (
                  <TouchableOpacity
                    key={stat.uri}
                    style={{ width: 72, alignItems: 'center', gap: 6 }}
                    activeOpacity={0.7}
                    onPress={async () => {
                      recordOpen(stat.uri);
                      if (isImageFile(decodedName)) { setViewerUri(stat.uri); return; }
                      if (isVideoFile(decodedName)) { setPlayerUri(stat.uri); return; }
                      setOpeningUri(stat.uri);
                      const mime = getMimeType(decodedName);
                      try {
                        await openFileNative(toPath(stat.uri), mime);
                      } catch {
                        try {
                          const cachePath = `${RNFS.CachesDirectoryPath}/${decodedName}`;
                          await RNFS.copyFile(toPath(stat.uri), cachePath);
                          const contentUri = await FileSystemLegacy.getContentUriAsync('file://' + cachePath);
                          await IntentLauncher.startActivityAsync('android.intent.action.VIEW', { data: contentUri, flags: 1, type: mime });
                        } catch {}
                      }
                      setOpeningUri(null);
                    }}
                  >
                    <View style={{ width: 56, height: 56, borderRadius: 12, backgroundColor: color + '22', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                      {isImageFile(decodedName) ? (
                        <Image source={{ uri: stat.uri }} style={{ width: 56, height: 56 }} resizeMode="cover" />
                      ) : isVideoFile(decodedName) ? (
                        <VideoThumb uri={stat.uri} style={{ width: 56, height: 56 }} />
                      ) : (
                        <Ionicons name={getFileIcon(decodedName) as any} size={26} color={color} />
                      )}
                    </View>
                    <Text style={{ fontSize: 10, color: colors.textSecondary, textAlign: 'center', width: 72 }} numberOfLines={2}>{decodedName}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 8, marginTop: 8 }}>
          <Text style={[styles.sectionLabel, { color: colors.textMuted, paddingHorizontal: 0, marginBottom: 0 }]}>Recent</Text>
          {recents.length > 0 && (
            <TouchableOpacity onPress={async () => { await clearRecents(); reload(); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={{ fontSize: 12, color: colors.blue }}>Clear all</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.recentsList}>
          {recents.length === 0 ? (
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>No recent files — open something from Browse</Text>
          ) : (
            (() => {
              const groups = ['Today', 'Yesterday', 'This week', 'Older'];
              const grouped = groups.reduce((acc, g) => {
                acc[g] = recents.filter(f => getDateGroup(f.openedAt) === g);
                return acc;
              }, {} as Record<string, typeof recents>);
              return groups.flatMap(group => {
                const files = grouped[group];
                if (!files.length) return [];
                return [
                  <Text key={`header-${group}`} style={{ fontSize: 11, fontWeight: '500', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, paddingBottom: 4, paddingTop: group === 'Today' ? 0 : 8 }}>
                    {group}
                  </Text>,
                  ...files.map(file => {
                    const color = getFileColor(file.name);
                    const ext = file.name.split('.').pop()?.toUpperCase() ?? '?';
                    const locationRaw = file.uri.replace('file:///storage/emulated/0/', '').split('/').slice(0, -1).pop() ?? 'Storage';
                    const location = (() => { try { return decodeURIComponent(locationRaw); } catch { return locationRaw; } })();
                    return (
                      <TouchableOpacity
                        key={file.uri}
                        style={[styles.recentRow, { borderBottomColor: colors.border }]}
                        onPress={async () => {
                          recordOpen(file.uri);
                          if (isImageFile(file.name)) {
                            setViewerUri(file.uri);
                            return;
                          }
                          if (isVideoFile(file.name)) {
                            setPlayerUri(file.uri);
                            return;
                          }
                          setOpeningUri(file.uri);
                          const mime = getMimeType(file.name);
                          try {
                            await openFileNative(toPath(file.uri), mime);
                          } catch (e) {
                            try {
                              const cachePath = `${RNFS.CachesDirectoryPath}/${file.name}`;
                              await RNFS.copyFile(toPath(file.uri), cachePath);
                              const contentUri = await FileSystemLegacy.getContentUriAsync('file://' + cachePath);
                              await IntentLauncher.startActivityAsync('android.intent.action.VIEW', { data: contentUri, flags: 1, type: mime });
                            } catch {}
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
                            <Ionicons name={getFileIcon(file.name) as any} size={20} color={color} />
                          )}
                        </View>
                        <View style={styles.recentInfo}>
                          <Text style={[styles.recentName, { color: colors.textPrimary }]} numberOfLines={1}>{file.name}</Text>
                          <Text style={[styles.recentMeta, { color: colors.textMuted }]}>{ext} · {timeAgo(file.openedAt)} · {location}</Text>
                        </View>
                        {openingUri === file.uri ? (
                          <ActivityIndicator size="small" color={colors.blue} />
                        ) : (
                          <TouchableOpacity onPress={async () => { await removeRecent(file.uri); reload(); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ padding: 4 }}>
                            <Ionicons name="close-circle" size={16} color={colors.textMuted} />
                          </TouchableOpacity>
                        )}
                      </TouchableOpacity>
                    );
                  })
                ];
              });
            })()
          )}
        </View>
        <FolderPickerModal
        visible={scanPickerVisible}
        onClose={() => setScanPickerVisible(false)}
        onSave={async (folderPath) => {
          setScanPickerVisible(false);
          setScanning(true);
          try {
            if (pendingScanFormat === 'images') {
              const saved = await saveScanPages(pendingScanUris, folderPath);
              const friendlyPath = folderPath.replace('/storage/emulated/0/', '').replace(/\/$/, '') || 'Internal Storage';
              Alert.alert('Saved', `${saved.length} image${saved.length > 1 ? 's' : ''} saved to ${friendlyPath}`);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              indexScansInBackground(saved);
            } else {
              const path = await saveScanAsPdf(pendingScanUris, folderPath);
              const friendlyPath = folderPath.replace('/storage/emulated/0/', '').replace(/\/$/, '') || 'Internal Storage';
              Alert.alert('Saved', `PDF saved to ${friendlyPath}`);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              indexScansInBackground([path]);
            }
            const show = await shouldShowRatePrompt();
            if (show) { await markRatePromptShown(); setRatePromptVisible(true); }
          } finally { setScanning(false); }
        }}
        defaultPath="/storage/emulated/0/Documents/Scans"
        defaultLabel="Documents/Scans"
        defaultSubLabel="Default save location"
        title="Choose location"
      />
      </ScrollView>
      <Modal visible={viewerUri !== null} transparent={false} animationType="fade" onRequestClose={() => setViewerUri(null)} statusBarTranslucent>
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <StatusBar style="light" backgroundColor="#000" />
          {viewerUri && (
            <MediaViewerView
              uri={viewerUri}
              onTap={() => setViewerUri(null)}
              style={StyleSheet.absoluteFill}
            />
          )}
          <SafeAreaView style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }} pointerEvents="box-none">
            <View style={{ alignItems: 'center', paddingBottom: 24 }}>
              <View style={{ flexDirection: 'row', gap: 0, backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 30, overflow: 'hidden' }}>
                <TouchableOpacity onPress={async () => {
                  if (!viewerUri) return;
                  try { await shareFiles([toPath(viewerUri)], 'image/*'); } catch {}
                }} style={{ paddingHorizontal: 20, paddingVertical: 12 }}>
                  <Ionicons name="share-outline" size={22} color="#222" />
                </TouchableOpacity>
                <View style={{ width: 0.5, backgroundColor: 'rgba(0,0,0,0.15)', marginVertical: 10 }} />
                <TouchableOpacity onPress={async () => {
                  if (!viewerUri) return;
                  try { await openFileNative(toPath(viewerUri), getMimeType(viewerUri.split('/').pop() ?? '')); } catch {}
                }} style={{ paddingHorizontal: 20, paddingVertical: 12 }}>
                  <Ionicons name="open-outline" size={22} color="#222" />
                </TouchableOpacity>
              </View>
            </View>
          </SafeAreaView>
        </View>
      </Modal>
      <VideoPlayerModal uri={playerUri} onClose={() => setPlayerUri(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  appName: { fontSize: 20, fontWeight: '600', letterSpacing: -0.5 },
  settingsBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  searchBar: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 20, borderRadius: 10, padding: 12 },
  searchText: { fontSize: 14 },
  sectionLabel: { fontSize: 11, fontWeight: '500', letterSpacing: 0.5, paddingHorizontal: 16, marginBottom: 8, textTransform: 'uppercase' },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, rowGap: 16, marginBottom: 16 },
  quickCell: { width: '33.33%', alignItems: 'center' },
  quickCircle: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  quickCellLabel: { fontSize: 12, fontWeight: '500', textAlign: 'center' },
  cardName: { fontSize: 14, fontWeight: '500', marginBottom: 2 },
  cardCount: { fontSize: 11 },
  storageWrap: { marginHorizontal: 16, marginBottom: 20, borderRadius: 10, padding: 12 },
  storageRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  storageLabel: { fontSize: 13 },
  storageVal: { fontSize: 13, fontWeight: '500' },
  storageNote: { fontSize: 10, marginTop: 6 },
  barTrack: { height: 4, borderRadius: 2, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: '#185FA5', borderRadius: 2 },
  largeFilesCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 16, marginBottom: 12, borderRadius: 12, padding: 14 },
  largeFilesLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, marginRight: 8 },
  largeFilesIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  largeFilesTitle: { fontSize: 14, fontWeight: '600', marginBottom: 2 },
  largeFilesSub: { fontSize: 11 },
  breakdownCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 16, marginBottom: 12, borderRadius: 12, padding: 14 },
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
