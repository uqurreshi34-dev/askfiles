import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet, Text, View, FlatList, TouchableOpacity, Image,
  ActivityIndicator, Alert, Modal, Animated, PanResponder,
  Pressable, useWindowDimensions, ScrollView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTrash, TrashFile } from '@/hooks/useTrash';
import { useTheme } from '@/hooks/useTheme';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { isImageFile } from '@/utils/files';

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
  
  function VideoThumb({ uri, style }: { uri: string; style: any }) {
    const [thumb, setThumb] = useState<string | null>(null);
    useEffect(() => {
      (async () => {
        try {
          const result = await VideoThumbnails.getThumbnailAsync(uri, { time: 5010 });
          setThumb(result.uri);
        } catch {}
      })();
    }, [uri]);
    if (!thumb) return null;
    return <Image source={{ uri: thumb }} style={style} resizeMode="cover" />;
  }

export default function TrashScreen() {
  const { colors } = useTheme();
  const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { files, loading, restoreFile, deletePermanently, emptyTrash, formatDaysLeft } = useTrash();
  const [selectedFile, setSelectedFile] = useState<TrashFile | null>(null);
  const [showSheet, setShowSheet] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const sheetAnim = useRef(new Animated.Value(400)).current;
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

  function openSheet(file: TrashFile) {
    setSelectedFile(file);
    setShowSheet(true);
    Animated.spring(sheetAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }).start();
  }

  function closeSheet() {
    Animated.timing(sheetAnim, { toValue: 400, duration: 200, useNativeDriver: true })
      .start(() => { setShowSheet(false); setSelectedFile(null); });
  }

  async function handleRestore() {
    if (!selectedFile) return;
    const file = selectedFile;
    closeSheet();
    setRestoring(true);
    const ok = await restoreFile(file);
    setRestoring(false);
    if (ok) {
      Alert.alert('Restored', `"${file.name}" restored to its original location.`);
    } else {
      Alert.alert('Error', 'Could not restore file.');
    }
  }

  async function handleDeletePermanently() {
    if (!selectedFile) return;
    Alert.alert(
      'Delete permanently',
      `Delete "${selectedFile.name}" forever? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive', onPress: async () => {
            closeSheet();
            await deletePermanently(selectedFile);
          }
        },
      ]
    );
  }

  function handleEmptyTrash() {
    Alert.alert(
      'Empty Trash',
      `Permanently delete all ${files.length} file${files.length !== 1 ? 's' : ''}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Empty Trash', style: 'destructive', onPress: () => emptyTrash() },
      ]
    );
  }

  const ext = (name: string) => name.split('.').pop()?.toUpperCase() ?? '?';

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.background }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Recently Deleted</Text>
        {files.length > 0 ? (
          <TouchableOpacity onPress={handleEmptyTrash} style={styles.backBtn}>
            <Ionicons name="trash-outline" size={22} color={colors.deleteRed} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      {restoring && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: colors.surface }}>
          <ActivityIndicator size="small" color={colors.blue} />
          <Text style={{ fontSize: 13, color: colors.textSecondary }}>Restoring file...</Text>
        </View>
      )}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.blue} />
        </View>
      ) : files.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="trash-outline" size={48} color={colors.textDisabled} />
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>Trash is empty</Text>
          <Text style={[styles.emptySub, { color: colors.textMuted }]}>Deleted files appear here for 30 days before being permanently removed.</Text>
        </View>
      ) : (
        <FlatList
          data={files}
          keyExtractor={item => item.uri}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <Text style={[styles.count, { color: colors.textMuted }]}>
              {files.length} file{files.length !== 1 ? 's' : ''} · Kept for up to 30 days
            </Text>
          }
          renderItem={({ item }) => {
            const color = getFileColor(item.name);
            return (
              <TouchableOpacity
                style={[styles.row, { borderBottomColor: colors.border }]}
                onPress={() => openSheet(item)}
                activeOpacity={0.7}
              >
                <View style={[styles.icon, { backgroundColor: color + '22', overflow: 'hidden' }]}>
                {isImageFile(item.name) ? (
                    <Image source={{ uri: item.uri }} style={styles.thumb} resizeMode="cover" />
                  ) : isVideoFile(item.name) ? (
                    <VideoThumb uri={item.uri} style={styles.thumb} />
                  ) : (
                    <Text style={[styles.extLabel, { color }]}>{ext(item.name).slice(0, 4)}</Text>
                  )}
                </View>
                <View style={styles.info}>
                  <Text style={[styles.fileName, { color: colors.textPrimary }]} numberOfLines={1}>{item.name}</Text>
                  <Text style={[styles.fileMeta, { color: colors.textMuted }]}>
                    {formatSize(item.size)} · {formatDaysLeft(item.deletedAt)}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => openSheet(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="chevron-forward" size={16} color={colors.textDisabled} />
                </TouchableOpacity>
              </TouchableOpacity>
            );
          }}
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
              ? <TouchableOpacity onPress={closeSheet} style={{ alignSelf: 'flex-end', padding: 4 }}>
                  <Ionicons name="close" size={20} color={colors.textMuted} />
                </TouchableOpacity>
              : <View style={[styles.sheetHandle, { backgroundColor: colors.textDisabled }]} />
            }
            <ScrollView showsVerticalScrollIndicator={true} contentContainerStyle={{ paddingBottom: 8 }}>
              <Pressable>
                <View style={styles.sheetHeader}>
                  <View style={[styles.sheetIcon, { backgroundColor: getFileColor(selectedFile?.name ?? '') + '22', overflow: 'hidden' }]}>
                  {selectedFile && isImageFile(selectedFile.name) ? (
                      <Image source={{ uri: selectedFile.uri }} style={styles.sheetThumb} resizeMode="cover" />
                    ) : selectedFile && isVideoFile(selectedFile.name) ? (
                      <VideoThumb uri={selectedFile.uri} style={styles.sheetThumb} />
                    ) : (
                      <Text style={[styles.extLabel, { color: getFileColor(selectedFile?.name ?? '') }]}>
                        {ext(selectedFile?.name ?? '').slice(0, 4)}
                      </Text>
                    )}
                  </View>
                  <View style={styles.sheetInfo}>
                    <Text style={[styles.sheetName, { color: colors.textPrimary }]} numberOfLines={2}>{selectedFile?.name}</Text>
                    <Text style={[styles.sheetMeta, { color: colors.textMuted }]}>
                      {selectedFile ? formatSize(selectedFile.size) : ''}
                    </Text>
                    <Text style={[styles.sheetMeta, { color: colors.textMuted }]}>
                      {selectedFile ? formatDaysLeft(selectedFile.deletedAt) : ''}
                    </Text>
                  </View>
                </View>

                <View style={[styles.sheetDivider, { backgroundColor: colors.border }]} />

                <TouchableOpacity style={styles.sheetAction} onPress={handleRestore}>
                  <Ionicons name="arrow-undo-outline" size={20} color={colors.blue} />
                  <Text style={[styles.sheetActionText, { color: colors.blue }]}>Restore</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.sheetAction} onPress={handleDeletePermanently}>
                  <Ionicons name="trash-outline" size={20} color={colors.deleteRed} />
                  <Text style={[styles.sheetActionText, { color: colors.deleteRed }]}>Delete permanently</Text>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  title: { flex: 1, fontSize: 20, fontWeight: '500', textAlign: 'center', letterSpacing: -0.5 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '600' },
  emptySub: { fontSize: 13, textAlign: 'center', lineHeight: 20 },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  count: { fontSize: 11, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 0.5 },
  icon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  thumb: { width: 40, height: 40 },
  extLabel: { fontSize: 9, fontWeight: '500' },
  info: { flex: 1 },
  fileName: { fontSize: 14, fontWeight: '500', marginBottom: 2 },
  fileMeta: { fontSize: 11 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 16 },
  sheetLandscape: { borderRadius: 20, paddingHorizontal: 24, paddingVertical: 16, width: '60%', maxHeight: '90%', alignSelf: 'center', marginTop: 'auto', marginBottom: 'auto' },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 16 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 12 },
  sheetIcon: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  sheetThumb: { width: 44, height: 44 },
  sheetInfo: { flex: 1 },
  sheetName: { fontSize: 14, fontWeight: '500', marginBottom: 2 },
  sheetMeta: { fontSize: 12, color: '#888780' },
  sheetDivider: { height: 0.5, marginVertical: 8 },
  sheetAction: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 },
  sheetActionText: { fontSize: 15 },
});
