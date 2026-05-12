import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import * as IntentLauncher from 'expo-intent-launcher';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import {
  StyleSheet, Text, View, FlatList, TouchableOpacity, Image,
  ActivityIndicator, Modal, Animated, PanResponder, Pressable, Alert,
  useWindowDimensions, ScrollView, KeyboardAvoidingView, Platform
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { isImageFile, getMimeType } from '@/utils/files';
import { addRecent } from '@/hooks/useRecents';
import { removeFavourite, cleanupBrokenFavourites, FavouriteItem, useFavourites } from '@/hooks/useFavourites';
import { useVault } from '@/hooks/useVault';
import { usePro } from '@/hooks/usePro';
import { useTheme } from '@/hooks/useTheme';
import { openFile as openFileNative } from '@/modules/share-module';
import RNFS from 'react-native-fs';
import { getVideoThumbnail } from 'media-grid';

function formatSize(bytes: number): string {
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + ' GB';
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
  if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return bytes + ' B';
}

function getFileColor(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic'].includes(ext ?? '')) return '#185FA5';
  if (['mp4', 'mkv', 'avi', 'mov', 'webm'].includes(ext ?? '')) return '#993C1D';
  if (['pdf', 'doc', 'docx', 'txt', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext ?? '')) return '#534AB7';
  if (['mp3', 'wav', 'aac', 'flac', 'm4a'].includes(ext ?? '')) return '#854F0B';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext ?? '')) return '#3B6D11';
  return '#5F5E5A';
}

function isVideoFile(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return ['mp4', 'mkv', 'avi', 'mov', 'webm', '3gp'].includes(ext);
}

const videoThumbCache = new Map<string, string>();
const MAX_THUMB_CACHE = 500;

function getThumbCached(uri: string): string | undefined {
  const cached = videoThumbCache.get(uri);
  if (cached) { videoThumbCache.delete(uri); videoThumbCache.set(uri, cached); return cached; }
  return undefined;
}

function setThumbCached(uri: string, thumb: string) {
  if (videoThumbCache.size >= MAX_THUMB_CACHE) {
    const firstKey = videoThumbCache.keys().next().value;
    if (firstKey) videoThumbCache.delete(firstKey);
  }
  videoThumbCache.set(uri, thumb);
}

function VideoThumb({ uri, style }: { uri: string; style: any }) {
  const [thumb, setThumb] = useState<string | null>(getThumbCached(uri) ?? null);
  useEffect(() => {
    if (videoThumbCache.has(uri)) return;
    (async () => {
      try {
        const result = await getVideoThumbnail(uri);
        if (result) { setThumbCached(uri, result); setThumb(result); }
      } catch {}
    })();
  }, [uri]);
  if (!thumb) return null;
  return <Image source={{ uri: thumb }} style={style} resizeMode="cover" />;
}

export default function FavouritesScreen() {
  const { colors } = useTheme();
  const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = useWindowDimensions();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { favourites } = useFavourites();
  useFocusEffect(
    useCallback(() => {
      cleanupBrokenFavourites();
    }, [])
  );
  const { addToVault } = useVault();
  const { isPro } = usePro();
  const [selectedItem, setSelectedItem] = useState<FavouriteItem | null>(null);
  const [openingUri, setOpeningUri] = useState<string | null>(null);
  const [showSheet, setShowSheet] = useState(false);
  const [fileSize, setFileSize] = useState<string | null>(null);
  const sheetAnim = useRef(new Animated.Value(400)).current;
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy > 10,
      onPanResponderMove: (_, g) => { if (g.dy > 0) sheetAnim.setValue(g.dy); },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 80 || g.vy > 0.5) {
          Animated.timing(sheetAnim, { toValue: 400, duration: 200, useNativeDriver: true }).start(() => {
            setShowSheet(false); setSelectedItem(null);
          });
        } else {
          Animated.spring(sheetAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }).start();
        }
      },
    })
  ).current;

  async function openSheet(item: FavouriteItem) {
    setSelectedItem(item);
    setFileSize('Calculating...');
    setShowSheet(true);
    Animated.spring(sheetAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }).start();
    try {
      const file = new FileSystem.File(item.uri);
      if (file.size && file.size > 0) { setFileSize(formatSize(file.size)); return; }
    } catch {}
    setFileSize('Unknown');
  }

  function closeSheet() {
    Animated.timing(sheetAnim, { toValue: 400, duration: 200, useNativeDriver: true }).start(() => {
      setShowSheet(false); setSelectedItem(null);
    });
  }

  //const ROOT_PATH = 'file:///storage/emulated/0/';

  function toPath(uri: string): string { 
    try { return decodeURIComponent(uri.replace('file://', '')); } 
    catch { return uri.replace('file://', ''); } 
  }

  async function openItem(item: FavouriteItem) {
    setOpeningUri(item.uri);
    await addRecent({ name: item.name, uri: item.uri, openedAt: Date.now() });
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
      const isPng = selectedItem.name.toLowerCase().endsWith('.png');
      if (isPng) {
        const cacheDir = FileSystem.Paths.cache.uri.endsWith('/') ? FileSystem.Paths.cache.uri : FileSystem.Paths.cache.uri + '/';
        const cacheName = selectedItem.name.replace(/\.png$/i, '.jpg');
        const cacheUri = cacheDir + cacheName;
        const cacheFile = new FileSystem.File(cacheUri);
        if (cacheFile.exists) cacheFile.delete();
        const result = await ImageManipulator.manipulate(selectedItem.uri)
          .renderAsync()
          .then(img => img.saveAsync({ compress: 0.98, format: SaveFormat.JPEG }));
        const convertedFile = new FileSystem.File(result.uri);
        convertedFile.copy(cacheFile);
        await Sharing.shareAsync(cacheUri, { dialogTitle: selectedItem.name, mimeType: 'image/jpeg' });
      } else {
        await Sharing.shareAsync(selectedItem.uri, { mimeType: getMimeType(selectedItem.name), dialogTitle: selectedItem.name });
      }
    } catch (e) {}
  }

  async function handleMoveToVault() {
    if (!selectedItem) return;
    Alert.alert(
      'Move to Vault',
      `Move "${selectedItem.name}" to your Secure Vault? The original file will be removed from its current location.`,
      [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Move to Vault', onPress: async () => {
        closeSheet();
        const ok = await addToVault(selectedItem.uri, selectedItem.name);
        if (ok) { await removeFavourite(selectedItem.uri); }
        else Alert.alert('Error', 'Could not move file to Vault. Try again.');
      }},
    ]);
  }

  async function handleRemove() {
    if (!selectedItem) return;
    Alert.alert('Remove from Favourites', `Remove "${selectedItem.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        closeSheet();
        await removeFavourite(selectedItem.uri);
      }},
    ]);
  }

  function renderItem({ item }: { item: FavouriteItem }) {
    const color = getFileColor(item.name);
    const ext = item.name.split('.').pop()?.toUpperCase() ?? '?';
    return (
      <TouchableOpacity
        style={[styles.row, { borderBottomColor: colors.border }]}
        onPress={() => openItem(item)}
        onLongPress={() => openSheet(item)}
        activeOpacity={0.7}
      >
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
          <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>{item.name}</Text>
          <Text style={[styles.meta, { color: colors.textMuted }]}>{ext} file</Text>
        </View>
        <TouchableOpacity onPress={() => openSheet(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          {openingUri === item.uri
            ? <ActivityIndicator size="small" color={colors.textDisabled} />
            : <Ionicons name="chevron-forward" size={16} color={colors.textDisabled} />}
        </TouchableOpacity>
      </TouchableOpacity>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.background }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Favourites</Text>
        <View style={{ width: 40 }} />
      </View>
      {favourites.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="heart-outline" size={48} color={colors.textDisabled} />
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No favourites yet</Text>
          <Text style={[styles.emptySub, { color: colors.textMuted }]}>Long press any file and tap "Add to Favourites"</Text>
        </View>
      ) : (
        <FlatList
          data={favourites}
          keyExtractor={item => item.uri}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <Text style={[styles.count, { color: colors.textMuted }]}>{favourites.length} favourite{favourites.length !== 1 ? 's' : ''}</Text>
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
                    <Text style={[styles.ext, { color: getFileColor(selectedItem?.name ?? '') }]}>
                      {selectedItem?.name.split('.').pop()?.toUpperCase().slice(0, 4)}
                    </Text>
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
              <TouchableOpacity style={styles.sheetAction} onPress={() => {
                closeSheet();
                const locationRaw = selectedItem?.uri.replace('file:///storage/emulated/0/', '').split('/').slice(0, -1).join('/') || 'Storage';
                const location = (() => { try { return decodeURIComponent(locationRaw); } catch { return locationRaw; } })();
                Alert.alert(selectedItem?.name ?? '', [
                  `Size: ${fileSize ?? 'Unknown'}`,
                  `Type: ${selectedItem?.name.split('.').pop()?.toUpperCase()} file`,
                  `Location: /${location}`,
                ].join('\n'));
              }}>
                <Ionicons name="information-circle-outline" size={20} color={colors.textPrimary} />
                <Text style={[styles.sheetActionText, { color: colors.textPrimary }]}>Info</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.sheetAction} onPress={handleRemove}>
                <Ionicons name="heart-dislike-outline" size={20} color={colors.deleteRed} />
                <Text style={[styles.sheetActionText, { color: colors.deleteRed }]}>Remove from Favourites</Text>
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
