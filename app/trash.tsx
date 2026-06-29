import React, { useState, useRef, useEffect, useCallback } from 'react';
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
import { isImageFile, getFileColor, formatSize, getFileIcon } from '@/utils/files';
import { isVideoFile, VideoThumb } from '@/utils/videoThumb';
import * as Haptics from 'expo-haptics';
import { useFocusEffect } from 'expo-router';
import { Accelerometer } from 'expo-sensors';


export default function TrashScreen() {
  const { colors } = useTheme();
  const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { files, loading, restoreFile, deletePermanently, emptyTrash, formatDaysLeft, loadFiles } = useTrash();
  const [selectedFile, setSelectedFile] = useState<TrashFile | null>(null);
  const [showSheet, setShowSheet] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedUris, setSelectedUris] = useState<Set<string>>(new Set());
  const [selectedFilesMap, setSelectedFilesMap] = useState<Map<string, TrashFile>>(new Map());
  const [multiRestoring, setMultiRestoring] = useState(false);
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

  useFocusEffect(
    useCallback(() => {
      if (files.length === 0) return;
      let lastShake = 0;
      const sub = Accelerometer.addListener(({ x, y, z }) => {
        const acceleration = Math.sqrt(x * x + y * y + z * z);
        if (acceleration > 2.5) {
          const now = Date.now();
          if (now - lastShake > 1000) {
            lastShake = now;
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            handleEmptyTrash();
          }
        }
      });
      Accelerometer.setUpdateInterval(200);
      return () => sub.remove();
    }, [files.length])
  );

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
    const result = await restoreFile(file);
    setRestoring(false);
    if (result === 'original') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Restored', `"${file.name}" restored to its original location.`);
    } else if (result === 'downloads') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Restored to Downloads', `"${file.name}" could not be restored to its original location as the folder no longer exists. It has been moved to Downloads instead.`);
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
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            await deletePermanently(selectedFile);
          }
        },
      ]
    );
  }

  function handleEmptyTrash() {
    Alert.alert(
      'Empty Trash',
      files.length === 1
        ? `Permanently delete this file? This cannot be undone.`
        : `Permanently delete ${files.length} files? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Empty Trash', style: 'destructive', onPress: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          emptyTrash();
        }},
      ]
    );
  }

  async function handleMultiRestore() {
    const filesToRestore = Array.from(selectedFilesMap.values());
    setSelectMode(false);
    setSelectedUris(new Set());
    setSelectedFilesMap(new Map());
    setMultiRestoring(true);
    try {
      let downloadsCount = 0;
      for (const file of filesToRestore) {
        const result = await restoreFile(file, false);
        if (result === 'downloads') downloadsCount++;
      }
      await loadFiles();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (downloadsCount === 0) {
        Alert.alert('Restored', `${filesToRestore.length} file${filesToRestore.length !== 1 ? 's' : ''} restored to original location.`);
      } else if (downloadsCount === filesToRestore.length) {
        Alert.alert('Restored to Downloads', `${filesToRestore.length} file${filesToRestore.length !== 1 ? 's' : ''} restored to Downloads as original folder no longer exists.`);
      } else {
        Alert.alert('Restored', `${filesToRestore.length - downloadsCount} file${filesToRestore.length - downloadsCount !== 1 ? 's' : ''} restored to original location. ${downloadsCount} moved to Downloads as original folder no longer exists.`);
      }
    } finally {
      setMultiRestoring(false);
    }
  }

  const ext = (name: string) => name.split('.').pop()?.toUpperCase() ?? '?';

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.background }]}>
        <TouchableOpacity onPress={() => {
          if (selectMode) {
            setSelectMode(false);
            setSelectedUris(new Set());
            setSelectedFilesMap(new Map());
          } else {
            router.back();
          }
        }} style={styles.backBtn} disabled={multiRestoring}>
          <Ionicons name={selectMode ? 'close' : 'arrow-back'} size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          {selectMode ? `${selectedUris.size} selected` : 'Recently Deleted'}
        </Text>
        {selectMode ? (
          <TouchableOpacity onPress={() => {
            const newSet = new Set(files.map(f => f.uri));
            const newMap = new Map(files.map(f => [f.uri, f]));
            setSelectedUris(newSet);
            setSelectedFilesMap(newMap);
          }} style={styles.backBtn} disabled={multiRestoring}>
             <Text style={{ fontSize: 12, color: multiRestoring ? colors.textDisabled : colors.blue, fontWeight: '500' }}>All</Text>
          </TouchableOpacity>
        ) : files.length > 0 ? (
          <TouchableOpacity onPress={handleEmptyTrash} style={styles.backBtn} disabled={multiRestoring}>
            <Ionicons name="trash-outline" size={22} color={multiRestoring ? colors.textDisabled : colors.deleteRed} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      {(restoring || multiRestoring) && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: colors.surface }}>
          <ActivityIndicator size="small" color={colors.blue} />
          <Text style={{ fontSize: 13, color: colors.textSecondary }}>Restoring...</Text>
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
          const days = 30 - Math.floor((Date.now() - item.deletedAt) / 86400000);
          const expiryColor = days <= 7 ? colors.deleteRed : days <= 14 ? colors.yellow : colors.textMuted;
      return (
        <TouchableOpacity
          style={[styles.row, { borderBottomColor: colors.border, backgroundColor: selectedUris.has(item.uri) ? colors.blueTint : 'transparent' }]}
          onPress={() => {
            if (multiRestoring) return;
            if (selectMode) {
              const newSet = new Set(selectedUris);
              const newMap = new Map(selectedFilesMap);
              if (selectedUris.has(item.uri)) { newSet.delete(item.uri); newMap.delete(item.uri); }
              else { newSet.add(item.uri); newMap.set(item.uri, item); }
              setSelectedUris(newSet);
              setSelectedFilesMap(newMap);
            } else {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              openSheet(item);
            }
          }}
          onLongPress={() => {
            if (!selectMode) {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setSelectMode(true);
              setSelectedUris(new Set([item.uri]));
              setSelectedFilesMap(new Map([[item.uri, item]]));
            }
          }}
          activeOpacity={0.7}
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
            <Text style={[styles.fileMeta, { color: expiryColor }]}>
              {formatSize(item.size)} · {formatDaysLeft(item.deletedAt)}
            </Text>
          </View>
          {!selectMode && (
            <TouchableOpacity onPress={() => openSheet(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="chevron-forward" size={16} color={colors.textDisabled} />
            </TouchableOpacity>
          )}
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
                      <Ionicons name={getFileIcon(selectedFile?.name ?? '') as any} size={22} color={getFileColor(selectedFile?.name ?? '')} />
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
      {selectMode && selectedUris.size > 0 && (
        <View style={{ flexDirection: 'row', padding: 12, gap: 8, borderTopWidth: 0.5, borderTopColor: colors.border, backgroundColor: colors.background, paddingBottom: insets.bottom + 12 }}>
          <TouchableOpacity
            onPress={handleMultiRestore}
            disabled={multiRestoring}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.blue, borderRadius: 12, paddingVertical: 14 }}
          >
            <Ionicons name="arrow-undo-outline" size={20} color="#fff" />
            <Text style={{ fontSize: 11, color: '#fff', marginTop: 2 }}>Restore</Text>
          </TouchableOpacity>
        </View>
      )}
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
