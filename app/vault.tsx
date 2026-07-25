import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity, FlatList,
  ActivityIndicator, Alert, Image, Modal, Animated,
  Pressable, useWindowDimensions, ScrollView, StatusBar,
} from 'react-native';
import { MediaViewerView } from 'media-viewer';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { useVault, VaultFile } from '@/hooks/useVault';
import RNFS from 'react-native-fs';
import { isImageFile, getMimeType, getFileColor, formatSize, getFileIcon, toPath, formatDate } from '@/utils/files';
import * as LocalAuthentication from 'expo-local-authentication';
import { verifyPin, isPinSet } from '@/hooks/usePin';
import { useTheme } from '@/hooks/useTheme';
import { openFile as openFileNative, scanFile, shareFiles } from '@/modules/share-module';
import { isVideoFile, VideoThumb } from '@/utils/videoThumb';
import { DocIndexer } from '@/modules/doc-indexer';
import { usePro } from '@/hooks/usePro';
import { copyFileStream } from 'file-reader';
import { getStorageVolumes } from '@/modules/storage-stats';
import * as Haptics from 'expo-haptics';
import { useBottomSheet } from '@/hooks/useBottomSheet';
import { getMediaInfo } from 'media-store';
import FileDetailsModal from '@/components/FileDetailsModal';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import VideoPlayerModal from '@/components/VideoPlayerModal';
import { usePinPad } from '@/hooks/usePinPad';
import PinTrail from '@/components/PinTrail';
import * as ScreenOrientation from 'expo-screen-orientation';

export default function VaultScreen() {
  const { colors } = useTheme();
  const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = useWindowDimensions();
  const router = useRouter();
  const { files, loading, authenticated, unlockVault, deleteFromVault, loadFiles, lock } = useVault();
  const [busy, setBusy] = useState(false);
  const [showPinEntry, setShowPinEntry] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinAvailable, setPinAvailable] = useState(false);
  const [selectedFile, setSelectedFile] = useState<VaultFile | null>(null);
  const [showSheet, setShowSheet] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerPath, setPickerPath] = useState('file:///storage/emulated/0/');
  const [pickerItems, setPickerItems] = useState<{ name: string; uri: string; isDirectory: boolean }[]>([]);
  const [pickerFiles, setPickerFiles] = useState<{ name: string; uri: string; isDirectory: boolean }[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const pendingFile = useRef<VaultFile | null>(null);
  const insets = useSafeAreaInsets();
  const [openingFile, setOpeningFile] = useState(false);
  const [movingFile, setMovingFile] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedUris, setSelectedUris] = useState<Set<string>>(new Set());
  const [selectedFilesMap, setSelectedFilesMap] = useState<Map<string, VaultFile>>(new Map());
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [detailsData, setDetailsData] = useState<{ label: string; value: string }[]>([]);
  const [detailsName, setDetailsName] = useState('');
  const { isPro } = usePro();
  const { sheetAnim, panResponder, animateOpen, closeSheet } = useBottomSheet(() => {
    setShowSheet(false);
    setSelectedFile(null);
  });
  const [padSize, setPadSize] = useState({ w: 0, h: 0 });
  const ROOT_PATH = 'file:///storage/emulated/0/';
  const [volumes, setVolumes] = useState<{ name: string; path: string; type: string }[]>([]);
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  const [playerUri, setPlayerUri] = useState<string | null>(null);

  const { keyProps, gesture, GestureDetector, pathD, pathPoints, isSwiping, outcome } = usePinPad({
    value: pinInput,
    setValue: setPinInput,
    onComplete: handleVaultPinVerify,
    onEdit: () => setPinError(null),
  });

  useEffect(() => {
    if (!authenticated) {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
      return () => { ScreenOrientation.unlockAsync(); };
    }
  }, [authenticated]);

  useEffect(() => { getStorageVolumes().then(setVolumes); }, []);

  useEffect(() => {
    async function init() {
      const pinSet = await isPinSet();
      setPinAvailable(pinSet);
      if (!authenticated) {
        tryVaultBiometric(pinSet);
      }
    }
    init();
  }, []);

  async function loadPickerDir(path: string) {
    setPickerLoading(true);
    try {
      const rawPath = path.replace('file://', '').replace(/\/$/, '');
      const contents = await RNFS.readDir(rawPath);
      const folderItems = contents
        .filter((item: any) => item.isDirectory())
        .map((item: any) => ({
          name: (() => { try { return decodeURIComponent(item.name); } catch { return item.name; } })(),
          uri: `file://${item.path}/`,
          isDirectory: true,
        }))
        .filter((f: any) => !f.name.startsWith('.'))
        .sort((a: any, b: any) => a.name.localeCompare(b.name));
      const fileItems = contents
        .filter((item: any) => !item.isDirectory())
        .map((item: any) => ({
          name: (() => { try { return decodeURIComponent(item.name); } catch { return item.name; } })(),
          uri: `file://${item.path}`,
          isDirectory: false,
        }))
        .filter((f: any) => !f.name.startsWith('.'))
        .sort((a: any, b: any) => a.name.localeCompare(b.name));
      setPickerItems(folderItems);
      setPickerFiles(fileItems);
    } catch { setPickerItems([]); setPickerFiles([]); }
    finally { setPickerLoading(false); }
  }

  function openMovePicker(file: VaultFile) {
    pendingFile.current = file;
    setPickerPath(ROOT_PATH);
    loadPickerDir(ROOT_PATH);
    setShowPicker(true);
    closeSheet();
  }

  async function handleMoveOut() {
    const file = pendingFile.current;
    if (!file) { await handleMultiMoveOut(); return; }
    const destDir = pickerPath.endsWith('/') ? pickerPath : pickerPath + '/';
    const destUri = destDir + file.name;
    setShowPicker(false);
    setMovingFile(true);
    try {
      const dst = toPath(destUri);
      const exists = await RNFS.exists(dst);
      if (exists) {
        setMovingFile(false);
        Alert.alert('File already exists', `"${file.name}" already exists in this folder.`);
        return;
      }
      await RNFS.copyFile(toPath(file.uri), dst);
      await scanFile(dst).catch(() => {});
      await deleteFromVault(file);
      Alert.alert('Moved', `"${file.name}" moved out of Vault successfully.`);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      Alert.alert('Error', 'Could not move file out of Vault.');
    } finally {
      setMovingFile(false);
    }
  }

  async function handleMultiMoveOut() {
    const filesToMove = Array.from(selectedFilesMap.values());
    const destDir = pickerPath.endsWith('/') ? pickerPath : pickerPath + '/';
    setShowPicker(false);
    setMovingFile(true);
    let failed = 0;
    for (const file of filesToMove) {
      try {
        const dst = toPath(destDir + file.name);
        const exists = await RNFS.exists(dst);
        if (exists) { failed++; continue; }
        await RNFS.copyFile(toPath(file.uri), dst);
        await scanFile(dst).catch(() => {});
        const f = new FileSystem.File(file.uri);
        f.delete();
      } catch { failed++; }
    }
    await loadFiles();
    setMovingFile(false);
    setSelectMode(false);
    setSelectedUris(new Set());
    setSelectedFilesMap(new Map());
    const succeeded = filesToMove.length - failed;
    if (failed > 0 && succeeded === 0) {
      Alert.alert('File already exists', filesToMove.length === 1
        ? `"${filesToMove[0].name}" already exists in this location.`
        : `${failed} file${failed !== 1 ? 's' : ''} already exist at this location and could not be moved.`);
    } else if (failed > 0) {
      Alert.alert('Partial success', `${succeeded} file${succeeded !== 1 ? 's' : ''} moved. ${failed} could not be moved — ${failed === 1 ? 'it' : 'they'} already exist${failed === 1 ? 's' : ''} at this location.`);
    } else {
      Alert.alert('Moved', `${filesToMove.length} file${filesToMove.length !== 1 ? 's' : ''} moved out of Vault.`);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }
  
  async function handleMultiDelete() {
    const files = Array.from(selectedFilesMap.values());
    Alert.alert('Delete permanently', `Delete ${files.length} file${files.length !== 1 ? 's' : ''} from Vault? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        setBusy(true);
        for (const file of files) {
          try {
            const f = new FileSystem.File(file.uri);
            f.delete();
            DocIndexer.removeFromIndex(file.uri);
          } catch {}
        }
        await loadFiles();
        setBusy(false);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setSelectMode(false);
        setSelectedUris(new Set());
        setSelectedFilesMap(new Map());
      }},
    ]);
  }

  function openSheet(file: VaultFile) {
    setSelectedFile(file);
    setShowSheet(true);
    animateOpen();
  }

  async function openFile(file: VaultFile) {
    if (openingFile) return;
    setOpeningFile(true);
    const mime = getMimeType(file.name);
    try {
      await openFileNative(toPath(file.uri), mime);
    } catch (e) {}
    finally { setOpeningFile(false); }
  }

  async function handleShare(file: VaultFile) {
    closeSheet();
    try {
      await shareFiles([toPath(file.uri)], getMimeType(file.name));
    } catch (e) {}
  }

  async function handleDelete(file: VaultFile) {
    closeSheet();
    Alert.alert(
      'Delete permanently',
      `Delete "${file.name}" forever? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            await deleteFromVault(file);
            DocIndexer.removeFromIndex(file.uri);
            setBusy(false);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          },
        },
      ]
    );
  }

  async function tryVaultBiometric(pinSet?: boolean) {
    const hasPinAvailable = pinSet ?? pinAvailable;
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      if (!hasHardware || !isEnrolled) {
        if (hasPinAvailable) setShowPinEntry(true);
        return;
      }
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock Vault',
        cancelLabel: 'Use PIN',
        disableDeviceFallback: true,
      });
      if (result.success) {
        await unlockVault();
      } else {
        if (hasPinAvailable) setShowPinEntry(true);
      }
    } catch {
      if (hasPinAvailable) setShowPinEntry(true);
    }
  }

  async function handleVaultPinVerify(entered: string) {
    const correct = await verifyPin(entered);
    if (correct) {
      await unlockVault();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return true;
    } else {
      setPinError('Incorrect PIN. Try again.');
      setPinInput('');
      return false;
    }
  }

  async function handleForgotPin() {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      if (hasHardware && isEnrolled) {
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Verify identity to reset PIN',
          cancelLabel: 'Cancel',
          disableDeviceFallback: true,
        });
        if (result.success) {
          router.push({ pathname: '/setpin', params: { fromForgotPin: '1' } } as any);
        }
      } else {
        Alert.alert(
          'No biometrics available',
          'For security, go to Settings → Apps → AskFiles → Clear Data to reset. Your vault files will be preserved if you reinstall from Play Store.',
          [{ text: 'OK' }]
        );
      }
    } catch {}
  }

  function renderFile({ item }: { item: VaultFile }) {
    const color = getFileColor(item.name);
    return (
      <TouchableOpacity
        style={[styles.row, { borderBottomColor: colors.border, backgroundColor: selectedUris.has(item.uri) ? colors.blueTint : 'transparent' }]}
        onPress={() => {
          if (movingFile || busy) return;
          if (selectMode) {
            const newSet = new Set(selectedUris);
            const newMap = new Map(selectedFilesMap);
            if (newSet.has(item.uri)) { newSet.delete(item.uri); newMap.delete(item.uri); }
            else { newSet.add(item.uri); newMap.set(item.uri, item); }
            setSelectedUris(newSet); setSelectedFilesMap(newMap);
          } else {
            if (isImageFile(item.name)) {
              setViewerUri(item.uri);
            } else if (isVideoFile(item.name)) {
              setPlayerUri(item.uri);
            } else {
              openFile(item);
            }
          }
        }}
        onLongPress={() => { if (!selectMode) { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setSelectMode(true); const newSet = new Set([item.uri]); const newMap = new Map([[item.uri, item]]); setSelectedUris(newSet); setSelectedFilesMap(newMap); } }}
        activeOpacity={0.7}
        disabled={(openingFile && !selectMode) || movingFile || busy}
      >
        {selectMode && (
          <View style={{ marginRight: 12 }}>
            <Ionicons name={selectedUris.has(item.uri) ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={selectedUris.has(item.uri) ? colors.blue : colors.textMuted} />
          </View>
        )}
        <View style={[styles.icon, { backgroundColor: color + '22', overflow: 'hidden' }]}>
          {isImageFile(item.name) ? (
            <Image source={{ uri: item.uri }} style={styles.thumb} resizeMode="cover" />
          ) : isVideoFile(item.name) ? (
            <VideoThumb uri={item.uri} style={styles.thumb} />
          ) : (
            <Ionicons name={getFileIcon(item.name) as any} size={20} color={color} />
          )}
        </View>
        <View style={styles.info}>
          <Text style={[styles.fileName, { color: colors.textPrimary }]} numberOfLines={1}>{item.name}</Text>
          <Text style={[styles.fileMeta, { color: colors.textMuted }]}>{formatSize(item.size)}</Text>
        </View>
        {!selectMode && (
          <TouchableOpacity style={styles.menuBtn} onPress={() => openSheet(item)}>
            <Ionicons name="ellipsis-vertical" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  }

  // Locked state
  if (!authenticated) {
    return (
      <SafeAreaView edges={['left', 'right', 'bottom']} style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Secure Vault</Text>
        <View style={{ width: 40 }} />
      </View>
        {!showPinEntry ? (
          <ScrollView contentContainerStyle={styles.lockScreen} showsVerticalScrollIndicator={false}>
            <View style={[styles.lockIcon, { backgroundColor: colors.blueTint }]}>
              <Ionicons name="lock-closed" size={40} color={colors.blue} />
            </View>
            <Text style={[styles.lockTitle, { color: colors.textPrimary }]}>Secure Vault</Text>
            <Text style={[styles.lockSub, { color: colors.textMuted }]}>Your files are protected. Authenticate to access your vault.</Text>
            <TouchableOpacity style={styles.authBtn} onPress={() => tryVaultBiometric()} activeOpacity={0.85}>
              <Ionicons name="finger-print-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.authBtnText}>Unlock with Biometrics</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => pinAvailable ? setShowPinEntry(true) : router.push('/setpin' as any)}
              style={{ marginTop: 16, paddingVertical: 8 }}
            >
              <Text style={{ fontSize: 14, color: colors.textMuted }}>
                {pinAvailable ? 'Use PIN instead' : 'Set up a PIN'}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        ) : (
          <>
            <View style={styles.pinScreen}>
              <View style={[styles.lockIcon, { backgroundColor: colors.blueTint }]}>
                <Ionicons name="keypad-outline" size={40} color={colors.blue} />
              </View>
              <Text style={[styles.lockTitle, { color: colors.textPrimary }]}>Enter PIN</Text>
              <View style={{ flexDirection: 'row', gap: 16, marginTop: 24, marginBottom: 12 }}>
                {[0, 1, 2, 3].map(i => (
                  <View key={i} style={[styles.dot, i < pinInput.length && styles.dotFilled, !!pinError && styles.dotError]} />
                ))}
              </View>
              <View style={styles.errorSlot}>
                {pinError && <Text style={styles.errorText}>{pinError}</Text>}
              </View>
              <GestureDetector gesture={gesture}>
                <View
                  style={{ flexDirection: 'row', flexWrap: 'wrap', width: 280, gap: 16, position: 'relative' }}
                  onLayout={(e) => setPadSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
                >
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'bio', '0', 'del'].map((key, i) => {
                    if (key === 'bio') return (
                      <TouchableOpacity key={i} style={[styles.pinKey, { backgroundColor: colors.surface }]} onPress={() => tryVaultBiometric()} activeOpacity={0.6}>
                        <Ionicons name="finger-print-outline" size={24} color={colors.blue} />
                      </TouchableOpacity>
                    );
                    if (key === 'del') return (
                      <TouchableOpacity key={i} style={[styles.pinKey, { backgroundColor: colors.surface }]} onPress={keyProps.onDelete} activeOpacity={0.6}>
                        <Ionicons name="backspace-outline" size={22} color={colors.textSecondary} />
                      </TouchableOpacity>
                    );
                    return (
                      <TouchableOpacity key={i} style={[styles.pinKey, { backgroundColor: colors.surface }]} onPress={() => keyProps.onTap(key)} onLayout={(e) => keyProps.onMeasure(key, e)} activeOpacity={0.6}>
                        <Text style={[styles.pinKeyText, { color: colors.textPrimary }]}>{key}</Text>
                      </TouchableOpacity>
                    );
                  })}
                  {(isSwiping || outcome === 'fail') && padSize.w > 0 && (
                    <PinTrail
                      pathD={pathD}
                      points={pathPoints}
                      color={outcome === 'success' ? '#22C55E' : outcome === 'fail' ? '#E24B4A' : colors.blue}
                      width={padSize.w}
                      height={padSize.h}
                    />
                  )}
                </View>
              </GestureDetector>
               {/* pinned, always visible */}
            <TouchableOpacity onPress={handleForgotPin} style={styles.forgotPin}>
              <Text style={{ fontSize: 13, color: colors.textMuted, textAlign: 'center' }}>Forgot PIN?</Text>
            </TouchableOpacity>
            </View>
          </>
        )}
        </SafeAreaView>
      );
    }
  
    if (!isPro) {
      return (
        <SafeAreaView edges={['bottom', 'left', 'right']} style={[styles.container, { backgroundColor: colors.background }]}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Secure Vault</Text>
            <View style={{ width: 40 }} />
          </View>
          <ScrollView contentContainerStyle={styles.lockScreen} showsVerticalScrollIndicator={false}>
            <View style={[styles.lockIcon, { backgroundColor: colors.blueTint }]}>
              <Ionicons name="shield-checkmark-outline" size={40} color={colors.blue} />
            </View>
            <Text style={[styles.lockTitle, { color: colors.textPrimary }]}>Pro Feature</Text>
            <Text style={[styles.lockSub, { color: colors.textMuted }]}>
              Secure Vault is part of AskFiles Pro. Upgrade once, use forever.
            </Text>
            <TouchableOpacity style={styles.authBtn} onPress={() => router.push('/(tabs)/cloud' as any)} activeOpacity={0.85}>
              <Ionicons name="sparkles-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.authBtnText}>Upgrade to Pro</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      );
    }
    return (
      <SafeAreaView edges={['left', 'right', 'bottom']} style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
        <TouchableOpacity onPress={() => {
          if (selectMode) { setSelectMode(false); setSelectedUris(new Set()); setSelectedFilesMap(new Map()); }
          else { router.back(); }
        }} style={styles.backBtn} disabled={movingFile || busy}>
          <Ionicons name={selectMode ? 'close' : 'arrow-back'} size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          {selectMode ? `${selectedUris.size} selected` : 'Vault'}
        </Text>
        {!selectMode ? (
          <View style={{ flexDirection: 'row' }}>
            <TouchableOpacity onPress={() => { setSelectMode(true); setSelectedUris(new Set()); setSelectedFilesMap(new Map()); }} style={styles.backBtn}>
              <Ionicons name="checkmark-circle-outline" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); lock(); setPinInput(''); setPinError(null); setShowPinEntry(false); }} style={styles.backBtn}>
              <Ionicons name="lock-closed-outline" size={22} color={colors.blue} />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            onPress={() => {
              const allFiles = files;
              const newSet = new Set(allFiles.map(f => f.uri));
              const newMap = new Map(allFiles.map(f => [f.uri, f]));
              setSelectedUris(newSet);
              setSelectedFilesMap(newMap);
            }}
            style={{ width: 40, height: 40, justifyContent: 'center', alignItems: 'center' }}
            disabled={movingFile || busy}
          >
            <Text style={{ fontSize: 12, color: (movingFile || busy) ? colors.textDisabled : colors.blue, fontWeight: '500' }}>All</Text>
          </TouchableOpacity>
        )} 
        </View>

      {openingFile && (
          <View style={[styles.busyBanner, { backgroundColor: colors.surface }]}>
            <ActivityIndicator size="small" color={colors.blue} />
            <Text style={[styles.busyText, { color: colors.textSecondary }]}>Opening file...</Text>
          </View>
        )}
        {movingFile && (
          <View style={[styles.busyBanner, { backgroundColor: colors.surface }]}>
            <ActivityIndicator size="small" color={colors.blue} />
            <Text style={[styles.busyText, { color: colors.textSecondary }]}>
              {selectedUris.size > 1 ? 'Moving files...' : 'Moving file...'}
            </Text>
          </View>
        )}
        {selectMode && selectedUris.size > 0 && (
        <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
          <TouchableOpacity
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: movingFile || busy ? colors.surface : colors.blue, borderRadius: 10, paddingVertical: 10 }}
            onPress={() => { pendingFile.current = null; setPickerPath(ROOT_PATH); loadPickerDir(ROOT_PATH); setShowPicker(true); }}
            disabled={movingFile || busy}
          >
            <Ionicons name="arrow-redo-outline" size={16} color="#fff" />
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#fff' }}>Move out</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.surface, borderRadius: 10, paddingVertical: 10, opacity: movingFile || busy ? 0.5 : 1 }}
            onPress={handleMultiDelete}
            disabled={movingFile || busy}
          >
            <Ionicons name="trash-outline" size={16} color={colors.deleteRed} />
            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.deleteRed }}>Delete</Text>
          </TouchableOpacity>
        </View>
      )}
      {busy && (
        <View style={[styles.busyBanner, { backgroundColor: colors.busyBg }]}>
          <ActivityIndicator size="small" color={colors.blue} />
          <Text style={[styles.busyText, { color: colors.blue }]}>Working...</Text>
        </View>
      )}

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.blue} />
        </View>
      ) : files.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="shield-checkmark-outline" size={48} color={colors.textDisabled} />
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>Vault is empty</Text>
          <Text style={[styles.emptySub, { color: colors.textMuted }]}>Long press any file — or tap ⋮ — and select "Move to Vault"</Text>
        </View>
      ) : (
        <FlatList
          data={files}
          keyExtractor={item => item.uri}
          renderItem={renderFile}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <Text style={[styles.count, { color: colors.textMuted }]}>{files.length} file{files.length !== 1 ? 's' : ''} secured</Text>
          }
        />
      )}

      <Modal visible={showSheet} transparent animationType="none" onRequestClose={closeSheet}>
        <Pressable style={styles.overlay} onPress={closeSheet}>
        <Animated.View
            style={SCREEN_WIDTH > SCREEN_HEIGHT
              ? [styles.sheetLandscape, { backgroundColor: colors.card }]
              : [styles.sheet, { backgroundColor: colors.card, transform: [{ translateY: sheetAnim }], paddingBottom: insets.bottom + 16, paddingLeft: insets.left + 16, paddingRight: insets.right + 16 }]
            }
            {...(SCREEN_WIDTH > SCREEN_HEIGHT ? {} : panResponder.panHandlers)}
          >
            {SCREEN_WIDTH > SCREEN_HEIGHT
              ? <TouchableOpacity onPress={closeSheet} style={{ alignSelf: 'flex-end', padding: 4 }}><Ionicons name="close" size={20} color={colors.textMuted} /></TouchableOpacity>
              : <View style={[styles.sheetHandle, { backgroundColor: colors.textDisabled }]} />
            }
            <ScrollView showsVerticalScrollIndicator={true} contentContainerStyle={{ paddingBottom: 8 }}>
            <Pressable>
              <View style={styles.sheetHeader}>
              <View style={[styles.sheetIcon, { backgroundColor: selectedFile ? getFileColor(selectedFile.name) + '22' : colors.surface, overflow: 'hidden' }]}>
                {selectedFile && isImageFile(selectedFile.name) ? (
                  <Image source={{ uri: selectedFile.uri }} style={styles.sheetThumb} resizeMode="cover" />
                ) : selectedFile && isVideoFile(selectedFile.name) ? (
                  <VideoThumb uri={selectedFile.uri} style={styles.sheetThumb} />
                ) : (
                  <Ionicons name={getFileIcon(selectedFile?.name ?? '') as any} size={22} color={selectedFile ? getFileColor(selectedFile.name) : colors.textMuted} />
                )}
              </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.sheetFileName, { color: colors.textPrimary }]} numberOfLines={2}>{selectedFile?.name}</Text>
                  <Text style={[styles.sheetFileMeta, { color: colors.textMuted }]}>{selectedFile ? formatSize(selectedFile.size) : ''}</Text>
                </View>
              </View>

              <View style={[styles.sheetDivider, { backgroundColor: colors.border }]} />

              <TouchableOpacity style={styles.sheetAction} onPress={() => { closeSheet(); selectedFile && openFile(selectedFile); }}>
                <Ionicons name="open-outline" size={20} color={colors.textPrimary} />
                <Text style={[styles.sheetActionText, { color: colors.textPrimary }]}>Open</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.sheetAction} onPress={() => selectedFile && handleShare(selectedFile)}>
                <Ionicons name="share-outline" size={20} color={colors.textPrimary} />
                <Text style={[styles.sheetActionText, { color: colors.textPrimary }]}>Share</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.sheetAction} onPress={async () => {
                if (!selectedFile) return;
                closeSheet();
                const lines: { label: string; value: string }[] = [];
                try {
                  const stat = await RNFS.stat(toPath(selectedFile.uri));
                  if (stat.size) lines.push({ label: 'Size', value: formatSize(stat.size) });
                  if (stat.mtime) lines.push({ label: 'Modified', value: formatDate(new Date(stat.mtime).getTime()) });
                  if (stat.ctime) lines.push({ label: 'Created', value: formatDate(new Date(stat.ctime).getTime()) });
                } catch {}
                lines.push({ label: 'Type', value: (selectedFile.name.split('.').pop()?.toUpperCase() ?? '?') + ' file' });
                if (isImageFile(selectedFile.name) || isVideoFile(selectedFile.name)) {
                  try {
                    const info = await getMediaInfo(toPath(selectedFile.uri));
                    if (info.width && info.height) lines.push({ label: 'Resolution', value: `${info.width}×${info.height}` });
                    if (info.duration) lines.push({ label: 'Duration', value: info.duration });
                  } catch {}
                }
                setDetailsName(selectedFile.name);
                setDetailsData(lines);
                setShowDetailsModal(true);
              }}>
                <Ionicons name="information-circle-outline" size={20} color={colors.textPrimary} />
                <Text style={[styles.sheetActionText, { color: colors.textPrimary }]}>Info</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.sheetAction} onPress={() => selectedFile && openMovePicker(selectedFile)}>
                <Ionicons name="arrow-redo-outline" size={20} color={colors.textPrimary} />
                <Text style={[styles.sheetActionText, { color: colors.textPrimary }]}>Move out of Vault</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.sheetAction} onPress={() => selectedFile && handleDelete(selectedFile)}>
                <Ionicons name="trash-outline" size={20} color="#E24B4A" />
                <Text style={[styles.sheetActionText, { color: '#E24B4A' }]}>Delete permanently</Text>
              </TouchableOpacity>

              <View style={[styles.sheetDivider, { backgroundColor: colors.border }]} />

              <TouchableOpacity style={styles.sheetAction} onPress={closeSheet}>
                <Ionicons name="close-outline" size={20} color={colors.textMuted} />
                <Text style={[styles.sheetActionText, { color: colors.textMuted }]}>Cancel</Text>
              </TouchableOpacity>
              </Pressable>
            </ScrollView>
          </Animated.View>
        </Pressable>
      </Modal>

      <Modal visible={showPicker} transparent={false} animationType="slide" onRequestClose={() => setShowPicker(false)}>
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => {
                if (pickerPath === ROOT_PATH) { setShowPicker(false); }
                else {
                  const parent = pickerPath.endsWith('/') ? pickerPath.slice(0, -1) : pickerPath;
                  const up = parent.substring(0, parent.lastIndexOf('/') + 1);
                  setPickerPath(up); loadPickerDir(up);
                }
              }}
              style={styles.backBtn}
            >
              <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>Move to...</Text>
            <View style={{ width: 40 }} />
          </View>
          <Text style={{ fontSize: 12, color: colors.textMuted, paddingHorizontal: 16, paddingBottom: 8 }}>
            {(() => { try { return decodeURIComponent(pickerPath.replace('file:///storage/emulated/0/', 'Storage/')); } catch { return pickerPath.replace('file:///storage/emulated/0/', 'Storage/'); } })()}
          </Text>
          {volumes.length > 1 && (
            <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 8, gap: 8 }}>
              {volumes.map(vol => (
                <TouchableOpacity
                  key={vol.path}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: pickerPath.includes(vol.path) ? colors.blue : colors.surface }}
                  onPress={() => { const newPath = `file://${vol.path}/`; setPickerPath(newPath); loadPickerDir(newPath); }}
                >
                  <Ionicons name={vol.type === 'sdcard' ? 'card-outline' : 'phone-portrait-outline'} size={14} color={pickerPath.includes(vol.path) ? '#fff' : colors.textSecondary} />
                  <Text style={{ fontSize: 12, fontWeight: '500', color: pickerPath.includes(vol.path) ? '#fff' : colors.textSecondary }}>{vol.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {pickerLoading ? (
            <View style={styles.centered}><ActivityIndicator color={colors.blue} /></View>
          ) : pickerItems.length === 0 && pickerFiles.length === 0 ? (
            <View style={styles.centered}><Text style={[styles.emptyTitle, { color: colors.textMuted }]}>This folder is empty</Text></View>
          ) : (
            <FlatList
              data={[...pickerItems, ...pickerFiles]}
              keyExtractor={item => item.uri}
              contentContainerStyle={[styles.list, { paddingBottom: 100 }]}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.row, { borderBottomColor: colors.border }]}
                  onPress={() => { if (item.isDirectory) { setPickerPath(item.uri); loadPickerDir(item.uri); } }}
                  activeOpacity={item.isDirectory ? 0.6 : 1}
                >
                  <View style={[styles.icon, { backgroundColor: (item.isDirectory ? colors.yellow : getFileColor(item.name)) + '22', overflow: 'hidden' }]}>
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
                  <View style={styles.info}>
                    <Text style={[styles.fileName, { color: colors.textPrimary }]} numberOfLines={1}>{item.name}</Text>
                  </View>
                  {item.isDirectory && <Ionicons name="chevron-forward" size={16} color={colors.textDisabled} />}
                </TouchableOpacity>
              )}
            />
          )}
          <View style={[styles.pickerFooter, { borderTopColor: colors.border }]}>
            <TouchableOpacity style={[styles.pickerCancelBtn, { backgroundColor: colors.surface }]} onPress={() => setShowPicker(false)}>
              <Text style={[styles.pickerCancelText, { color: colors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.pickerPasteBtn} onPress={handleMoveOut}>
              <Ionicons name="checkmark" size={18} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.pickerPasteText}>Move here</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
      <FileDetailsModal visible={showDetailsModal} name={detailsName} data={detailsData} onClose={() => setShowDetailsModal(false)} />
      <Modal visible={viewerUri !== null} transparent={false} animationType="fade" onRequestClose={() => setViewerUri(null)} statusBarTranslucent>
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <StatusBar barStyle="light-content" backgroundColor="#000" />
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
                  try {
                    const name = viewerUri.split('/').pop() ?? '';
                    const cachePath = `${RNFS.CachesDirectoryPath}/${name}`;
                    await RNFS.copyFile(toPath(viewerUri), cachePath);
                    const contentUri = await FileSystemLegacy.getContentUriAsync('file://' + cachePath);
                    await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
                      data: contentUri,
                      flags: 1,
                      type: getMimeType(name),
                    });
                  } catch {}
                }} style={{ paddingHorizontal: 20, paddingVertical: 12 }}>
                  <Ionicons name="open-outline" size={22} color="#222" />
                </TouchableOpacity>
              </View>
            </View>
          </SafeAreaView>
        </View>
      </Modal>
      <VideoPlayerModal uri={playerUri} onClose={() => setPlayerUri(null)} hideShare />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  title: { flex: 1, fontSize: 20, fontWeight: '500', textAlign: 'center', letterSpacing: -0.5 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 32 },
  forgotPin: { paddingVertical: 10, alignItems: 'center' },
  pinScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 12 },
  lockScreen: { alignItems: 'center', paddingHorizontal: 32, gap: 12, paddingTop: 24, paddingBottom: 44 },
  lockIcon: { width: 88, height: 88, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  lockTitle: { fontSize: 22, fontWeight: '600', letterSpacing: -0.5 },
  lockSub: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  errorText: { fontSize: 13, color: '#E24B4A', textAlign: 'center' },
  errorSlot: { height: 20, justifyContent: 'center', marginBottom: 8 },
  authBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#185FA5', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 28, marginTop: 8 },
  authBtnText: { fontSize: 15, fontWeight: '600', color: '#fff' },
  busyBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
  busyText: { fontSize: 13 },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  count: { fontSize: 11, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 0.5 },
  icon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  thumb: { width: 40, height: 40 },
  ext: { fontSize: 9, fontWeight: '500' },
  info: { flex: 1 },
  fileName: { fontSize: 14, fontWeight: '500', marginBottom: 2 },
  fileMeta: { fontSize: 11 },
  menuBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: '500' },
  emptySub: { fontSize: 13, textAlign: 'center', lineHeight: 18 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 16 },
  sheetLandscape: { borderRadius: 20, paddingHorizontal: 24, paddingVertical: 16, width: '60%', maxHeight: '90%', alignSelf: 'center', marginTop: 'auto', marginBottom: 'auto' },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 16 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 12 },
  sheetIcon: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  sheetThumb: { width: 44, height: 44 },
  sheetExt: { fontSize: 9, fontWeight: '500' },
  sheetFileName: { fontSize: 14, fontWeight: '500', marginBottom: 2 },
  sheetFileMeta: { fontSize: 12 },
  sheetDivider: { height: 0.5, marginVertical: 8 },
  sheetAction: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 },
  sheetActionText: { fontSize: 15 },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: '#D3D1C7', backgroundColor: 'transparent' },
  dotFilled: { backgroundColor: '#185FA5', borderColor: '#185FA5' },
  dotError: { borderColor: '#E24B4A' },
  pinKey: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
  pinKeyText: { fontSize: 24, fontWeight: '500' },
  pickerFooter: { flexDirection: 'row', gap: 8, padding: 16, borderTopWidth: 0.5 },
  pickerCancelBtn: { flex: 1, padding: 14, borderRadius: 12, alignItems: 'center' },
  pickerCancelText: { fontSize: 14, fontWeight: '500' },
  pickerPasteBtn: { flex: 2, flexDirection: 'row', padding: 14, borderRadius: 12, backgroundColor: '#185FA5', alignItems: 'center', justifyContent: 'center' },
  pickerPasteText: { fontSize: 14, color: '#fff', fontWeight: '600' },
});
