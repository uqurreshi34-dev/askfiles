import React, { useState, useEffect } from 'react';
import * as IntentLauncher from 'expo-intent-launcher';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import {
  StyleSheet, Text, View, FlatList, TouchableOpacity, Image,
  ActivityIndicator, Modal, Animated, Pressable, Alert,
  useWindowDimensions, ScrollView, KeyboardAvoidingView, Platform, StatusBar
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { isImageFile, getMimeType, getFileColor, formatSize, getFileIcon, toPath, getFriendlyPath, formatDate } from '@/utils/files';
import { addRecent } from '@/hooks/useRecents';
import { DocIndexer } from '@/modules/doc-indexer';
import { useVault } from '@/hooks/useVault';
import { usePro } from '@/hooks/usePro';
import { useTheme } from '@/hooks/useTheme';
import { openFile as openFileNative, printImage, printPdf, shareFiles } from '@/modules/share-module';
import RNFS from 'react-native-fs';
import { isVideoFile, VideoThumb } from '@/utils/videoThumb';
import { useBottomSheet } from '@/hooks/useBottomSheet';
import { getStorageVolumes } from '@/modules/storage-stats';
import { getMediaInfo } from 'media-store';
import FileDetailsModal from '@/components/FileDetailsModal';
import { MediaViewerView } from 'media-viewer';
import VideoPlayerModal from '@/components/VideoPlayerModal';
import { recordOpen, getStats } from 'file-stats';
import * as Haptics from 'expo-haptics';

// Minimal shape every list this component renders must satisfy.
// FavouriteItem and FileTagEntry both already match this.
export interface ViewableFile {
  name: string;
  uri: string;
}

export interface RemoveAction<T extends ViewableFile> {
  icon: string;
  label: string;
  color: string;
  // Called after the confirmation alert's destructive button is tapped.
  // Component handles closing the sheet; caller only needs to update its
  // own data source (e.g. removeFavourite, removeTagFromFile).
  confirmTitle: string;
  confirmMessage: (item: T) => string;
  onConfirm: (item: T) => Promise<void> | void;
}

interface FileListViewerProps<T extends ViewableFile> {
  title: string;
  files: T[];
  emptyIcon: string;
  emptyTitle: string;
  emptySub: string;
  countLabel: (count: number) => string;
  removeAction: RemoveAction<T>;
  onBack: () => void;
}

export default function FileListViewer<T extends ViewableFile>({
  title, files, emptyIcon, emptyTitle, emptySub, countLabel, removeAction, onBack,
}: FileListViewerProps<T>) {
  const { colors } = useTheme();
  const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = useWindowDimensions();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { addToVault } = useVault();
  const { isPro } = usePro();
  const [selectedItem, setSelectedItem] = useState<T | null>(null);
  const [openingUri, setOpeningUri] = useState<string | null>(null);
  const [movingUri, setMovingUri] = useState<string | null>(null);
  const [volumes, setVolumes] = useState<{ name: string; path: string; type: string }[]>([]);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [detailsData, setDetailsData] = useState<{ label: string; value: string }[]>([]);
  const [detailsName, setDetailsName] = useState('');
  const [showSheet, setShowSheet] = useState(false);
  const [fileSize, setFileSize] = useState<string | null>(null);
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  const [playerUri, setPlayerUri] = useState<string | null>(null);
  const { sheetAnim, panResponder, animateOpen, closeSheet } = useBottomSheet(() => {
    setShowSheet(false);
    setSelectedItem(null);
  });

  useEffect(() => {
    getStorageVolumes().then(setVolumes);
  }, []);

  async function openSheet(item: T) {
    setSelectedItem(item);
    setFileSize('Calculating...');
    setShowSheet(true);
    animateOpen();
    try {
      const file = new FileSystem.File(item.uri);
      if (file.size && file.size > 0) { setFileSize(formatSize(file.size)); return; }
    } catch {}
    setFileSize('Unknown');
  }

  async function openItem(item: T) {
    await addRecent({ name: item.name, uri: item.uri, openedAt: Date.now() });
    recordOpen(item.uri);
    if (isImageFile(item.name)) {
      setViewerUri(item.uri);
      return;
    }
    if (isVideoFile(item.name)) {
      setPlayerUri(item.uri);
      return;
    }
    setOpeningUri(item.uri);
    const mime = getMimeType(item.name);
    try {
      await openFileNative(toPath(item.uri), mime);
    } catch (e) {
      try {
        const cachePath = `${RNFS.CachesDirectoryPath}/${item.name}`;
        await RNFS.copyFile(toPath(item.uri), cachePath);
        const contentUri = await FileSystemLegacy.getContentUriAsync('file://' + cachePath);
        await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
          data: contentUri, flags: 1, type: mime,
        });
      } catch (e2) {}
    }
    setOpeningUri(null);
  }

  async function handleShare() {
    if (!selectedItem) return;
    closeSheet();
    try {
      await Sharing.shareAsync(selectedItem.uri, { mimeType: getMimeType(selectedItem.name), dialogTitle: selectedItem.name });
    } catch (e) {}
  }

  async function handlePrint() {
    if (!selectedItem) return;
    const item = selectedItem;
    closeSheet();
    try {
      const filePath = toPath(item.uri);
      const ext = item.name.split('.').pop()?.toLowerCase() ?? '';
      if (ext === 'pdf') {
        await printPdf(filePath);
      } else {
        await printImage(filePath);
      }
    } catch {
      Alert.alert('Print failed', 'Could not print this file. Make sure a printer is set up on your device.');
    }
  }

  async function handleMoveToVault() {
    if (!selectedItem) return;
    const item = selectedItem;
    Alert.alert(
      'Move to Vault',
      `Move "${item.name}" to your Secure Vault? The original file will be removed from its current location.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Move to Vault', onPress: async () => {
          const uri = item.uri;
          closeSheet();
          setMovingUri(uri);
          const ok = await addToVault(uri, item.name);
          setMovingUri(null);
          if (ok) {
            DocIndexer.removeFromIndex(uri);
          } else {
            Alert.alert('Error', 'Could not move file to Vault. Try again.');
          }
        }},
      ]
    );
  }

  function handleRemove() {
    if (!selectedItem) return;
    const item = selectedItem;
    Alert.alert(removeAction.confirmTitle, removeAction.confirmMessage(item), [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        closeSheet();
        await removeAction.onConfirm(item);
      }},
    ]);
  }

  function renderItem({ item }: { item: T }) {
    const color = getFileColor(item.name);
    return (
      <TouchableOpacity
        style={[styles.row, { borderBottomColor: colors.border }]}
        onPress={() => openItem(item)}
        onLongPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          openSheet(item);
        }}
        activeOpacity={0.7}
      >
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
          <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>{item.name}</Text>
          <Text style={[styles.meta, { color: colors.textMuted }]}>{(item.name.split('.').pop()?.toUpperCase() ?? '?')} file</Text>
        </View>
        <TouchableOpacity onPress={() => openSheet(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          {movingUri === item.uri
            ? <ActivityIndicator size="small" color={colors.blue} />
            : openingUri === item.uri
            ? <ActivityIndicator size="small" color={colors.textDisabled} />
            : <Ionicons name="chevron-forward" size={16} color={colors.textDisabled} />}
        </TouchableOpacity>
      </TouchableOpacity>
    );
  }

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.background }]}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
        <View style={{ width: 40 }} />
      </View>
      {files.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name={emptyIcon as any} size={48} color={colors.textDisabled} />
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>{emptyTitle}</Text>
          <Text style={[styles.emptySub, { color: colors.textMuted }]}>{emptySub}</Text>
        </View>
      ) : (
        <FlatList
          data={files}
          keyExtractor={item => item.uri}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <Text style={[styles.count, { color: colors.textMuted }]}>{countLabel(files.length)}</Text>
          }
        />
      )}

      <Modal visible={showSheet} transparent animationType="none" onRequestClose={closeSheet}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'android' ? 'height' : 'padding'}>
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
              <View style={[styles.sheetIcon, { backgroundColor: getFileColor(selectedItem?.name ?? '') + '22', overflow: 'hidden' }]}>
                  {isImageFile(selectedItem?.name ?? '') ? (
                    <Image source={{ uri: selectedItem?.uri }} style={styles.sheetThumb} resizeMode="cover" />
                  ) : isVideoFile(selectedItem?.name ?? '') ? (
                    <VideoThumb uri={selectedItem?.uri ?? ''} style={styles.sheetThumb} />
                  ) : (
                    <Ionicons name={getFileIcon(selectedItem?.name ?? '') as any} size={22} color={getFileColor(selectedItem?.name ?? '')} />
                  )}
                </View>
                <View style={styles.sheetInfo}>
                  <Text style={[styles.sheetName, { color: colors.textPrimary }]} numberOfLines={2}>{selectedItem?.name}</Text>
                  <Text style={[styles.sheetMeta, { color: colors.textMuted }]}>{fileSize}</Text>
                </View>
              </View>
              <View style={[styles.sheetDivider, { backgroundColor: colors.border }]} />
              <TouchableOpacity style={styles.sheetAction} onPress={handleShare}>
                <Ionicons name="share-outline" size={20} color={colors.textPrimary} />
                <Text style={[styles.sheetActionText, { color: colors.textPrimary }]}>Share</Text>
              </TouchableOpacity>
              {(isImageFile(selectedItem?.name ?? '') || selectedItem?.name.toLowerCase().endsWith('.pdf')) && (
                <TouchableOpacity style={styles.sheetAction} onPress={handlePrint}>
                  <Ionicons name="print-outline" size={20} color={colors.textPrimary} />
                  <Text style={[styles.sheetActionText, { color: colors.textPrimary }]}>Print</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.sheetAction} onPress={isPro ? handleMoveToVault :
                () => Alert.alert('Pro Feature', 'Upgrade to AskFiles Pro to move files to the Vault.', [
                  { text: 'Not now', style: 'cancel' },
                  { text: 'Upgrade', onPress: () => router.push('/(tabs)/cloud') },
                ])}>
                <Ionicons name="shield-checkmark-outline" size={20} color={isPro ? colors.blue : colors.textMuted} />
                <Text style={[styles.sheetActionText, { color: isPro ? colors.blue : colors.textMuted }]}>
                  Move to Vault{!isPro ? '  🔒' : ''}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.sheetAction} onPress={async () => {
                  if (!selectedItem) return;
                  closeSheet();
                  const lines: { label: string; value: string }[] = [];
                  if (fileSize) lines.push({ label: 'Size', value: fileSize });
                  lines.push({ label: 'Type', value: (selectedItem.name.split('.').pop()?.toUpperCase() ?? '?') + ' file' });
                  lines.push({ label: 'Location', value: getFriendlyPath(selectedItem.uri, volumes) });
                  const stats = getStats(selectedItem.uri);
                  if (stats && stats.count > 0) {
                    lines.push({ label: 'Times opened', value: `${stats.count}` });
                    lines.push({ label: 'Last opened', value: formatDate(stats.lastOpened) });
                  }
                  try {
                    const stat = await RNFS.stat(toPath(selectedItem.uri));
                    if (stat.mtime) lines.push({ label: 'Modified', value: formatDate(new Date(stat.mtime).getTime()) });
                    if (stat.ctime) lines.push({ label: 'Created', value: formatDate(new Date(stat.ctime).getTime()) });
                  } catch {}
                  if (isImageFile(selectedItem.name) || isVideoFile(selectedItem.name)) {
                    try {
                      const info = await getMediaInfo(toPath(selectedItem.uri));
                      if (info.width && info.height) lines.push({ label: 'Resolution', value: `${info.width}×${info.height}` });
                      if (info.duration) lines.push({ label: 'Duration', value: info.duration });
                    } catch {}
                  }
                  setDetailsName(selectedItem.name);
                  setDetailsData(lines);
                  setShowDetailsModal(true);
                }}>
                  <Ionicons name="information-circle-outline" size={20} color={colors.textPrimary} />
                  <Text style={[styles.sheetActionText, { color: colors.textPrimary }]}>Info</Text>
                </TouchableOpacity>
              <TouchableOpacity style={styles.sheetAction} onPress={handleRemove}>
                <Ionicons name={removeAction.icon as any} size={20} color={removeAction.color} />
                <Text style={[styles.sheetActionText, { color: removeAction.color }]}>{removeAction.label}</Text>
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
        </KeyboardAvoidingView>
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
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  title: { flex: 1, fontSize: 20, fontWeight: '500', textAlign: 'center', letterSpacing: -0.5 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '600' },
  emptySub: { fontSize: 13, textAlign: 'center', lineHeight: 20 },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  count: { fontSize: 11, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 0.5 },
  icon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  thumb: { width: 40, height: 40 },
  ext: { fontSize: 9, fontWeight: '500' },
  info: { flex: 1 },
  name: { fontSize: 14, fontWeight: '500', marginBottom: 2 },
  meta: { fontSize: 11 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 16 },
  sheetLandscape: { borderRadius: 20, paddingHorizontal: 24, paddingVertical: 16, width: '60%', maxHeight: '90%', alignSelf: 'center', marginTop: 'auto', marginBottom: 'auto' },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 16 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 12 },
  sheetIcon: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  sheetThumb: { width: 44, height: 44 },
  sheetInfo: { flex: 1 },
  sheetName: { fontSize: 14, fontWeight: '500', marginBottom: 2 },
  sheetMeta: { fontSize: 12 },
  sheetDivider: { height: 0.5, marginVertical: 8 },
  sheetAction: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 },
  sheetActionText: { fontSize: 15 },
});
