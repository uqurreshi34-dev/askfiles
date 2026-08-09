import React, { useState, useEffect, useRef, useImperativeHandle, forwardRef, memo } from 'react';
import {
  View, Text, TouchableOpacity, FlatList, Image,
  ActivityIndicator, StyleSheet, TextInput,
  Alert, RefreshControl
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { isImageFile, getFileColor, getFileIcon, formatSize, formatDate, toPath, ROOT_PATH } from '@/utils/files';
import { isVideoFile, VideoThumb } from '@/utils/videoThumb';
import { readDirectory, countFolder, createDirectory, getShowHidden } from 'file-reader';
import { startWatching, stopWatching, addFileChangeListener } from '@/modules/file-watcher';
import { getStorageVolumes } from '@/modules/storage-stats';
import * as Haptics from 'expo-haptics';

export interface FileItem {
  name: string;
  uri: string;
  isDirectory: boolean;
  size: number;
  date: number;
}

export interface FilePaneHandle {
  currentPath: string;
  friendlyPath: string;
  reload: () => void;
  invalidateCache: (path?: string) => void;
}

interface FilePaneProps {
    initialPath?: string;
    isActive: boolean;
    selectedUris: Set<string>;
    onSelectionChange: (uris: Set<string>, items: Map<string, FileItem>) => void;
    onActivate: () => void;
    onLongPress: (item: FileItem) => void;
    otherPaneHasSelection: boolean;
    otherPaneInSelectMode: boolean;
    onSelectModeChange: (active: boolean) => void;
    onPathChange?: (path: string) => void;
  }

const dirCache: Record<string, FileItem[]> = {};
const nameCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function sortItems(items: FileItem[]): FileItem[] {
  return items.slice().sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;
    return nameCollator.compare(a.name, b.name);
  });
}

interface PaneRowProps {
  item: FileItem;
  isSelected: boolean;
  selectMode: boolean;
  folderCount: number | undefined;
  colors: any;
  onPress: () => void;
  onLongPress: () => void;
}

const PaneRow = memo(({ item, isSelected, selectMode, folderCount, colors, onPress, onLongPress }: PaneRowProps) => {
  const color = item.isDirectory ? colors.yellow : getFileColor(item.name);
  return (
    <TouchableOpacity
      style={[
        styles.row,
        { borderBottomColor: colors.border },
        isSelected && { backgroundColor: colors.blueTint },
      ]}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.7}
    >
      {selectMode && (
        <View style={{ marginRight: 8 }}>
          <Ionicons
            name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
            size={18}
            color={isSelected ? colors.blue : colors.textMuted}
          />
        </View>
      )}
      <View style={[styles.icon, { backgroundColor: color + '22', overflow: 'hidden' }]}>
        {item.isDirectory ? (
          <Ionicons name="folder" size={18} color={color} />
        ) : isImageFile(item.name) ? (
          <Image source={{ uri: item.uri }} style={styles.thumb} resizeMode="cover" />
        ) : isVideoFile(item.name) ? (
          <VideoThumb uri={item.uri} style={styles.thumb} />
        ) : (
          <Ionicons name={getFileIcon(item.name) as any} size={16} color={color} />
        )}
      </View>
      <View style={styles.info}>
        <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={[styles.meta, { color: colors.textMuted }]}>
          {item.isDirectory
            ? folderCount === undefined ? 'Folder'
              : folderCount === 0 ? 'Empty'
              : `${folderCount} item${folderCount !== 1 ? 's' : ''}`
            : `${formatSize(item.size)} · ${formatDate(item.date)}`}
        </Text>
      </View>
      {item.isDirectory && !selectMode && (
        <Ionicons name="chevron-forward" size={14} color={colors.textDisabled} />
      )}
    </TouchableOpacity>
  );
});

const FilePane = forwardRef<FilePaneHandle, FilePaneProps>(({
    initialPath,
    isActive,
    selectedUris,
    onSelectionChange,
    onActivate,
    onLongPress,
    otherPaneHasSelection,
    otherPaneInSelectMode,
    onSelectModeChange,
    onPathChange,
  }, ref) => {
  const { colors } = useTheme();
  const startPath = initialPath ?? ROOT_PATH;
  const [currentPath, setCurrentPath] = useState(startPath);
  const [breadcrumbs, setBreadcrumbs] = useState<{ name: string; path: string }[]>([
    { name: 'Storage', path: ROOT_PATH },
  ]);
  const [items, setItems] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [folderCounts, setFolderCounts] = useState<Record<string, number>>({});
  const [volumes, setVolumes] = useState<{ name: string; path: string; type: string }[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectMode, setSelectMode] = useState(false);
  const selectedItemsMap = useRef<Map<string, FileItem>>(new Map());
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (selectedUris.size === 0) {
      selectedItemsMap.current = new Map();
    }
  }, [selectedUris.size]);

  useImperativeHandle(ref, () => ({
    currentPath,
    friendlyPath: (() => {
      const sdVol = volumes.find(v => v.type === 'sdcard' && currentPath.includes(v.path));
      if (sdVol) return currentPath.replace(`file://${sdVol.path}/`, `${sdVol.name}/`).replace(/\/$/, '');
      return currentPath.replace('file:///storage/emulated/0/', '').replace(/\/$/, '') || 'Internal Storage';
    })(),
    reload: () => loadDirectory(currentPath),
    invalidateCache: (path?: string) => {
      const target = path ?? currentPath;
      delete dirCache[target];
    },
  }), [currentPath, volumes]);

  useEffect(() => {
    getStorageVolumes().then(setVolumes);
  }, []);

  useEffect(() => {
    loadDirectory(currentPath);
  }, [currentPath]);

  useEffect(() => {
    const path = toPath(currentPath);
    startWatching(path);
    const sub = addFileChangeListener(({ path: changedPath }: { path: string }) => {
      if (changedPath === path) {
        delete dirCache[currentPath];
        loadDirectory(currentPath);
      }
    });
    return () => {
      stopWatching(path);
      sub.remove();
    };
  }, [currentPath]);

  useEffect(() => {
    onPathChange?.(currentPath);
  }, [currentPath]);

  async function loadDirectory(path: string) {
    if (dirCache[path]) {
      setItems(dirCache[path]);
      setLoading(false);
      readDirectory(toPath(path), getShowHidden()).then(raw => {
        const fileItems = sortItems(raw);
        dirCache[path] = fileItems;
        setItems(fileItems);
        loadFolderCounts(fileItems);
      }).catch(() => {});
      return;
    }
    setLoading(true);
    try {
      const raw = await readDirectory(toPath(path), getShowHidden());
      const fileItems = sortItems(raw);
      dirCache[path] = fileItems;
      setItems(fileItems);
      loadFolderCounts(fileItems);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  const loadGen = useRef(0);

  function loadFolderCounts(fileItems: FileItem[]) {
    const gen = ++loadGen.current;
    const folders = fileItems.filter(f => f.isDirectory && !toPath(f.uri).includes('/Android/data'));
    const BATCH = 8;
    for (let w = 0; w * BATCH < folders.length; w++) {
      const wave = folders.slice(w * BATCH, (w + 1) * BATCH);
      setTimeout(async () => {
        if (gen !== loadGen.current) return;   // navigated away — abandon
        const results = await Promise.all(
          wave.map(f =>
            countFolder(toPath(f.uri), getShowHidden())
              .then(c => [f.uri, c] as const)
              .catch(() => null)
          )
        );
        if (gen !== loadGen.current) return;
        const valid = results.filter(Boolean) as (readonly [string, number])[];
        if (!valid.length) return;
        setFolderCounts(prev => {
          const next = { ...prev };
          valid.forEach(([uri, c]) => { next[uri] = c; });
          return next;
        });
      }, w * 50);
    }
  }

  function navigateTo(item: FileItem) {
    if (!item.isDirectory) return;
    onActivate();
    setCurrentPath(item.uri);
    setBreadcrumbs(prev => [...prev, { name: item.name, path: item.uri }]);
    setSearchQuery('');
  }

  function navigateToBreadcrumb(index: number) {
    const crumb = breadcrumbs[index];
    setBreadcrumbs(prev => prev.slice(0, index + 1));
    setCurrentPath(crumb.path);
    setSearchQuery('');
  }

  function navigateUp() {
    if (breadcrumbs.length > 1) {
      navigateToBreadcrumb(breadcrumbs.length - 2);
    }
  }

  async function handleCreateFolder() {
  const name = newFolderName.trim();
  if (!name) return;
  const invalidChars = /[*\\:?"<>|]/;
  if (invalidChars.test(name)) {
    Alert.alert('Invalid name', 'Folder names cannot contain: * \\ : ? " < > |');
    return;
  }
  setCreatingFolder(true);
  try {
    const path = toPath(currentPath) + name;
    await createDirectory(path);
    setShowNewFolder(false);
    setNewFolderName('');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    delete dirCache[currentPath];
    await loadDirectory(currentPath);
  } catch (e: any) {
    if (e?.message?.includes('EXISTS')) {
      Alert.alert('Already exists', `A folder named "${name}" already exists here.`);
    } else {
      Alert.alert('Error', 'Could not create folder.');
    }
  } finally {
    setCreatingFolder(false);
  }
}

  function toggleSelect(item: FileItem) {
    const newSet = new Set(selectedUris);
    const newMap = new Map(selectedItemsMap.current);
    if (newSet.has(item.uri)) {
      newSet.delete(item.uri);
      newMap.delete(item.uri);
    } else {
      newSet.add(item.uri);
      newMap.set(item.uri, item);
    }
    selectedItemsMap.current = newMap;
    onSelectionChange(newSet, newMap);
    if (newSet.size === 0) {
        setSelectMode(false);
        onSelectModeChange(false);
      }
  }

  const displayItems = searchQuery.trim()
    ? items.filter(i => i.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : items;

  // Volume root check for showing volume pills
  const isVolumeRoot = currentPath === ROOT_PATH || volumes.some(v => currentPath === `file://${v.path}/`);

  return (
    <View style={[
      styles.pane,
      { backgroundColor: colors.background, borderColor: isActive ? colors.blue : colors.border }
    ]}>

    {/* Header */}
    <View style={[styles.header, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
      <TouchableOpacity
        onPress={navigateUp}
        disabled={breadcrumbs.length <= 1}
        style={styles.upBtn}
      >
        <Ionicons
          name="arrow-up"
          size={18}
          color={breadcrumbs.length > 1 ? colors.blue : colors.textDisabled}
        />
      </TouchableOpacity>

      {/* Inline new folder input or breadcrumb */}
      {showNewFolder ? (
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <TextInput
            style={[styles.folderInput, { backgroundColor: colors.surface, color: colors.textPrimary }]}
            value={newFolderName}
            onChangeText={setNewFolderName}
            placeholder="Folder name..."
            placeholderTextColor={colors.textMuted}
            autoFocus
            autoCapitalize="none"
            returnKeyType="done"
            onSubmitEditing={handleCreateFolder}
          />
          <TouchableOpacity onPress={handleCreateFolder} disabled={creatingFolder || !newFolderName.trim()}>
            {creatingFolder
              ? <ActivityIndicator size="small" color={colors.blue} />
              : <Ionicons name="checkmark-circle" size={20} color={newFolderName.trim() ? colors.blue : colors.textDisabled} />
            }
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { setShowNewFolder(false); setNewFolderName(''); }}>
            <Ionicons name="close-circle" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={{ flex: 1 }} onPress={onActivate} activeOpacity={0.7}>
          {selectMode && selectedUris.size > 0 ? (
            <Text style={[styles.breadcrumb, { color: colors.blue }]} numberOfLines={1}>
              {selectedUris.size} item{selectedUris.size !== 1 ? 's' : ''} selected
            </Text>
          ) : (
            <Text style={[styles.breadcrumb, { color: colors.textSecondary }]} numberOfLines={1}>
              {breadcrumbs.slice(-2).map((c, i) => (i > 0 ? '/' : '') + c.name).join('')}
            </Text>
          )}
        </TouchableOpacity>
      )}

      {/* + FAB — only in select mode */}
      {selectMode && !showNewFolder && (
        <TouchableOpacity
          onPress={() => { setShowNewFolder(true); setNewFolderName(''); }}
          style={styles.upBtn}
        >
          <Ionicons name="add-circle-outline" size={20} color={colors.green} />
        </TouchableOpacity>
      )}

      {/* Select All — only in select mode */}
      {selectMode && !showNewFolder && (
        <TouchableOpacity
          onPress={() => {
            const allFiles = displayItems;
            const newSet = new Set(allFiles.map(i => i.uri));
            const newMap = new Map(allFiles.map(i => [i.uri, i]));
            selectedItemsMap.current = newMap;
            onSelectionChange(newSet, newMap);
          }}
          style={styles.upBtn}
        >
          <Text style={{ fontSize: 10, fontWeight: '600', color: colors.blue }}>All</Text>
        </TouchableOpacity>
      )}

      {/* Select toggle */}
      <TouchableOpacity
        onPress={() => {
          if (otherPaneHasSelection || otherPaneInSelectMode) return;
          onActivate();
          if (selectMode) {
            setSelectMode(false);
            setShowNewFolder(false);
            setNewFolderName('');
            selectedItemsMap.current = new Map();
            onSelectionChange(new Set(), new Map());
            onSelectModeChange(false);
          } else {
            setSelectMode(true);
            onSelectModeChange(true);
          }
        }}
        style={[styles.upBtn, (otherPaneHasSelection || otherPaneInSelectMode) && { opacity: 0.3 }]}
        disabled={otherPaneHasSelection || otherPaneInSelectMode}
      >
        <Ionicons
          name={selectMode ? 'close-circle' : 'checkmark-circle-outline'}
          size={18}
          color={selectMode ? colors.blue : colors.textSecondary}
        />
      </TouchableOpacity>
    </View>

      {/* Volume pills — only at root */}
      {volumes.length > 1 && isVolumeRoot && (
        <View style={{ flexDirection: 'row', paddingHorizontal: 8, paddingBottom: 6, gap: 6 }}>
          {volumes.map(vol => {
            const active = currentPath.includes(vol.path);
            return (
              <TouchableOpacity
                key={vol.path}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 4,
                  paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16,
                  backgroundColor: active ? colors.blue : colors.surface,
                }}
                onPress={() => {
                  onActivate();
                  const newPath = `file://${vol.path}/`;
                  setCurrentPath(newPath);
                  setBreadcrumbs([{ name: vol.name, path: newPath }]);
                }}
              >
                <Ionicons
                  name={vol.type === 'sdcard' ? 'card-outline' : 'phone-portrait-outline'}
                  size={12}
                  color={active ? '#fff' : colors.textSecondary}
                />
                <Text style={{ fontSize: 11, fontWeight: '500', color: active ? '#fff' : colors.textSecondary }}>
                  {vol.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Search */}
      <View style={[styles.searchWrap, { backgroundColor: colors.surface }]}>
        <Ionicons name="search-outline" size={13} color={colors.textMuted} style={{ marginRight: 6 }} />
        <TextInput
          style={[styles.searchInput, { color: colors.textPrimary }]}
          placeholder="Filter..."
          placeholderTextColor={colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          onFocus={onActivate}
          autoCorrect={false}
          autoCapitalize="none"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={13} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* File list */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.blue} size="small" />
        </View>
      ) : displayItems.length === 0 ? (
        <View style={styles.centered}>
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>
            {searchQuery ? 'No matches' : 'Empty folder'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={displayItems}
          keyExtractor={item => item.uri}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 8 }}
          removeClippedSubviews={true}
          maxToRenderPerBatch={20}
          windowSize={10}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                delete dirCache[currentPath];
                await loadDirectory(currentPath);
                setRefreshing(false);
              }}
              colors={[colors.blue]}
              tintColor={colors.blue}
            />
          }
          renderItem={({ item }) => (
            <PaneRow
              item={item}
              isSelected={selectedUris.has(item.uri)}
              selectMode={selectMode}
              folderCount={folderCounts[item.uri]}
              colors={colors}
              onPress={() => {
                onActivate();
                if (selectMode && !otherPaneHasSelection) {
                  toggleSelect(item);
                } else {
                  navigateTo(item);
                }
              }}
              onLongPress={() => {
                if (otherPaneHasSelection || otherPaneInSelectMode) return;
                onActivate();
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                if (!selectMode) setSelectMode(true);
                toggleSelect(item);
                onLongPress(item);
              }}
            />
          )}
        />
      )}
    </View>
  );
});

export default FilePane;

const styles = StyleSheet.create({
  pane: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 12,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderBottomWidth: 0.5,
    gap: 6,
  },
  upBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  breadcrumb: {
    fontSize: 12,
    fontWeight: '500',
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 8,
    marginVertical: 6,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 12,
    padding: 0,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderBottomWidth: 0.5,
  },
  icon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  thumb: {
    width: 32,
    height: 32,
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 1,
  },
  meta: {
    fontSize: 10,
  },
  folderInput: {
  flex: 1,
  fontSize: 11,
  borderRadius: 6,
  paddingHorizontal: 8,
  paddingVertical: 4,
},
});
