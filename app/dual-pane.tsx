import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import FilePane, { FilePaneHandle, FileItem } from '@/components/FilePane';
import { copyFileStream, moveFileStream, copyFolderRecursive, moveFolderRecursive, addCopyProgressListener } from 'file-reader';
import { toPath } from '@/utils/files';
import { scanFile } from '@/modules/share-module';
import { syncPathReferences } from '@/hooks/usePathSync';
import * as Haptics from 'expo-haptics';
import * as ScreenOrientation from 'expo-screen-orientation';

export default function DualPaneScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [leftInSelectMode, setLeftInSelectMode] = useState(false);
  const [rightInSelectMode, setRightInSelectMode] = useState(false);

  // Active pane tracking — 'left' or 'right'
  const [activePane, setActivePane] = useState<'left' | 'right'>('left');

  // Each pane's selection state lives here, keyed by pane
  const [leftSelected, setLeftSelected] = useState<Set<string>>(new Set());
  const [rightSelected, setRightSelected] = useState<Set<string>>(new Set());
  const leftSelectedMap = useRef<Map<string, FileItem>>(new Map());
  const rightSelectedMap = useRef<Map<string, FileItem>>(new Map());

  // Refs to imperatively call reload on each pane
  const leftRef = useRef<FilePaneHandle>(null);
  const rightRef = useRef<FilePaneHandle>(null);

  // Operation state
  const [operating, setOperating] = useState(false);
  const [operationLabel, setOperationLabel] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const [currentFile, setCurrentFile] = useState<string | null>(null);
  const [filesProgress, setFilesProgress] = useState<{ done: number; total: number } | null>(null);
  const [, forceUpdate] = useState(0);

  // Which pane has selection — derived
  const hasLeftSelection = leftSelected.size > 0;
  const hasRightSelection = rightSelected.size > 0;
  const hasSelection = hasLeftSelection || hasRightSelection;

  // Source and destination for cross-pane operations
  const sourceFiles = hasLeftSelection
    ? Array.from(leftSelectedMap.current.values())
    : Array.from(rightSelectedMap.current.values());

  const destPaneRef = hasLeftSelection ? rightRef : leftRef;
  const sourcePaneRef = hasLeftSelection ? leftRef : rightRef;

  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    return () => { ScreenOrientation.unlockAsync(); };
  }, []);

  function clearSelection() {
    setLeftSelected(new Set());
    setRightSelected(new Set());
    leftSelectedMap.current = new Map();
    rightSelectedMap.current = new Map();
  }

  async function handleCopy() {
    const liveDestPath = hasLeftSelection
  ? rightRef.current?.currentPath ?? ''
  : leftRef.current?.currentPath ?? '';
    if (!sourceFiles.length || !liveDestPath) return;
    const dest = liveDestPath.endsWith('/') ? liveDestPath : liveDestPath + '/';

    setOperating(true);
    setOperationLabel(`Copying ${sourceFiles.length} item${sourceFiles.length !== 1 ? 's' : ''}...`);
    setProgress(0);

    const sub = addCopyProgressListener(({ percent, currentFile: cf, filesCopied: fc, totalFiles: tf }) => {
      setProgress(percent);
      if (cf) setCurrentFile(cf);
      if (fc !== undefined && tf !== undefined) setFilesProgress({ done: fc, total: tf });
    });
    try {
      for (const file of sourceFiles) {
        const dst = toPath(dest + file.name);
        if (file.isDirectory) {
          await copyFolderRecursive(toPath(file.uri), dst);
        } else {
          await copyFileStream(toPath(file.uri), dst);
        }
        await scanFile(dst).catch(() => {});
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      clearSelection();
      destPaneRef.current?.invalidateCache();
      destPaneRef.current?.reload();
    } catch {
      Alert.alert('Error', 'Could not copy files.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      sub.remove();
      setOperating(false);
      setOperationLabel('');
      setProgress(null);
      setCurrentFile(null);
      setFilesProgress(null);
    }
  }

  async function handleMove() {
    const liveDestPath = hasLeftSelection
  ? rightRef.current?.currentPath ?? ''
  : leftRef.current?.currentPath ?? '';
    const dest = liveDestPath.endsWith('/') ? liveDestPath : liveDestPath + '/';

    Alert.alert(
      'Move files',
      `Move ${sourceFiles.length} item${sourceFiles.length !== 1 ? 's' : ''} to ${(hasLeftSelection ? rightRef.current?.friendlyPath : leftRef.current?.friendlyPath) ?? 'Internal Storage'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Move',
          onPress: async () => {
            setOperating(true);
            setOperationLabel(`Moving ${sourceFiles.length} item${sourceFiles.length !== 1 ? 's' : ''}...`);
            setProgress(0);
            const sub = addCopyProgressListener(({ percent, currentFile: cf, filesCopied: fc, totalFiles: tf }) => {
              setProgress(percent);
              if (cf) setCurrentFile(cf);
              if (fc !== undefined && tf !== undefined) setFilesProgress({ done: fc, total: tf });
            });
            try {
              for (const file of sourceFiles) {
                const src = toPath(file.uri);
                const destUri = dest + file.name;
                const dst = toPath(destUri);
                if (file.isDirectory) {
                  await moveFolderRecursive(src, dst);
                } else {
                  await moveFileStream(src, dst);
                  await syncPathReferences(file.uri, destUri, file.name);
                }
                await scanFile(dst).catch(() => {});
              }
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              clearSelection();
              sourcePaneRef.current?.invalidateCache();
              destPaneRef.current?.invalidateCache();
              sourcePaneRef.current?.reload();
              destPaneRef.current?.reload();
            } catch {
              Alert.alert('Error', 'Could not move files.');
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            } finally {
              sub.remove();
              setOperating(false);
              setOperationLabel('');
              setProgress(null);
              setCurrentFile(null);
              setFilesProgress(null);
            }
          },
        },
      ]
    );
  }

  return (
    <SafeAreaView edges={['left', 'right']} style={[styles.container, { backgroundColor: colors.background }]}>

      {/* Top bar */}
      <View style={[styles.topBar, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Dual Pane</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Operation progress banner */}
      {operating && (
        <View style={[styles.progressBanner, { backgroundColor: colors.surface }]}>
          <ActivityIndicator size="small" color={colors.blue} />
          <Text style={[styles.progressText, { color: colors.textSecondary }]} numberOfLines={1}>
            {operationLabel}
            {filesProgress ? ` (${filesProgress.done}/${filesProgress.total})` : ''}
            {currentFile ? ` · ${currentFile}` : ''}
            {progress !== null && progress > 0 && !currentFile ? ` ${progress}%` : ''}
          </Text>
        </View>
      )}

      {/* Panes */}
      <View style={[styles.panesRow, { gap: 6, paddingHorizontal: 6, paddingTop: 6 }]}>
      <FilePane
          ref={leftRef}
          isActive={activePane === 'left'}
          selectedUris={leftSelected}
          otherPaneHasSelection={hasRightSelection}
          otherPaneInSelectMode={rightInSelectMode}
          onSelectModeChange={setLeftInSelectMode}
          onSelectionChange={(uris, map) => {
            setLeftSelected(uris);
            leftSelectedMap.current = map;
            // Clear right selection when left selects
            if (uris.size > 0) {
              setRightSelected(new Set());
              rightSelectedMap.current = new Map();
            }
          }}
          onPathChange={() => forceUpdate(n => n + 1)}
          onActivate={() => setActivePane('left')}
          onLongPress={() => setActivePane('left')}
        />
        <FilePane
          ref={rightRef}
          isActive={activePane === 'right'}
          selectedUris={rightSelected}
          otherPaneHasSelection={hasLeftSelection}
          otherPaneInSelectMode={leftInSelectMode}
          onSelectModeChange={setRightInSelectMode}
          onSelectionChange={(uris, map) => {
            setRightSelected(uris);
            rightSelectedMap.current = map;
            // Clear left selection when right selects
            if (uris.size > 0) {
              setLeftSelected(new Set());
              leftSelectedMap.current = new Map();
            }
          }}
          onPathChange={() => forceUpdate(n => n + 1)}
          onActivate={() => setActivePane('right')}
          onLongPress={() => setActivePane('right')}
        />
      </View>

      {/* Cross-pane toolbar — only when selection exists */}
      {hasSelection && (
        <View style={[
          styles.toolbar,
          {
            backgroundColor: colors.background,
            borderTopColor: colors.border,
            paddingBottom: insets.bottom + 8,
          }
        ]}>
          <Text style={[styles.selectionLabel, { color: colors.textMuted }]}>
          {sourceFiles.length} item{sourceFiles.length !== 1 ? 's' : ''} selected
            {' → '}
            {(hasLeftSelection ? rightRef.current?.friendlyPath : leftRef.current?.friendlyPath) ?? 'Internal Storage'}
          </Text>
          <View style={styles.toolbarActions}>
            <TouchableOpacity
              onPress={clearSelection}
              style={[styles.toolbarBtn, { backgroundColor: colors.surface }]}
              disabled={operating}
            >
              <Ionicons name="close-outline" size={18} color={colors.textSecondary} />
              <Text style={[styles.toolbarBtnText, { color: colors.textSecondary }]}>Deselect</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleCopy}
              style={[styles.toolbarBtn, { backgroundColor: colors.surface }]}
              disabled={operating}
            >
              <Ionicons name="copy-outline" size={18} color={colors.blue} />
              <Text style={[styles.toolbarBtnText, { color: colors.blue }]}>Copy here</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleMove}
              style={[styles.toolbarBtn, { backgroundColor: colors.blue }]}
              disabled={operating}
            >
              <Ionicons name="arrow-forward-outline" size={18} color="#fff" />
              <Text style={[styles.toolbarBtnText, { color: '#fff' }]}>Move here</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    borderBottomWidth: 0.5,
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: '500',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  progressBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  progressText: {
    fontSize: 13,
  },
  panesRow: {
    flex: 1,
    flexDirection: 'row',
  },
  toolbar: {
    borderTopWidth: 0.5,
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  selectionLabel: {
    fontSize: 11,
    marginBottom: 8,
    textAlign: 'center',
  },
  toolbarActions: {
    flexDirection: 'row',
    gap: 8,
  },
  toolbarBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
  },
  toolbarBtnText: {
    fontSize: 13,
    fontWeight: '500',
  },
});
