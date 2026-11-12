import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet, Text, View, FlatList, TouchableOpacity,
  ActivityIndicator, Alert, TextInput, Switch,
  ScrollView, Modal, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { formatSize, getFileColor, isImageFile, getFileIcon, getMimeType } from '@/utils/files';
import { isVideoFile, VideoThumb } from '@/utils/videoThumb';
import * as Haptics from 'expo-haptics';
import * as SecureStore from 'expo-secure-store';
import RNFS from 'react-native-fs';
import { connect, listDirectory, downloadFile, uploadFile, disconnect } from 'webdav-client';
import { readDirectory } from 'file-reader';
import { scanFile, openFile as openFileNative } from '@/modules/share-module';
import { getStorageVolumes } from '@/modules/storage-stats';
import { useLanguage } from '@/modules/appLanguage';
import { netText } from '@/modules/i18n/netText';

// ─── Types ───────────────────────────────────────────────────────────────────

interface WebDavItem {
  name: string;
  isDirectory: boolean;
  size: number;
  modifiedTime: number;
  path?: string;
}

interface Credentials {
    url: string;
    username: string;
    password: string;
    path: string;
  }

type Stage = 'connect' | 'browse';

const CREDS_KEY = 'webdav_credentials';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function friendlyPickerPath(pickerPath: string, volumes: { name: string; path: string; type: string }[], storageLabel: string): { prefix: string; current: string } {
  let display = pickerPath.replace('file:///storage/emulated/0/', `${storageLabel}/`);
  const sdVol = volumes.find(v => v.type === 'sdcard' && pickerPath.includes(v.path));
  if (sdVol) display = display.replace(`file://${sdVol.path}/`, `${sdVol.name}/`).replace(`file://${sdVol.path}`, sdVol.name);
  const segs = display.split('/').filter(Boolean).map(seg => { try { return decodeURIComponent(seg); } catch { return seg; } });
  const current = segs.pop() ?? '';
  return { prefix: segs.length > 0 ? segs.join('/') + '/' : '', current };
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function WebDavScreen() {
  const { colors } = useTheme();
  const lang = useLanguage();
  const t = netText(lang);
  const router = useRouter();

  const [stage, setStage] = useState<Stage>('connect');

  // Connect form
  const [url, setUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [path, setPath] = useState('');

  // Active credentials stored in ref — never in visible state
  const credsRef = useRef<Credentials | null>(null);
  const baseUrlRef = useRef('');

  // Browse
  const [items, setItems] = useState<WebDavItem[]>([]);
  const [currentPath, setCurrentPath] = useState('');
  const [breadcrumbs, setBreadcrumbs] = useState<{ name: string; path: string }[]>([]);
  const [loading, setLoading] = useState(false);

  // Download / open
  const [openingFile, setOpeningFile] = useState<string | null>(null);
  const [downloadingFile, setDownloadingFile] = useState<string | null>(null);

  // Upload
  const [showPicker, setShowPicker] = useState(false);
  const [pickerPath, setPickerPath] = useState('file:///storage/emulated/0/');
  const [pickerItems, setPickerItems] = useState<{ name: string; uri: string; isDirectory: boolean }[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [uploadingFile, setUploadingFile] = useState<string | null>(null);
  const [volumes, setVolumes] = useState<{ name: string; path: string; type: string }[]>([]);

  // ─── Mount ────────────────────────────────────────────────────────────────

  useEffect(() => {
    getStorageVolumes().then((vols: any) => setVolumes(vols));
  }, []);

  useEffect(() => {
    SecureStore.getItemAsync(CREDS_KEY).then(raw => {
      if (!raw) return;
      try {
        const saved: Credentials = JSON.parse(raw);
        setUrl(saved.url);
        setUsername(saved.username);
        setPath(saved.path ?? '');
        // Password intentionally not pre-filled — user must re-enter
        setRemember(true);
      } catch {}
    });
  }, []);

  // ─── Connect ──────────────────────────────────────────────────────────────

  async function handleConnect() {
    if (!url.trim() || !username.trim() || !password.trim()) {
      Alert.alert(t.missingFields, t.webdavRequired);
      return;
    }
    let base = url.trim().replace(/\/$/, '');
    if (!base.startsWith('http://') && !base.startsWith('https://')) {
        base = 'http://' + base;
    }
    const suffix = path.trim() ? '/' + path.trim().replace(/^\//, '').replace(/\/$/, '') + '/' : '/';
    const fullUrl = base + suffix;
  
    if (fullUrl.startsWith('http://')) {
      const proceed = await new Promise<boolean>(resolve =>
        Alert.alert(
          t.insecure,
          t.insecureMsg,
          [
            { text: t.cancel, style: 'cancel', onPress: () => resolve(false) },
            { text: t.continueAnyway, onPress: () => resolve(true) },
          ]
        )
      );
      if (!proceed) return;
    }
    setConnecting(true);
    try {
      await connect(fullUrl, username.trim(), password);
      credsRef.current = { url: url.trim(), username: username.trim(), password, path: path.trim() };
      baseUrlRef.current = fullUrl.match(/^https?:\/\/[^/]+/)?.[0] ?? '';
      if (remember) {
        await SecureStore.setItemAsync(CREDS_KEY, JSON.stringify(credsRef.current));
      } else {
        await SecureStore.deleteItemAsync(CREDS_KEY);
      }
      setBreadcrumbs([{ name: '/', path: fullUrl }]);
      await loadDirectory(fullUrl);
      setStage('browse');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      const msg = (e?.message ?? '').toLowerCase();
      if (msg.includes('401') || msg.includes('auth') || msg.includes('password') || msg.includes('denied')) {
        Alert.alert(t.signInFailed, t.wrongCreds);
      } else if (msg.includes('403')) {
        Alert.alert(t.accessDenied, t.refusedAccess);
      } else if (msg.includes('connect') || msg.includes('timeout') || msg.includes('unreachable') || msg.includes('refused') || msg.includes('failed')) {
        Alert.alert(t.cannotConnect, t.couldNotReachServer);
      } else {
        Alert.alert(t.connectionFailed, lang === 'en' && e?.message ? e.message : t.somethingWrong);
      }
    } finally {
      setConnecting(false);
    }
  }

  // ─── Load directory ───────────────────────────────────────────────────────

  async function loadDirectory(path: string) {
    setLoading(true);
    try {
      const result = await listDirectory(path);
      const sorted = (result as WebDavItem[]).slice().sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });
      setItems(sorted);
      setCurrentPath(path);
    } catch {
      Alert.alert(t.error, t.couldNotOpenFolder);
    } finally {
      setLoading(false);
    }
  }

  // ─── Navigate ─────────────────────────────────────────────────────────────

  function navigateTo(item: WebDavItem) {
    if (!item.isDirectory) return;
    const href = item.path ?? '';
    const fullPath = href.startsWith('http') ? href : `${baseUrlRef.current}${href}`;
    const cleanPath = fullPath.endsWith('/') ? fullPath : `${fullPath}/`;
    setBreadcrumbs(prev => [...prev, { name: item.name, path: cleanPath }]);
    loadDirectory(cleanPath);
  }

  function navigateToBreadcrumb(index: number) {
    const crumb = breadcrumbs[index];
    setBreadcrumbs(prev => prev.slice(0, index + 1));
    loadDirectory(crumb.path);
  }

  // ─── Download ─────────────────────────────────────────────────────────────

  function buildRemoteUrl(item: WebDavItem): string {
    const href = item.path ?? '';
    return href.startsWith('http') ? href : `${baseUrlRef.current}${href}`;
  }

  async function handleDownload(item: WebDavItem) {
    const localPath = `${RNFS.DownloadDirectoryPath}/${item.name}`;
    const exists = await RNFS.exists(localPath);
    if (exists) {
      Alert.alert(
        t.fileExists,
        t.existsInDownloads(item.name),
        [
          { text: t.cancel, style: 'cancel' },
          { text: t.replace, style: 'destructive', onPress: () => startDownload(item, localPath) },
        ]
      );
      return;
    }
    startDownload(item, localPath);
  }

  async function startDownload(item: WebDavItem, localPath: string) {
    const remotePath = buildRemoteUrl(item);
    setDownloadingFile(item.name);
    try {
      await downloadFile(remotePath, localPath);
      await scanFile(localPath).catch(() => {});
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(t.downloaded, t.savedToDownloads(item.name));
    } catch {
      Alert.alert(t.downloadFailed, t.couldNotDownload);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setDownloadingFile(null);
    }
  }

  async function handleOpen(item: WebDavItem) {
    const remotePath = buildRemoteUrl(item);
    const cachePath = `${RNFS.CachesDirectoryPath}/${item.name}`;
    setOpeningFile(item.name);
    try {
      await downloadFile(remotePath, cachePath);
      await openFileNative(cachePath, getMimeType(item.name));
    } catch {
      Alert.alert(t.couldNotOpen, t.noApp);
    } finally {
      setOpeningFile(null);
    }
  }

  // ─── Upload ───────────────────────────────────────────────────────────────

  async function loadPickerDir(path: string) {
    setPickerLoading(true);
    try {
      const decoded = (() => { try { return decodeURIComponent(path.replace('file://', '')); } catch { return path.replace('file://', ''); } })();
      const result = await readDirectory(decoded, false);
      const folders = result
        .filter((item: any) => item.isDirectory)
        .map((item: any) => ({ name: item.name, uri: item.uri, isDirectory: true }))
        .sort((a: any, b: any) => a.name.localeCompare(b.name));
      const files = result
        .filter((item: any) => !item.isDirectory)
        .map((item: any) => ({ name: item.name, uri: item.uri, isDirectory: false }))
        .sort((a: any, b: any) => a.name.localeCompare(b.name));
      setPickerItems([...folders, ...files]);
    } catch {}
    finally { setPickerLoading(false); }
  }

  async function handleUpload(fileUri: string, fileName: string) {
    setShowPicker(false);
    setUploadingFile(fileName);
    try {
      let srcPath = fileUri;
      try { srcPath = decodeURIComponent(fileUri.replace('file://', '')); }
      catch { srcPath = fileUri.replace('file://', ''); }
      const remotePath = currentPath.endsWith('/') ? `${currentPath}${fileName}` : `${currentPath}/${fileName}`;
      await uploadFile(srcPath, remotePath);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(t.uploaded, t.uploadedOk(fileName));
      await loadDirectory(currentPath);
    } catch {
      Alert.alert(t.uploadFailed, t.couldNotUpload);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setUploadingFile(null);
    }
  }

  // ─── Back ─────────────────────────────────────────────────────────────────

  function handleBack() {
    if (stage === 'browse') {
      if (breadcrumbs.length > 1) {
        navigateToBreadcrumb(breadcrumbs.length - 2);
      } else {
        disconnect().catch(() => {});
        setStage('connect');
        setItems([]);
        setBreadcrumbs([]);
        setCurrentPath('');
        credsRef.current = null;
        baseUrlRef.current = '';
      }
    } else {
      router.back();
    }
  }

  // ─── Render file row ──────────────────────────────────────────────────────

  function renderItem({ item }: { item: WebDavItem }) {
    const color = item.isDirectory ? colors.yellow : getFileColor(item.name);
    const isDownloading = downloadingFile === item.name;

    return (
      <TouchableOpacity
        style={[styles.row, { borderBottomColor: colors.border }]}
        onPress={() => {
          if (item.isDirectory) navigateTo(item);
          else handleOpen(item);
        }}
        onLongPress={() => {
          if (!item.isDirectory) handleDownload(item);
        }}
        activeOpacity={0.6}
        disabled={!!downloadingFile || !!openingFile}
      >
        <View style={[styles.fileIcon, { backgroundColor: color + '22' }]}>
          {item.isDirectory ? (
            <Ionicons name="folder" size={22} color={color} />
          ) : (
            <Ionicons name={getFileIcon(item.name) as any} size={20} color={color} />
          )}
        </View>
        <View style={styles.fileInfo}>
          <Text style={[styles.fileName, { color: colors.textPrimary }]} numberOfLines={1}>{item.name}</Text>
          <Text style={[styles.fileMeta, { color: colors.textMuted }]}>
            {item.isDirectory ? t.folder : formatSize(item.size)}
          </Text>
        </View>
        {item.isDirectory ? (
          <Ionicons name="chevron-forward" size={16} color={colors.textDisabled} />
        ) : openingFile === item.name ? (
          <ActivityIndicator size="small" color={colors.blue} />
        ) : isDownloading ? (
          <ActivityIndicator size="small" color={colors.blue} />
        ) : (
          <Ionicons name="ellipsis-horizontal" size={18} color={colors.textMuted} />
        )}
      </TouchableOpacity>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  const headerTitle = stage === 'connect' ? 'WebDAV' : breadcrumbs[breadcrumbs.length - 1]?.name ?? t.browse;
  const { prefix: pickerPrefix, current: pickerCurrent } = friendlyPickerPath(pickerPath, volumes, t.storage);

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={[styles.container, { backgroundColor: colors.background }]}>

      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.background }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>{headerTitle}</Text>
          {stage === 'browse' ? (
            <TouchableOpacity
              onPress={() => { setPickerPath('file:///storage/emulated/0/'); loadPickerDir('file:///storage/emulated/0/'); setShowPicker(true); }}
              style={styles.backBtn}
              disabled={!!downloadingFile || !!uploadingFile}
            >
              <Ionicons name="cloud-upload-outline" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          ) : (
            <View style={{ width: 36 }} />
          )}
        </View>

        {/* Breadcrumbs */}
        {stage === 'browse' && (
          <View style={styles.pathRow}>
            {breadcrumbs.map((crumb, index) => (
              <TouchableOpacity
                key={index}
                onPress={() => index < breadcrumbs.length - 1 ? navigateToBreadcrumb(index) : undefined}
                activeOpacity={index < breadcrumbs.length - 1 ? 0.6 : 1}
                disabled={index === breadcrumbs.length - 1}
              >
                <Text style={[styles.pathSegment, { color: colors.textMuted }, index === breadcrumbs.length - 1 && styles.pathSegmentActive]}>
                  {index > 0 ? '/' : ''}{crumb.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* ── Stage: Connect ── */}
      {stage === 'connect' && (
        <ScrollView contentContainerStyle={styles.formContainer} keyboardShouldPersistTaps="handled">
          <View style={[styles.formCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.formLabel, { color: colors.textSecondary }]}>{t.serverAddress}</Text>
            <TextInput
                style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary }]}
                value={url}
                onChangeText={setUrl}
                placeholder="https://yourserver.com"
                placeholderTextColor={colors.textSecondary}
                keyboardType="url"
                autoCapitalize="none"
                autoCorrect={false}
            />
            <Text style={{ fontSize: 11, color: colors.textSecondary, marginBottom: 4 }}>
                {t.serverSub}
            </Text>
            <Text style={[styles.formLabel, { color: colors.textSecondary }]}>{t.path}</Text>
            <TextInput
                style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary }]}
                value={path}
                onChangeText={setPath}
                placeholder="/remote.php/dav/files/username/"
                placeholderTextColor={colors.textSecondary}
                autoCapitalize="none"
                autoCorrect={false}
            />
            <Text style={{ fontSize: 11, color: colors.textSecondary, marginBottom: 4 }}>
                {t.nextcloudPath}
            </Text>
            <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 4, marginBottom: 4 }}>
                {t.tested}
            </Text>
            <Text style={[styles.formLabel, { color: colors.textSecondary }]}>{t.username}</Text>
            <TextInput
                style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary }]}
                value={username}
                onChangeText={setUsername}
                placeholder={t.usernamePh}
                placeholderTextColor={colors.textSecondary}
                autoCapitalize="none"
                autoCorrect={false}
            />
            <Text style={[styles.formLabel, { color: colors.textSecondary }]}>{t.password}</Text>
            <TextInput
                style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary }]}
                value={password}
                onChangeText={setPassword}
                placeholder={t.passwordPh}
                placeholderTextColor={colors.textSecondary}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
            />
            <View style={styles.rememberRow}>
                <Text style={[styles.rememberLabel, { color: colors.textSecondary }]}>{t.remember}</Text>
                <Switch
                value={remember}
                onValueChange={setRemember}
                trackColor={{ false: colors.border, true: colors.blue }}
                thumbColor="#fff"
                />
            </View>
            <Text style={[styles.securityNote, { color: colors.textSecondary }]}>
                {t.credsStored}
            </Text>
            <TouchableOpacity
                style={[styles.connectBtn, { backgroundColor: colors.blue }, connecting && { opacity: 0.7 }]}
                onPress={handleConnect}
                disabled={connecting}
            >
                {connecting
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.connectBtnText}>{t.connect}</Text>
                }
            </TouchableOpacity>
            </View>
        </ScrollView>
      )}

      {/* ── Stage: Browse ── */}
      {stage === 'browse' && (
        <>
          {loading ? (
            <View style={styles.centered}>
              <ActivityIndicator color={colors.blue} />
            </View>
          ) : items.length === 0 ? (
            <View style={styles.centered}>
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{t.folderEmpty}</Text>
            </View>
          ) : (
            <FlatList
              data={items}
              keyExtractor={item => item.path ?? item.name}
              renderItem={renderItem}
              ListHeaderComponent={
                <Text style={[styles.hintText, { color: colors.textMuted }]}>
                  {t.tapOpen}
                </Text>
              }
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            />
          )}

          {downloadingFile && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: colors.surface }}>
              <ActivityIndicator size="small" color={colors.blue} />
              <Text style={{ fontSize: 13, color: colors.textSecondary }}>{t.downloading(downloadingFile ?? '')}...</Text>
            </View>
          )}

          {uploadingFile && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: colors.surface }}>
              <ActivityIndicator size="small" color={colors.green} />
              <Text style={{ fontSize: 13, color: colors.textSecondary }}>{t.uploading(uploadingFile ?? '')}...</Text>
            </View>
          )}
        </>
      )}

      {/* ── File picker modal ── */}
      <Modal visible={showPicker} transparent={false} animationType="slide" onRequestClose={() => setShowPicker(false)}>
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
          <View style={[styles.header, { backgroundColor: colors.background }]}>
            <View style={styles.headerRow}>
              <TouchableOpacity
                onPress={() => {
                  const isVolumeRoot = volumes.some(v => pickerPath === `file://${v.path}/`) || pickerPath === 'file:///storage/emulated/0/';
                  if (isVolumeRoot) {
                    setShowPicker(false);
                  } else {
                    const parent = pickerPath.endsWith('/') ? pickerPath.slice(0, -1) : pickerPath;
                    const up = parent.substring(0, parent.lastIndexOf('/') + 1);
                    setPickerPath(up);
                    loadPickerDir(up);
                  }
                }}
                style={styles.backBtn}
              >
                <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
              </TouchableOpacity>
              <Text style={[styles.title, { color: colors.textPrimary }]}>{t.uploadFrom}</Text>
              <View style={{ width: 36 }} />
            </View>
            <Text style={[styles.pathSegment, { color: colors.textMuted, paddingLeft: 4, paddingBottom: 4 }]} numberOfLines={1}>
              {pickerPrefix.length > 0 && <Text style={{ color: colors.textMuted }}>{pickerPrefix}</Text>}
              <Text style={styles.pathSegmentActive}>{pickerCurrent}</Text>
            </Text>
            {volumes.length > 1 && (
              <View style={{ flexDirection: 'row', paddingLeft: 4, paddingBottom: 8, gap: 8 }}>
                {volumes.map(vol => (
                  <TouchableOpacity
                    key={vol.path}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: pickerPath.includes(vol.path) ? colors.blue : colors.surface }}
                    onPress={() => {
                      const newPath = `file://${vol.path}/`;
                      setPickerPath(newPath);
                      loadPickerDir(newPath);
                    }}
                  >
                    <Ionicons name={vol.type === 'sdcard' ? 'card-outline' : 'phone-portrait-outline'} size={14} color={pickerPath.includes(vol.path) ? '#fff' : colors.textSecondary} />
                    <Text style={{ fontSize: 12, fontWeight: '500', color: pickerPath.includes(vol.path) ? '#fff' : colors.textSecondary }}>{vol.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
          {pickerLoading ? (
            <View style={styles.centered}><ActivityIndicator color={colors.blue} /></View>
          ) : pickerItems.length === 0 ? (
            <View style={styles.centered}><Text style={[styles.emptyText, { color: colors.textMuted }]}>{t.emptyFolder}</Text></View>
          ) : (
            <FlatList
              data={pickerItems}
              keyExtractor={item => item.uri}
              contentContainerStyle={[styles.listContent, { paddingBottom: 24 }]}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.row, { borderBottomColor: colors.border }]}
                  onPress={() => {
                    if (item.isDirectory) {
                      setPickerPath(item.uri);
                      loadPickerDir(item.uri);
                    } else {
                      Alert.alert(
                        t.uploadFile,
                        t.uploadToNetwork(item.name),
                        [
                          { text: t.cancel, style: 'cancel' },
                          { text: t.upload, onPress: () => handleUpload(item.uri, item.name) },
                        ]
                      );
                    }
                  }}
                  activeOpacity={0.6}
                >
                  <View style={[styles.fileIcon, { backgroundColor: (item.isDirectory ? colors.yellow : getFileColor(item.name)) + '22', overflow: 'hidden' }]}>
                    {item.isDirectory ? (
                      <Ionicons name="folder" size={22} color={colors.yellow} />
                    ) : isImageFile(item.name) ? (
                      <Image source={{ uri: item.uri }} style={styles.thumb} resizeMode="cover" />
                    ) : isVideoFile(item.name) ? (
                      <VideoThumb uri={item.uri} style={styles.thumb} />
                    ) : (
                      <Ionicons name={getFileIcon(item.name) as any} size={20} color={getFileColor(item.name)} />
                    )}
                  </View>
                  <View style={styles.fileInfo}>
                    <Text style={[styles.fileName, { color: colors.textPrimary }]} numberOfLines={1}>{item.name}</Text>
                  </View>
                  {item.isDirectory
                    ? <Ionicons name="chevron-forward" size={16} color={colors.textDisabled} />
                    : <Ionicons name="cloud-upload-outline" size={16} color={colors.blue} />
                  }
                </TouchableOpacity>
              )}
            />
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  backBtn: { width: 36, height: 36, justifyContent: 'center' },
  title: { flex: 1, fontSize: 20, fontWeight: '500', letterSpacing: -0.5, textAlign: 'center' },
  pathRow: { flexDirection: 'row', flexWrap: 'wrap', paddingLeft: 4, paddingBottom: 4 },
  pathSegment: { fontSize: 12 },
  pathSegmentActive: { color: '#7B2FBE', fontWeight: '600' },
  formContainer: { padding: 16 },
  formCard: { borderRadius: 16, padding: 20, gap: 4 },
  formLabel: { fontSize: 12, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 12, marginBottom: 4 },
  input: { borderRadius: 10, padding: 12, fontSize: 14, marginBottom: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  rememberRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, marginBottom: 8 },
  rememberLabel: { fontSize: 14 },
  securityNote: { fontSize: 11, lineHeight: 16, marginBottom: 20 },
  connectBtn: { padding: 14, borderRadius: 12, alignItems: 'center' },
  connectBtnText: { fontSize: 15, fontWeight: '600', color: '#fff' },
  listContent: { paddingHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 0.5 },
  fileIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  fileInfo: { flex: 1 },
  fileName: { fontSize: 14, fontWeight: '500', marginBottom: 2 },
  fileMeta: { fontSize: 11 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 14 },
  hintText: { fontSize: 11, textAlign: 'center', paddingVertical: 8, fontStyle: 'italic' },
  thumb: { width: 40, height: 40, borderRadius: 10 },
});
