import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity, FlatList,
  ActivityIndicator, Alert, Image, Modal, Animated,
  Pressable, PanResponder, useWindowDimensions, ScrollView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { useVault, VaultFile } from '@/hooks/useVault';
import RNFS from 'react-native-fs';
import { isImageFile, getMimeType, getFileColor, formatSize } from '@/utils/files';
import * as LocalAuthentication from 'expo-local-authentication';
import { verifyPin, isPinSet } from '@/hooks/usePin';
import { useTheme } from '@/hooks/useTheme';
import { openFile as openFileNative, scanFile } from '@/modules/share-module';
import { isVideoFile, VideoThumb } from '@/utils/videoThumb';


export default function VaultScreen() {
  const { colors } = useTheme();
  const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = useWindowDimensions();
  const router = useRouter();
  const { files, loading, authenticated, unlockVault, deleteFromVault, removeFromVault, loadFiles, lock } = useVault();
  const [busy, setBusy] = useState(false);
  const [showPinEntry, setShowPinEntry] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinAvailable, setPinAvailable] = useState(false);
  const [selectedFile, setSelectedFile] = useState<VaultFile | null>(null);
  const [showSheet, setShowSheet] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerPath, setPickerPath] = useState('file:///storage/emulated/0/');
  const [pickerItems, setPickerItems] = useState<{ name: string; uri: string }[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const pendingFile = useRef<VaultFile | null>(null);
  const sheetAnim = useRef(new Animated.Value(400)).current;
  const insets = useSafeAreaInsets();
  const [openingFile, setOpeningFile] = useState(false);
  const [movingFile, setMovingFile] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedUris, setSelectedUris] = useState<Set<string>>(new Set());
  const [selectedFilesMap, setSelectedFilesMap] = useState<Map<string, VaultFile>>(new Map());

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy > 10,
      onPanResponderMove: (_, g) => { if (g.dy > 0) sheetAnim.setValue(g.dy); },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 80 || g.vy > 0.5) {
          Animated.timing(sheetAnim, { toValue: 400, duration: 200, useNativeDriver: true })
            .start(() => { setShowSheet(false); setSelectedFile(null); });
        } else {
          Animated.spring(sheetAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }).start();
        }
      },
    })
  ).current;

  const ROOT_PATH = 'file:///storage/emulated/0/';

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

  function toPath(uri: string): string {
    try { return decodeURIComponent(uri.replace('file://', '')); } catch { return uri.replace('file://', ''); }
  }

  async function loadPickerDir(path: string) {
    setPickerLoading(true);
    try {
      const dir = new FileSystem.Directory(path.endsWith('/') ? path : path + '/');
      const contents = dir.list();
      const folders = contents
        .filter((item: any) => item instanceof FileSystem.Directory)
        .map((item: any) => {
          const raw = item.uri.split('/').filter(Boolean).pop() ?? '';
          let name = raw;
          try { name = decodeURIComponent(raw); } catch {}
          return { name, uri: item.uri };
        })
        .filter((f: any) => !f.name.startsWith('.'))
        .sort((a: any, b: any) => a.name.localeCompare(b.name));
      setPickerItems(folders);
    } catch { setPickerItems([]); }
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
    if (failed > 0) Alert.alert('Partial success', `${failed} file${failed !== 1 ? 's' : ''} could not be moved.`);
    else Alert.alert('Moved', `${filesToMove.length} file${filesToMove.length !== 1 ? 's' : ''} moved out of Vault.`);
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
          } catch {}
        }
        await loadFiles();
        setBusy(false);
        setSelectMode(false);
        setSelectedUris(new Set());
        setSelectedFilesMap(new Map());
      }},
    ]);
  }

  function openSheet(file: VaultFile) {
    setSelectedFile(file);
    setShowSheet(true);
    Animated.spring(sheetAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }).start();
  }

  function closeSheet() {
    Animated.timing(sheetAnim, { toValue: 400, duration: 200, useNativeDriver: true })
      .start(() => { setShowSheet(false); setSelectedFile(null); });
  }

  async function openFile(file: VaultFile) {
    if (openingFile) return;
    setOpeningFile(true);
    const mime = getMimeType(file.name);
    try {
      const cachePath = `${RNFS.CachesDirectoryPath}/${file.name}`;
      await RNFS.copyFile(toPath(file.uri), cachePath);
      await openFileNative(cachePath, mime);
    } catch (e) {}
    finally { setOpeningFile(false); }
  }

  async function handleShare(file: VaultFile) {
    closeSheet();
    try {
      const isPng = file.name.toLowerCase().endsWith('.png');
      if (isPng) {
        const cacheDir = FileSystem.Paths.cache.uri.endsWith('/') ? FileSystem.Paths.cache.uri : FileSystem.Paths.cache.uri + '/';
        const cacheName = file.name.replace(/\.png$/i, '.jpg');
        const cacheUri = cacheDir + cacheName;
        const cacheFile = new FileSystem.File(cacheUri);
        if (cacheFile.exists) cacheFile.delete();
        const result = await ImageManipulator.manipulate(file.uri)
          .renderAsync()
          .then(img => img.saveAsync({ compress: 0.98, format: SaveFormat.JPEG }));
        const convertedFile = new FileSystem.File(result.uri);
        convertedFile.copy(cacheFile);
        await Sharing.shareAsync(cacheUri, { dialogTitle: file.name, mimeType: 'image/jpeg' });
      } else {
        await Sharing.shareAsync(file.uri, { mimeType: getMimeType(file.name), dialogTitle: file.name });
      }
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
            setBusy(false);
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

  function handleVaultPinDigit(digit: string) {
    if (pinInput.length < 4) {
      const newPin = pinInput + digit;
      setPinInput(newPin);
      setPinError(null);
      if (newPin.length === 4) handleVaultPinVerify(newPin);
    }
  }

  function handleVaultPinDelete() {
    setPinInput(prev => prev.slice(0, -1));
    setPinError(null);
  }

  async function handleVaultPinVerify(entered: string) {
    const correct = await verifyPin(entered);
    if (correct) {
      await unlockVault();
    } else {
      setPinError('Incorrect PIN. Try again.');
      setPinInput('');
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
    const ext = item.name.split('.').pop()?.toUpperCase() ?? '?';
    return (
      <TouchableOpacity
        style={[styles.row, { borderBottomColor: colors.border, backgroundColor: selectedUris.has(item.uri) ? colors.blueTint : 'transparent' }]}
        onPress={() => {
          if (selectMode) {
            const newSet = new Set(selectedUris);
            const newMap = new Map(selectedFilesMap);
            if (newSet.has(item.uri)) { newSet.delete(item.uri); newMap.delete(item.uri); }
            else { newSet.add(item.uri); newMap.set(item.uri, item); }
            setSelectedUris(newSet); setSelectedFilesMap(newMap);
          } else { openFile(item); }
        }}
        onLongPress={() => { if (!selectMode) { setSelectMode(true); const newSet = new Set([item.uri]); const newMap = new Map([[item.uri, item]]); setSelectedUris(newSet); setSelectedFilesMap(newMap); } }}
        activeOpacity={0.7}
        disabled={openingFile && !selectMode}
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
            <Text style={[styles.ext, { color }]}>{ext.slice(0, 4)}</Text>
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
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
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
          <ScrollView contentContainerStyle={styles.lockScreen} showsVerticalScrollIndicator={false}>
            <View style={[styles.lockIcon, { backgroundColor: colors.blueTint }]}>
              <Ionicons name="keypad-outline" size={40} color={colors.blue} />
            </View>
            <Text style={[styles.lockTitle, { color: colors.textPrimary }]}>Enter PIN</Text>
            <Text style={[styles.lockSub, { color: colors.textMuted }]}>Enter your AskFiles PIN to access the vault</Text>
            <View style={{ flexDirection: 'row', gap: 16, marginVertical: 24 }}>
              {[0, 1, 2, 3].map(i => (
                <View key={i} style={[styles.dot, i < pinInput.length && styles.dotFilled, !!pinError && styles.dotError]} />
              ))}
            </View>
            {pinError && <Text style={styles.errorText}>{pinError}</Text>}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', width: 280, gap: 16 }}>
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'bio', '0', 'del'].map((key, i) => {
                if (key === 'bio') return (
                  <TouchableOpacity key={i} style={[styles.pinKey, { backgroundColor: colors.surface }]} onPress={() => tryVaultBiometric()} activeOpacity={0.6}>
                    <Ionicons name="finger-print-outline" size={24} color={colors.blue} />
                  </TouchableOpacity>
                );
                if (key === 'del') return (
                  <TouchableOpacity key={i} style={[styles.pinKey, { backgroundColor: colors.surface }]} onPress={handleVaultPinDelete} activeOpacity={0.6}>
                    <Ionicons name="backspace-outline" size={22} color={colors.textSecondary} />
                  </TouchableOpacity>
                );
                return (
                  <TouchableOpacity key={i} style={[styles.pinKey, { backgroundColor: colors.surface }]} onPress={() => handleVaultPinDigit(key)} activeOpacity={0.6}>
                    <Text style={[styles.pinKeyText, { color: colors.textPrimary }]}>{key}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity onPress={handleForgotPin} style={{ marginTop: 16, paddingVertical: 8 }}>
              <Text style={{ fontSize: 13, color: colors.textMuted, textAlign: 'center' }}>Forgot PIN?</Text>
            </TouchableOpacity>
          </ScrollView>
        )}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => {
          if (selectMode) { setSelectMode(false); setSelectedUris(new Set()); setSelectedFilesMap(new Map()); }
          else { router.back(); }
        }} style={styles.backBtn}>
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
            <TouchableOpacity onPress={() => { lock(); setPinInput(''); setPinError(null); setShowPinEntry(false); }} style={styles.backBtn}>
              <Ionicons name="lock-closed-outline" size={22} color={colors.blue} />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ width: 40 }} />
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
            <Text style={[styles.busyText, { color: colors.textSecondary }]}>Moving file...</Text>
          </View>
        )}
        {selectMode && selectedUris.size > 0 && (
        <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
          <TouchableOpacity
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.blue, borderRadius: 10, paddingVertical: 10 }}
            onPress={() => { pendingFile.current = null; setPickerPath(ROOT_PATH); loadPickerDir(ROOT_PATH); setShowPicker(true); }}
          >
            <Ionicons name="arrow-redo-outline" size={16} color="#fff" />
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#fff' }}>Move out</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.surface, borderRadius: 10, paddingVertical: 10 }}
            onPress={handleMultiDelete}
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
                  <Text style={[styles.sheetExt, { color: selectedFile ? getFileColor(selectedFile.name) : colors.textMuted }]}>
                    {selectedFile?.name.split('.').pop()?.toUpperCase().slice(0, 4)}
                  </Text>
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

              <TouchableOpacity style={styles.sheetAction} onPress={() => {
                if (!selectedFile) return;
                closeSheet();
                const ext = selectedFile.name.split('.').pop()?.toUpperCase() ?? 'FILE';
                Alert.alert(selectedFile.name, `Size: ${formatSize(selectedFile.size)}\nType: ${ext} file\nLocation: Secure Vault`);
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
          {pickerLoading ? (
            <View style={styles.centered}><ActivityIndicator color={colors.blue} /></View>
          ) : pickerItems.length === 0 ? (
            <View style={styles.centered}><Text style={[styles.emptyTitle, { color: colors.textMuted }]}>No folders here</Text></View>
          ) : (
            <FlatList
              data={pickerItems}
              keyExtractor={item => item.uri}
              contentContainerStyle={[styles.list, { paddingBottom: 100 }]}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.row, { borderBottomColor: colors.border }]}
                  onPress={() => { setPickerPath(item.uri); loadPickerDir(item.uri); }}
                  activeOpacity={0.6}
                >
                  <View style={[styles.icon, { backgroundColor: colors.yellow + '22' }]}>
                    <Ionicons name="folder" size={22} color={colors.yellow} />
                  </View>
                  <View style={styles.info}>
                    <Text style={[styles.fileName, { color: colors.textPrimary }]} numberOfLines={1}>{item.name}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.textDisabled} />
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  title: { flex: 1, fontSize: 20, fontWeight: '500', textAlign: 'center', letterSpacing: -0.5 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 32 },
  lockScreen: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 12, paddingVertical: 40 },
  lockIcon: { width: 88, height: 88, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  lockTitle: { fontSize: 22, fontWeight: '600', letterSpacing: -0.5 },
  lockSub: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  errorText: { fontSize: 13, color: '#E24B4A', textAlign: 'center' },
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
