import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity, FlatList, Image, Alert, Modal,
  ActivityIndicator, StatusBar, useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import RNFS from 'react-native-fs';
import { MediaViewerView } from 'media-viewer';
import type { CleanupFile, CleanupGroupId } from '@/modules/media-store';
import { useTheme } from '@/hooks/useTheme';
import { usePro } from '@/hooks/usePro';
import { useTrash } from '@/hooks/useTrash';
import { isImageFile, getFileColor, getFileIcon, formatSize, formatDate, getFriendlyPath, getMimeType, toPath } from '@/utils/files';
import { isVideoFile, VideoThumb } from '@/utils/videoThumb';
import VideoPlayerModal from '@/components/VideoPlayerModal';
import { openFile as openFileNative, scanFile } from '@/modules/share-module';
import { DocIndexer } from '@/modules/doc-indexer';
import { recordActivity, readableFolder } from '@/modules/activityLog';
import { getStorageVolumes } from '@/modules/storage-stats';
import { useLanguage } from '@/modules/appLanguage';
import { commonText } from '@/modules/i18n/common';
import { filesText } from '@/modules/i18n/files';
import { cleanerText } from '@/modules/i18n/cleanerText';
import { cleanerGroup, removeCleanedFiles, subscribeCleaner } from '@/modules/cleanerStore';

const ROW_HEIGHT = 64;
const SOURCE = 'Cleaner';

export default function CleanerGroupScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: CleanupGroupId }>();
  const { isPro, loading: proLoading } = usePro();
  const { moveManyToTrash } = useTrash();
  const lang = useLanguage();
  const c = commonText(lang), tf = filesText(lang), t = cleanerText(lang);
  const { width, height } = useWindowDimensions();
  const landscape = width > height;

  const [group, setGroup] = useState(() => cleanerGroup(id));
  const [sort, setSort] = useState<'size' | 'date'>('size');
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [volumes, setVolumes] = useState<{ name: string; path: string; type: string }[]>([]);
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  const [playerUri, setPlayerUri] = useState<string | null>(null);

  useEffect(() => { getStorageVolumes().then(setVolumes).catch(() => {}); }, []);
  useEffect(() => subscribeCleaner(() => setGroup(cleanerGroup(id))), [id]);
  // Everything in this group has been cleaned: back to the summary.
  useEffect(() => { if (!group) router.back(); }, [group]);

  // Files arrive largest first; oldest-first is one sort of a copy, done only when chosen.
  const files = useMemo(() => {
    const list = group?.files ?? [];
    return sort === 'size' ? list : [...list].sort((a, b) => a.modified - b.modified);
  }, [group, sort]);

  const selectedBytes = useMemo(() => {
    if (!selected.size) return 0;
    let sum = 0;
    for (const f of files) if (selected.has(f.uri)) sum += f.size;
    return sum;
  }, [files, selected]);

  const toggle = useCallback((uri: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(uri)) next.delete(uri); else next.add(uri);
      return next;
    });
  }, []);

  function startSelecting() {
    if (!isPro) {
      Alert.alert(c.proFeature, t.proBulk, [
        { text: tf.notNow, style: 'cancel' },
        { text: tf.upgrade, onPress: () => router.push('/(tabs)/cloud') },
      ]);
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelecting(true);
  }

  function stopSelecting() {
    setSelecting(false);
    setSelected(new Set());
  }

  /** Removes files for good, then logs the whole batch as one Activity entry. */
  async function deletePermanently(items: CleanupFile[]): Promise<Set<string>> {
    const removed = new Set<string>();
    const logged: { name: string; from?: string }[] = [];
    for (const f of items) {
      try {
        const path = toPath(f.uri);
        await RNFS.unlink(path);
        removed.add(f.uri);
        logged.push({ name: f.name, from: readableFolder(f.uri) });
        scanFile(path).catch(() => {});
        Promise.resolve(DocIndexer.removeFromIndex(f.uri)).catch(() => {});
      } catch {}
    }
    if (logged.length) {
      await recordActivity({
        action: 'deleted', name: logged[0].name, from: logged.length === 1 ? logged[0].from : undefined,
        count: logged.length, source: SOURCE, items: logged,
      });
    }
    return removed;
  }

  function confirmClean(items: CleanupFile[]) {
    if (!items.length || !group) return;
    const groupId = group.id;
    const run = async (permanent: boolean) => {
      setBusy(true);
      const bytes = items.reduce((sum, f) => sum + f.size, 0);
      const done = permanent
        ? await deletePermanently(items)
        : await moveManyToTrash(items.map(f => ({ uri: f.uri, name: f.name })), SOURCE);
      setBusy(false);
      stopSelecting();
      removeCleanedFiles(groupId, done);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const freed = permanent
        ? items.filter(f => done.has(f.uri)).reduce((sum, f) => sum + f.size, 0)
        : bytes;
      const msg = permanent ? t.freedMsg(formatSize(freed)) : t.trashedMsg(done.size);
      Alert.alert(c.done, done.size < items.length ? `${msg}\n\n${t.someFailed}` : msg);
    };
    Alert.alert(t.confirmTitle(items.length), t.confirmMsg, [
      { text: c.cancel, style: 'cancel' },
      { text: t.moveToTrash, onPress: () => void run(false) },
      { text: t.deletePermanently, style: 'destructive', onPress: () => void run(true) },
    ]);
  }

  async function openItem(f: CleanupFile) {
    if (selecting) { toggle(f.uri); return; }
    if (isImageFile(f.name)) { setViewerUri(f.uri); return; }
    if (isVideoFile(f.name)) { setPlayerUri(f.uri); return; }
    try { await openFileNative(toPath(f.uri), getMimeType(f.name)); } catch {}
  }

  const renderItem = useCallback(({ item }: { item: CleanupFile }) => {
    const color = getFileColor(item.name);
    const isSel = selected.has(item.uri);
    return (
      <TouchableOpacity
        style={[styles.row, { borderBottomColor: colors.border }, isSel && { backgroundColor: colors.blueTint }]}
        activeOpacity={0.7}
        onPress={() => openItem(item)}
        onLongPress={() => { if (!selecting) startSelecting(); if (isPro) toggle(item.uri); }}
      >
        {selecting && (
          <Ionicons name={isSel ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={isSel ? colors.blue : colors.textMuted} style={{ marginRight: 10 }} />
        )}
        <View style={[styles.thumbBox, { backgroundColor: color + '22' }]}>
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
          <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>
            {formatSize(item.size)} · {formatDate(item.modified)} · {getFriendlyPath(item.uri, volumes)}
          </Text>
        </View>
        {!selecting && (
          <TouchableOpacity onPress={() => confirmClean([item])} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} disabled={busy}>
            <Ionicons name="trash-outline" size={18} color={colors.deleteRed} />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  }, [selected, selecting, colors, volumes, busy, isPro, lang]);

  if (!group) return <View style={{ flex: 1, backgroundColor: colors.background }} />;

  const allSelected = selected.size === files.length && files.length > 0;

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={[styles.container, { backgroundColor: colors.background }]}>
      <View key={`header-${lang}`} style={styles.header}>
        <TouchableOpacity onPress={() => (selecting ? stopSelecting() : router.back())} style={styles.headerBtn} disabled={busy}>
          <Ionicons name={selecting ? 'close' : 'arrow-back'} size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }, lang === 'ar' && { letterSpacing: 0 }]} numberOfLines={1}>
          {selecting ? c.selected(selected.size) : t.groups[group.id]}
        </Text>
        <TouchableOpacity onPress={selecting ? () => setSelected(allSelected ? new Set() : new Set(files.map(f => f.uri))) : startSelecting} style={[styles.headerBtn, { width: 72, alignItems: 'flex-end' }]} disabled={busy}>
          <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: 13, fontWeight: '600', color: colors.blue }}>
            {selecting ? (allSelected ? c.cancel : t.selectAll) : t.select}
            {!selecting && !isPro && !proLoading ? ' 🔒' : ''}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.toolbar, landscape && styles.narrow]}>
        <Text style={[styles.summary, { color: colors.textMuted }]} numberOfLines={1}>
          {t.files(group.count)} · {formatSize(group.bytes)}
        </Text>
        <View style={[styles.sortWrap, { backgroundColor: colors.surface }]}>
          {(['size', 'date'] as const).map(key => (
            <TouchableOpacity key={key} onPress={() => setSort(key)} style={[styles.sortBtn, sort === key && { backgroundColor: colors.card }]}>
              <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: '500', color: sort === key ? colors.blue : colors.textMuted }}>
                {key === 'size' ? t.sortLargest : t.sortOldest}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <FlatList
        data={files}
        keyExtractor={f => f.uri}
        renderItem={renderItem}
        extraData={selected}
        getItemLayout={(_, index) => ({ length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index })}
        initialNumToRender={20}
        maxToRenderPerBatch={20}
        windowSize={11}
        removeClippedSubviews
        contentContainerStyle={[styles.list, landscape && styles.narrow]}
        ListFooterComponent={group.count > group.files.length ? (
          <Text style={[styles.note, { color: colors.textMuted }]}>
            {t.showingLargest(group.files.length.toLocaleString(), group.count.toLocaleString())}
          </Text>
        ) : null}
      />

      {selecting && selected.size > 0 && (
        <View style={[styles.bottomBar, { borderTopColor: colors.border, backgroundColor: colors.background, paddingBottom: insets.bottom + 12 }]}>
          <TouchableOpacity
            style={[styles.cleanBtn, { backgroundColor: busy ? colors.surface : colors.deleteRed }, landscape && styles.narrowBtn]}
            onPress={() => confirmClean(files.filter(f => selected.has(f.uri)))}
            disabled={busy}
          >
            <Ionicons name="brush-outline" size={18} color="#fff" />
            <Text numberOfLines={1} adjustsFontSizeToFit style={styles.cleanText}>
              {t.clean} · {t.files(selected.size)} · {formatSize(selectedBytes)}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {busy && (
        <View style={[StyleSheet.absoluteFill, styles.busy]}>
          <ActivityIndicator size="large" color="#fff" />
        </View>
      )}

      <Modal visible={viewerUri !== null} transparent={false} animationType="fade" onRequestClose={() => setViewerUri(null)} statusBarTranslucent>
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <StatusBar barStyle="light-content" backgroundColor="#000" />
          {viewerUri && <MediaViewerView uri={viewerUri} onTap={() => setViewerUri(null)} style={StyleSheet.absoluteFill} />}
        </View>
      </Modal>
      <VideoPlayerModal uri={playerUri} onClose={() => setPlayerUri(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 },
  headerBtn: { width: 40, height: 40, justifyContent: 'center' },
  title: { flex: 1, fontSize: 18, fontWeight: '500', textAlign: 'center', letterSpacing: -0.5, marginHorizontal: 4 },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8, gap: 8 },
  summary: { flex: 1, fontSize: 12, textAlign: 'left' },
  sortWrap: { flexDirection: 'row', borderRadius: 8, padding: 2 },
  sortBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  // Long rows are hard to read across a wide screen, so the column is capped and centred.
  narrow: { width: '85%', alignSelf: 'center' },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  row: { height: ROW_HEIGHT, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 0.5 },
  thumbBox: { width: 40, height: 40, borderRadius: 8, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginRight: 12 },
  thumb: { width: 40, height: 40 },
  info: { flex: 1, marginRight: 10 },
  name: { fontSize: 14, fontWeight: '500', textAlign: 'left' },
  meta: { fontSize: 11, marginTop: 2, textAlign: 'left' },
  note: { fontSize: 11, textAlign: 'center', marginTop: 12 },
  bottomBar: { padding: 12, borderTopWidth: 0.5 },
  cleanBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16 },
  narrowBtn: { width: '60%', alignSelf: 'center' },
  cleanText: { color: '#fff', fontSize: 14, fontWeight: '600', flexShrink: 1 },
  busy: { backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' },
});
