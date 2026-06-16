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
import { connect, listDirectory, downloadFile, uploadFile, disconnect, addTransferProgressListener } from 'sftp-client';
import * as FileSystem from 'expo-file-system';
import { scanFile, openFile as openFileNative } from '@/modules/share-module';
import { getStorageVolumes } from '@/modules/storage-stats';

// ─── Types ───────────────────────────────────────────────────────────────────

interface SftpItem {
  name: string;
  isDirectory: boolean;
  size: number;
  modifiedTime: number;
}

interface Credentials {
  host: string;
  port: string;
  username: string;
  password: string;
}

type Stage = 'connect' | 'browse';

const CREDS_KEY = 'sftp_credentials';

// ─── Component ───────────────────────────────────────────────────────────────

export default function SftpScreen() {
  const { colors } = useTheme();
  const router = useRouter();

  // Stage
  const [stage, setStage] = useState<Stage>('connect');

  // Connect form
  const [host, setHost] = useState('');
  const [port, setPort] = useState('22');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [connecting, setConnecting] = useState(false);

  // Active credentials — stored in ref, never in visible state
  const credsRef = useRef<Credentials | null>(null);

  // Browse
  const [items, setItems] = useState<SftpItem[]>([]);
  const [currentPath, setCurrentPath] = useState('/');
  const [breadcrumbs, setBreadcrumbs] = useState<{ name: string; path: string }[]>([]);
  const [loading, setLoading] = useState(false);

  // Download
  const [openingFile, setOpeningFile] = useState<string | null>(null);
  const [downloadingFile, setDownloadingFile] = useState<string | null>(null);
  const [transferProgress, setTransferProgress] = useState<number | null>(null);

  // Upload
  const [showPicker, setShowPicker] = useState(false);
  const [pickerPath, setPickerPath] = useState('file:///storage/emulated/0/');
  const [pickerItems, setPickerItems] = useState<{ name: string; uri: string; isDirectory: boolean }[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [uploadingFile, setUploadingFile] = useState<string | null>(null);
  const [volumes, setVolumes] = useState<{ name: string; path: string; type: string }[]>([]);

  // ─── Load saved credentials on mount ───────────────────────────────────────

  useEffect(() => {
    getStorageVolumes().then((vols: any) => setVolumes(vols));
  }, []);

  useEffect(() => {
    SecureStore.getItemAsync(CREDS_KEY).then(raw => {
      if (!raw) return;
      try {
        const saved: Credentials = JSON.parse(raw);
        setHost(saved.host);
        setPort(saved.port);
        setUsername(saved.username);
        // Password intentionally not pre-filled for security — user must re-enter
        setRemember(true);
      } catch {}
    });
  }, []);

  // ─── Connect ───────────────────────────────────────────────────────────────

  async function handleConnect() {
    if (!host.trim() || !username.trim() || !password.trim()) {
      Alert.alert('Missing fields', 'Host, username and password are required.');
      return;
    }
    setConnecting(true);
    try {
      await connect(host.trim(), parseInt(port.trim() || '22', 10), username.trim(), password);

      // Store credentials in ref — never in React state
      credsRef.current = { host: host.trim(), port: port.trim() || '22', username: username.trim(), password };

      // Save to SecureStore if remember is on
      if (remember) {
        await SecureStore.setItemAsync(CREDS_KEY, JSON.stringify(credsRef.current));
      } else {
        await SecureStore.deleteItemAsync(CREDS_KEY);
      }

      setBreadcrumbs([{ name: '/', path: '/' }]);
      await loadDirectory('/');
      setStage('browse');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
        const msg = (e?.message ?? '').toLowerCase();
        if (msg.includes('auth') || msg.includes('password') || msg.includes('denied') || msg.includes('credential')) {
        Alert.alert('Sign in failed', 'Wrong username or password.');
        } else if (msg.includes('connect') || msg.includes('timeout') || msg.includes('unreachable') || msg.includes('refused')) {
        Alert.alert('Cannot connect', 'Could not reach the server. Make sure both devices are on the same network and the host/port are correct.');
        } else {
        Alert.alert('Connection failed', 'Something went wrong. Check your details and try again.');
        }
      } finally {
      setConnecting(false);
    }
  }

  // ─── Load directory ────────────────────────────────────────────────────────

  async function loadDirectory(path: string) {
    setLoading(true);
    try {
      const result = await listDirectory(path);
      // Sort: folders first, then files, both alphabetically
      const sorted = result.slice().sort((a: SftpItem, b: SftpItem) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });
      setItems(sorted);
      setCurrentPath(path);
    } catch (e: any) {
      Alert.alert('Error', 'Could not open this folder. It may have been moved or you may not have permission.');
    } finally {
      setLoading(false);
    }
  }

  // ─── Navigate into folder ──────────────────────────────────────────────────

  function navigateTo(item: SftpItem) {
    if (!item.isDirectory) return;
    const newPath = currentPath === '/' ? `/${item.name}` : `${currentPath}/${item.name}`;
    setBreadcrumbs(prev => [...prev, { name: item.name, path: newPath }]);
    loadDirectory(newPath);
  }

  function navigateToBreadcrumb(index: number) {
    const crumb = breadcrumbs[index];
    setBreadcrumbs(prev => prev.slice(0, index + 1));
    loadDirectory(crumb.path);
  }

  // ─── Download file ─────────────────────────────────────────────────────────

  async function handleDownload(item: SftpItem) {
    const remotePath = currentPath === '/' ? `/${item.name}` : `${currentPath}/${item.name}`;
    const localPath = `${RNFS.DownloadDirectoryPath}/${item.name}`;

    const exists = await RNFS.exists(localPath);
    if (exists) {
      Alert.alert(
        'File exists',
        `"${item.name}" already exists in Downloads.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Replace', style: 'destructive', onPress: () => startDownload(remotePath, localPath, item.name) },
        ]
      );
      return;
    }
    startDownload(remotePath, localPath, item.name);
  }

  async function startDownload(remotePath: string, localPath: string, fileName: string) {
    setDownloadingFile(fileName);
    setTransferProgress(0);
    const sub = addTransferProgressListener(({ percent }: { percent: number }) => setTransferProgress(percent));
    try {
      await downloadFile(remotePath, localPath);
      await scanFile(localPath).catch(() => {});
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Downloaded', `"${fileName}" saved to Downloads.`);
    } catch (e: any) {
      Alert.alert('Download failed', 'Could not download the file. Check your connection and try again.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
        sub.remove();
        setDownloadingFile(null);
        setTransferProgress(null);
      }
  }

  async function handleOpen(item: SftpItem) {
    const remotePath = currentPath === '/' ? `/${item.name}` : `${currentPath}/${item.name}`;
    const cachePath = `${RNFS.CachesDirectoryPath}/${item.name}`;
    setOpeningFile(item.name);
    try {
      await downloadFile(remotePath, cachePath);
      await openFileNative(cachePath, getMimeType(item.name));
    } catch (e: any) {
      Alert.alert('Could not open', 'No app available to open this file type, or the download failed.');
    } finally {
      setOpeningFile(null);
    }
  }

  // ─── Upload ────────────────────────────────────────────────────────────────

  async function loadPickerDir(path: string) {
    setPickerLoading(true);
    try {
      const dir = new FileSystem.Directory(path);
      const contents = dir.list();
      const folders = contents
        .filter((item: any) => item instanceof FileSystem.Directory)
        .map((item: any) => {
          const raw = item.uri.split('/').filter(Boolean).pop() ?? '';
          try { return { name: decodeURIComponent(raw), uri: item.uri, isDirectory: true }; }
          catch { return { name: raw, uri: item.uri, isDirectory: true }; }
        })
        .filter((f: any) => !f.name.startsWith('.'))
        .sort((a: any, b: any) => a.name.localeCompare(b.name));
      const files = contents
        .filter((item: any) => item instanceof FileSystem.File)
        .map((item: any) => ({ name: item.name, uri: item.uri, isDirectory: false }))
        .filter((f: any) => !f.name.startsWith('.'))
        .sort((a: any, b: any) => a.name.localeCompare(b.name));
      setPickerItems([...folders, ...files]);
    } catch {}
    finally { setPickerLoading(false); }
  }

  async function handleUpload(fileUri: string, fileName: string) {
    setShowPicker(false);
    setUploadingFile(fileName);
    setTransferProgress(0);
    const sub = addTransferProgressListener(({ percent }: { percent: number }) => setTransferProgress(percent));
    try {
      let srcPath = fileUri;
      try { srcPath = decodeURIComponent(fileUri.replace('file://', '')); }
      catch { srcPath = fileUri.replace('file://', ''); }
      const remotePath = currentPath === '/' ? `/${fileName}` : `${currentPath}/${fileName}`;
      await uploadFile(srcPath, remotePath);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Uploaded', `"${fileName}" uploaded successfully.`);
      await loadDirectory(currentPath);
    } catch (e: any) {
      Alert.alert('Upload failed', 'Could not upload the file. Check your connection and try again.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
        sub.remove();
        setUploadingFile(null);
        setTransferProgress(null);
      }
  }
  // ─── Back navigation ───────────────────────────────────────────────────────

  function handleBack() {
    if (stage === 'browse') {
      if (breadcrumbs.length > 1) {
        navigateToBreadcrumb(breadcrumbs.length - 2);
      } else {
        disconnect().catch(() => {});
        setStage('connect');
        setItems([]);
        setBreadcrumbs([]);
        setCurrentPath('/');
        credsRef.current = null;
      }
    } else {
      router.back();
    }
  }

  // ─── Render file row ───────────────────────────────────────────────────────

  function renderItem({ item }: { item: SftpItem }) {
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
            {item.isDirectory ? 'Folder' : formatSize(item.size)}
          </Text>
        </View>
        {item.isDirectory ? (
          <Ionicons name="chevron-forward" size={16} color={colors.textDisabled} />
        ) : openingFile === item.name ? (
          <ActivityIndicator size="small" color={colors.blue} />
        ) : isDownloading ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <ActivityIndicator size="small" color={colors.blue} />
            {transferProgress !== null && (
              <Text style={{ fontSize: 11, color: colors.blue }}>{transferProgress}%</Text>
            )}
          </View>
        ) : (
          <Ionicons name="ellipsis-horizontal" size={18} color={colors.textMuted} />
        )}
      </TouchableOpacity>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  const headerTitle = stage === 'connect' ? 'SFTP' : breadcrumbs[breadcrumbs.length - 1]?.name ?? 'Browse';

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
            <Text style={[styles.formLabel, { color: colors.textSecondary }]}>Host</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary }]}
              value={host}
              onChangeText={setHost}
              placeholder="e.g. 192.168.1.100 or myserver.com"
              placeholderTextColor={colors.textSecondary}
              keyboardType="default"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={{ fontSize: 11, color: colors.textSecondary, marginBottom: 4 }}>IP address or hostname of the SFTP server</Text>
            <Text style={[styles.formLabel, { color: colors.textSecondary }]}>Port</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary }]}
              value={port}
              onChangeText={setPort}
              placeholder="22"
              placeholderTextColor={colors.textSecondary}
              keyboardType="number-pad"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={{ fontSize: 11, color: colors.textSecondary, marginBottom: 4 }}>Default is 22 — only change if your server uses a different port</Text>
            <Text style={[styles.formLabel, { color: colors.textSecondary }]}>Username</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary }]}
              value={username}
              onChangeText={setUsername}
              placeholder="Account username"
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={[styles.formLabel, { color: colors.textSecondary }]}>Password</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary }]}
              value={password}
              onChangeText={setPassword}
              placeholder="Account password"
              placeholderTextColor={colors.textSecondary}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={styles.rememberRow}>
              <Text style={[styles.rememberLabel, { color: colors.textSecondary }]}>Remember credentials</Text>
              <Switch
                value={remember}
                onValueChange={setRemember}
                trackColor={{ false: colors.border, true: colors.blue }}
                thumbColor="#fff"
              />
            </View>
            <Text style={[styles.securityNote, { color: colors.textSecondary }]}>
              Credentials stored securely on device using Android Keystore encryption. Never uploaded anywhere.
            </Text>
            <TouchableOpacity
              style={[styles.connectBtn, { backgroundColor: colors.blue }, connecting && { opacity: 0.7 }]}
              onPress={handleConnect}
              disabled={connecting}
            >
              {connecting
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.connectBtnText}>Connect</Text>
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
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>This folder is empty</Text>
            </View>
          ) : (
            <FlatList
              data={items}
              keyExtractor={item => item.name}
              renderItem={renderItem}
              ListHeaderComponent={
                <Text style={[styles.hintText, { color: colors.textMuted }]}>
                  Tap to open · long-press to save to Downloads
                </Text>
              }
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            />
          )}

          {/* Download progress banner */}
          {downloadingFile && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: colors.surface }}>
              <ActivityIndicator size="small" color={colors.blue} />
              <Text style={{ fontSize: 13, color: colors.textSecondary }}>
                Downloading {downloadingFile}{transferProgress !== null && transferProgress > 0 ? ` ${transferProgress}%` : '...'}
              </Text>
            </View>
          )}

          {/* Upload progress banner */}
          {uploadingFile && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: colors.surface }}>
              <ActivityIndicator size="small" color={colors.green} />
              <Text style={{ fontSize: 13, color: colors.textSecondary }}>
                Uploading {uploadingFile}{transferProgress !== null && transferProgress > 0 ? ` ${transferProgress}%` : '...'}
              </Text>
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
                  const isVolumeRoot = volumes.some((v: any) => pickerPath === `file://${v.path}/`) || pickerPath === 'file:///storage/emulated/0/';
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
              <Text style={[styles.title, { color: colors.textPrimary }]}>Upload from...</Text>
              <View style={{ width: 36 }} />
            </View>
            <Text style={[styles.pathSegment, { color: colors.textMuted, paddingLeft: 4, paddingBottom: 4 }]} numberOfLines={1}>
              {(() => {
                let display = pickerPath.replace('file:///storage/emulated/0/', 'Storage/');
                const sdVol = volumes.find((v: any) => v.type === 'sdcard' && pickerPath.includes(v.path));
                if (sdVol) display = display.replace(`file://${sdVol.path}/`, `${sdVol.name}/`).replace(`file://${sdVol.path}`, sdVol.name);
                const segs = display.split('/').filter(Boolean).map((seg: string) => { try { return decodeURIComponent(seg); } catch { return seg; } });
                const current = segs.pop();
                return (
                  <>
                    {segs.length > 0 && <Text style={{ color: colors.textMuted }}>{segs.join('/')}/</Text>}
                    <Text style={styles.pathSegmentActive}>{current}</Text>
                  </>
                );
              })()}
            </Text>
            {volumes.length > 1 && (
              <View style={{ flexDirection: 'row', paddingLeft: 4, paddingBottom: 8, gap: 8 }}>
                {volumes.map((vol: any) => (
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
            <View style={styles.centered}><Text style={[styles.emptyText, { color: colors.textMuted }]}>Empty folder</Text></View>
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
                        'Upload file',
                        `Upload "${item.name}" to the current folder?`,
                        [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Upload', onPress: () => handleUpload(item.uri, item.name) },
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
  pathSegmentActive: { color: '#2E7D32', fontWeight: '600' },
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
  sectionLabel: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginTop: 4 },
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
