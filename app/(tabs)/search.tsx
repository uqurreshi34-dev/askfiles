import { useState, useRef } from 'react';
import {
  StyleSheet, Text, View, TextInput, TouchableOpacity,
  FlatList, ActivityIndicator, Image, Keyboard, ScrollView,
  Modal, Animated, PanResponder, Platform, Pressable, KeyboardAvoidingView, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSearch } from '@/hooks/useSearch';
import { useAskAI } from '@/hooks/useAskAI';
import { isImageFile, getMimeType } from '@/utils/files';
import { addRecent } from '@/hooks/useRecents';
import * as Sharing from 'expo-sharing';
import { useStorage } from '@/hooks/useStorage';
import { usePro } from '@/hooks/usePro';
import { useAiQueryLimit } from '@/hooks/useAiQueryLimit';
import { useVault } from '@/hooks/useVault';
import { addFavourite, removeFavourite, isFavourite } from '@/hooks/useFavourites';
import * as FileSystem from 'expo-file-system/next';
import * as MediaLibrary from 'expo-media-library';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

type Mode = 'search' | 'ask';

const SUGGESTIONS = [
  'What images do I have?',
  'Find my downloaded files',
  'What videos are on my phone?',
  "What's taking up the most space?",
  'How much storage do I have left?',
  'Should I free up some space?',
];

function getFileColor(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic'].includes(ext ?? '')) return '#185FA5';
  if (['mp4', 'mkv', 'avi', 'mov', 'webm'].includes(ext ?? '')) return '#993C1D';
  if (['pdf', 'doc', 'docx', 'txt', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext ?? '')) return '#534AB7';
  if (['mp3', 'wav', 'aac', 'flac', 'm4a'].includes(ext ?? '')) return '#854F0B';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext ?? '')) return '#3B6D11';
  return '#5F5E5A';
}

function formatBytes(bytes: number): string {
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + ' GB';
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
  return (bytes / 1024).toFixed(1) + ' KB';
}

function buildContext(
  storageInfo: any,
  fileCounts: any,
  folderSizes: any,
  mediaContext: any,
): string {
  const imageNames = mediaContext.recentImages.join(', ') || 'none';
  const videoNames = mediaContext.recentVideos.join(', ') || 'none';
  const freeSpace = storageInfo?.freeBytes ? formatBytes(storageInfo.freeBytes) : 'unknown';

  // Pre-count by extension so AI doesn't have to count manually
  const imageCounts: Record<string, number> = {};
  for (const name of mediaContext.recentImages) {
    const ext = name.split('.').pop()?.toLowerCase() ?? 'unknown';
    imageCounts[ext] = (imageCounts[ext] ?? 0) + 1;
  }
  const imageBreakdown = Object.entries(imageCounts)
    .map(([ext, count]) => `${count} ${ext}`)
    .join(', ');

  const videoCounts: Record<string, number> = {};
  for (const name of mediaContext.recentVideos) {
    const ext = name.split('.').pop()?.toLowerCase() ?? 'unknown';
    videoCounts[ext] = (videoCounts[ext] ?? 0) + 1;
  }
  const videoBreakdown = Object.entries(videoCounts)
    .map(([ext, count]) => `${count} ${ext}`)
    .join(', ');

  return `
Device storage: ${storageInfo?.usedReadable} used of ${storageInfo?.totalReadable} total. ${freeSpace} free.
File counts: ${fileCounts.images} images (${imageBreakdown}), ${fileCounts.videos} videos (${videoBreakdown}), ${fileCounts.documents} documents, ${fileCounts.downloads} downloads.
Screenshots: exactly ${mediaContext.screenshotCount} files (do not count manually, use this number).
Folder sizes: DCIM/Camera ${folderSizes.dcim}, Pictures ${folderSizes.pictures}, Videos total ${folderSizes.videos}, Downloads ${folderSizes.downloads}, Documents ${folderSizes.documents}, Music ${folderSizes.music}.
All image filenames sorted newest first: ${imageNames}.
All video filenames sorted newest first: ${videoNames}.
Note: PNG files are image files. Files with 1970 date have corrupted/missing timestamps from WhatsApp. Do not recount files from the filename list — always use the exact counts provided above.
  `.trim();
}

export default function SearchScreen() {
  const [mode, setMode] = useState<Mode>('search');
  const [query, setQuery] = useState('');
  const [aiQuery, setAiQuery] = useState('');
  const { results, searching, search, removeResult } = useSearch();
  const { answer, thinking, ask, reset } = useAskAI();
  const router = useRouter();
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { fileCounts, storageInfo, folderSizes, mediaContext } = useStorage();
  const { isPro } = usePro();
  const { queriesRemaining, isLimitReached, incrementQuery } = useAiQueryLimit(isPro);
  const { addToVault } = useVault();
  const insets = useSafeAreaInsets();

  // Sheet state
  const [selectedItem, setSelectedItem] = useState<{ name: string; uri: string; inFolder?: boolean } | null>(null);
  const [showSheet, setShowSheet] = useState(false);
  const [fileSize, setFileSize] = useState<string | null>(null);
  const [isFav, setIsFav] = useState(false);
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

  async function openSheet(item: { name: string; uri: string; inFolder?: boolean }) {
    setSelectedItem(item);
    setFileSize(null);
    setShowSheet(true);
    setIsFav(await isFavourite(item.uri));
    Animated.spring(sheetAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }).start();
    try {
      const file = new FileSystem.File(item.uri);
      setFileSize(formatBytes(file.size ?? 0));
    } catch { setFileSize('Unknown'); }
  }

  function closeSheet() {
    Animated.timing(sheetAnim, { toValue: 400, duration: 200, useNativeDriver: true }).start(() => {
      setShowSheet(false); setSelectedItem(null);
    });
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
    } catch (e) { console.log('Share error:', e); }
  }

  async function handleToggleFavourite() {
    if (!selectedItem) return;
    if (isFav) {
      await removeFavourite(selectedItem.uri);
      setIsFav(false);
      Alert.alert('Removed', `"${selectedItem.name}" removed from Favourites.`);
    } else {
      await addFavourite({ name: selectedItem.name, uri: selectedItem.uri });
      setIsFav(true);
      Alert.alert('Added', `"${selectedItem.name}" added to Favourites.`);
    }
  }

  async function handleMoveToVault() {
    if (!selectedItem) return;
    Alert.alert('Move to Vault', `Move "${selectedItem.name}" to your Secure Vault?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Move to Vault', onPress: async () => {
        closeSheet();
        const ok = await addToVault(selectedItem.uri, selectedItem.name);
        if (ok) {
          if (selectedItem.inFolder) { removeFolderItem(selectedItem.uri); }
          else { removeResult(selectedItem.uri); }
        }
        else Alert.alert('Error', 'Could not move file to Vault. Try again.');
      }},
    ]);
  }

  async function handleDelete() {
    if (!selectedItem) return;
    Alert.alert('Delete', `Delete "${selectedItem.name}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          const assets = await MediaLibrary.getAssetsAsync({ first: 1000 });
          const match = assets.assets.find(a => selectedItem.uri.includes(a.filename));
          if (match) { await MediaLibrary.deleteAssetsAsync([match]); }
          else { const file = new FileSystem.File(selectedItem.uri); file.delete(); }
          if (selectedItem.inFolder) { removeFolderItem(selectedItem.uri); }
          else { removeResult(selectedItem.uri); }
          closeSheet();
        } catch (e) { console.log('Delete error:', e); }
      }},
    ]);
  }

  // Folder drill-down
  const [folderStack, setFolderStack] = useState<{ name: string; uri: string; items: { name: string; uri: string; isDirectory: boolean }[] }[]>([]);
  const [folderLoading, setFolderLoading] = useState(false);

  async function openFolder(item: { name: string; uri: string }) {
    setFolderLoading(true);
    try {
      const dir = new FileSystem.Directory(item.uri);
      const contents = dir.list();
      const items = contents
        .map(f => ({
          name: f instanceof FileSystem.File ? f.name : f.uri.split('/').filter(Boolean).pop() ?? '',
          uri: f.uri,
          isDirectory: f instanceof FileSystem.Directory,
        }))
        .filter(f => !f.name.startsWith('.'))
        .sort((a, b) => {
          if (a.isDirectory && !b.isDirectory) return -1;
          if (!a.isDirectory && b.isDirectory) return 1;
          return a.name.localeCompare(b.name);
        });
      setFolderStack(prev => [...prev, { name: item.name, uri: item.uri, items }]);
    } catch (e) { console.log('Folder open error:', e); }
    finally { setFolderLoading(false); }
  }

  function popFolder() {
    setFolderStack(prev => prev.slice(0, -1));
  }

  function removeFolderItem(uri: string) {
    setFolderStack(prev => prev.map((f, i) =>
      i === prev.length - 1 ? { ...f, items: f.items.filter(item => item.uri !== uri) } : f
    ));
  }

  function handleSearchChange(text: string) {
    setQuery(text);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => search(text), 300);
  }

  async function handleAsk(question?: string) {
    const q = question ?? aiQuery;
    if (q.trim().length < 3) return;
    if (isLimitReached) return;
    Keyboard.dismiss();
    await incrementQuery();
    const context = buildContext(storageInfo, fileCounts, folderSizes, mediaContext);
    await ask(q, context);
  }

  async function openFile(name: string, uri: string) {
    await addRecent({ name, uri, openedAt: Date.now() });
    if (isImageFile(name)) {
      router.push({ pathname: '/viewer', params: { uri, name } });
      return;
    }
    try {
      await Sharing.shareAsync(uri, {
        mimeType: getMimeType(name),
        dialogTitle: name,
      });
    } catch (e) {
      console.log('Cannot open file:', e);
    }
  }

  function handleSuggestion(s: string) {
    if (isLimitReached) return;
    setAiQuery(s);
    handleAsk(s);
  }

  function handleAskAgain() {
    setAiQuery('');
    reset();
  }

  return (
    <SafeAreaView style={styles.container}>

      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <TouchableOpacity onPress={() => router.push('/(tabs)')} style={{ width: 40, height: 40, justifyContent: 'center' }}>
            <Ionicons name="home-outline" size={22} color="#111" />
          </TouchableOpacity>
          <Text style={styles.title}>Search</Text>
          <View style={{ width: 40 }} />
        </View>
      </View>

      <View style={styles.modeToggle}>
        <TouchableOpacity
          style={[styles.modeBtn, mode === 'search' && styles.modeBtnActive]}
          onPress={() => setMode('search')}
        >
          <Ionicons
            name="search-outline"
            size={14}
            color={mode === 'search' ? '#185FA5' : '#888780'}
            style={{ marginRight: 4 }}
          />
          <Text style={[styles.modeBtnText, mode === 'search' && styles.modeBtnTextActive]}>
            Search
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeBtn, mode === 'ask' && styles.modeBtnActive]}
          onPress={() => setMode('ask')}
        >
          <Ionicons
            name="sparkles-outline"
            size={14}
            color={mode === 'ask' ? '#185FA5' : '#888780'}
            style={{ marginRight: 4 }}
          />
          <Text style={[styles.modeBtnText, mode === 'ask' && styles.modeBtnTextActive]}>
            Ask AI
          </Text>
        </TouchableOpacity>
      </View>

      {mode === 'search' ? (
        <>
          <View style={styles.inputWrap}>
            <Ionicons name="search-outline" size={16} color="#888780" style={{ marginRight: 8 }} />
            <TextInput
              style={styles.input}
              placeholder="Type a filename..."
              placeholderTextColor="#888780"
              value={query}
              onChangeText={handleSearchChange}
              autoCorrect={false}
              autoCapitalize="none"
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => { setQuery(''); search(''); }}>
                <Ionicons name="close-circle" size={16} color="#888780" />
              </TouchableOpacity>
            )}
          </View>

          {searching ? (
            <View style={styles.centered}>
              <ActivityIndicator color="#185FA5" />
              <Text style={styles.hint}>Searching...</Text>
            </View>
          ) : query.length < 2 ? (
            <View style={styles.centered}>
              <Ionicons name="search-outline" size={40} color="#D3D1C7" />
              <Text style={styles.hint}>Type at least 2 characters</Text>
            </View>
          ) : results.length === 0 ? (
            <View style={styles.centered}>
              <Ionicons name="document-outline" size={40} color="#D3D1C7" />
              <Text style={styles.hint}>No files found for "{query}"</Text>
            </View>
          ) : (
            <FlatList
              data={results}
              keyExtractor={item => item.uri}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              ListHeaderComponent={
                <Text style={styles.resultCount}>
                  {results.length} result{results.length !== 1 ? 's' : ''}
                </Text>
              }
              renderItem={({ item }) => {
                const color = item.isDirectory ? '#BA7517' : getFileColor(item.name);
                const ext = item.name.split('.').pop()?.toUpperCase() ?? '?';
                return (
                  <TouchableOpacity
                    style={styles.row}
                    onPress={() => item.isDirectory ? openFolder(item) : openFile(item.name, item.uri)}
                    onLongPress={() => !item.isDirectory && openSheet(item)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.fileIcon, { backgroundColor: color + '22', overflow: 'hidden' }]}>
                      {item.isDirectory ? (
                        <Ionicons name="folder" size={22} color={color} />
                      ) : isImageFile(item.name) ? (
                        <Image source={{ uri: item.uri }} style={styles.thumbnail} resizeMode="cover" />
                      ) : (
                        <Text style={[styles.extLabel, { color }]}>{ext.slice(0, 4)}</Text>
                      )}
                    </View>
                    <View style={styles.fileInfo}>
                      <Text style={styles.fileName} numberOfLines={1}>{item.name}</Text>
                      <Text style={styles.fileMeta}>
                        {item.isDirectory ? 'Folder' : ext + ' file'}
                      </Text>
                    </View>
                    {!item.isDirectory && (
                      <TouchableOpacity onPress={() => openSheet(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Ionicons name="ellipsis-vertical" size={16} color="#888780" />
                      </TouchableOpacity>
                    )}
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </>
      ) : (
        <>
          {/* Query counter badge — only shown to free users */}
          {!isPro && (
            <View style={styles.quotaBadge}>
              <Ionicons name="sparkles-outline" size={12} color={isLimitReached ? '#E24B4A' : '#185FA5'} />
              <Text style={[styles.quotaText, isLimitReached && styles.quotaTextLimit]}>
                {isLimitReached
                  ? 'Daily limit reached'
                  : `${queriesRemaining} free AI quer${queriesRemaining === 1 ? 'y' : 'ies'} left today`}
              </Text>
            </View>
          )}

          {/* Upgrade banner — shown when limit reached */}
          {isLimitReached && (
            <TouchableOpacity
              style={styles.upgradeBanner}
              onPress={() => router.push('/(tabs)/cloud')}
              activeOpacity={0.85}
            >
              <View style={styles.upgradeBannerLeft}>
                <Ionicons name="lock-closed-outline" size={18} color="#185FA5" />
                <View style={{ marginLeft: 12 }}>
                  <Text style={styles.upgradeBannerTitle}>Upgrade to Pro</Text>
                  <Text style={styles.upgradeBannerSub}>Unlimited AI queries, every day</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#185FA5" />
            </TouchableOpacity>
          )}

          <View style={[styles.inputWrap, isLimitReached && styles.inputWrapDisabled]}>
            <Ionicons name="sparkles-outline" size={16} color="#888780" style={{ marginRight: 8 }} />
            <TextInput
              style={styles.input}
              placeholder={isLimitReached ? 'Upgrade to ask more...' : 'Ask anything about your files...'}
              placeholderTextColor="#888780"
              value={aiQuery}
              onChangeText={setAiQuery}
              onSubmitEditing={() => handleAsk()}
              returnKeyType="send"
              editable={!isLimitReached}
            />
            {aiQuery.length > 0 && !isLimitReached && (
              <TouchableOpacity
                onPress={() => handleAsk()}
                disabled={thinking}
                style={{ opacity: thinking ? 0.4 : 1 }}
              >
                <Ionicons name="send" size={16} color="#185FA5" />
              </TouchableOpacity>
            )}
          </View>

          {thinking ? (
            <View style={styles.centered}>
              <ActivityIndicator color="#185FA5" />
              <Text style={styles.hint}>Thinking...</Text>
            </View>
          ) : answer.length > 0 ? (
            <ScrollView
              style={styles.answerScroll}
              contentContainerStyle={styles.answerScrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.answerWrap}>
                <View style={styles.answerHeader}>
                  <Ionicons name="sparkles-outline" size={16} color="#185FA5" />
                  <Text style={styles.answerLabel}>AskFiles AI</Text>
                </View>
                <Text style={styles.answerText}>{answer}</Text>
              </View>
              <TouchableOpacity style={styles.askAgainBtn} onPress={handleAskAgain}>
                <Ionicons name="sparkles-outline" size={14} color="#5F5E5A" style={{ marginRight: 6 }} />
                <Text style={styles.askAgainText}>Ask something else</Text>
              </TouchableOpacity>
              {!isLimitReached && (
                <>
                  <Text style={styles.suggestionsLabel}>Try these</Text>
                  <View style={styles.suggestions}>
                    {SUGGESTIONS.map(s => (
                      <TouchableOpacity
                        key={s}
                        style={styles.suggestion}
                        onPress={() => handleSuggestion(s)}
                      >
                        <Text style={styles.suggestionText}>{s}</Text>
                        <Ionicons name="chevron-forward" size={14} color="#888780" />
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}
            </ScrollView>
          ) : (
            <ScrollView
              contentContainerStyle={styles.suggestionsScroll}
              showsVerticalScrollIndicator={false}
            >
              {!isLimitReached && (
                <>
                  <View style={styles.centeredContent}>
                    <Ionicons name="sparkles-outline" size={40} color="#D3D1C7" />
                    <Text style={styles.hint}>Ask about your files in plain English</Text>
                  </View>
                  <View style={styles.suggestions}>
                    {SUGGESTIONS.map(s => (
                      <TouchableOpacity
                        key={s}
                        style={styles.suggestion}
                        onPress={() => handleSuggestion(s)}
                      >
                        <Text style={styles.suggestionText}>{s}</Text>
                        <Ionicons name="chevron-forward" size={14} color="#888780" />
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}
            </ScrollView>
          )}
        </>
      )}
      <Modal visible={folderStack.length > 0} transparent={false} animationType="slide" onRequestClose={popFolder}>
        <SafeAreaView style={styles.container}>
          {folderStack.length > 0 && (() => {
            const current = folderStack[folderStack.length - 1];
            return (
              <>
                <View style={styles.folderHeader}>
                  <TouchableOpacity onPress={popFolder} style={styles.folderBackBtn}>
                    <Ionicons name="arrow-back" size={22} color="#111" />
                  </TouchableOpacity>
                  <Text style={styles.folderTitle} numberOfLines={1}>{current.name}</Text>
                  <View style={{ width: 40 }} />
                </View>
                {folderLoading ? (
                  <View style={styles.centered}><ActivityIndicator color="#185FA5" /></View>
                ) : current.items.length === 0 ? (
                  <View style={styles.centered}>
                    <Ionicons name="folder-open-outline" size={40} color="#D3D1C7" />
                    <Text style={styles.hint}>Folder is empty</Text>
                  </View>
                ) : (
                  <FlatList
                    data={current.items}
                    keyExtractor={item => item.uri}
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                    renderItem={({ item }) => {
                      const color = item.isDirectory ? '#BA7517' : getFileColor(item.name);
                      const ext = item.name.split('.').pop()?.toUpperCase() ?? '?';
                      return (
                        <TouchableOpacity
                          style={styles.row}
                          onPress={() => item.isDirectory ? openFolder(item) : openFile(item.name, item.uri)}
                          onLongPress={() => !item.isDirectory && openSheet({ ...item, inFolder: true })}
                          activeOpacity={0.7}
                        >
                          <View style={[styles.fileIcon, { backgroundColor: color + '22', overflow: 'hidden' }]}>
                            {item.isDirectory ? (
                              <Ionicons name="folder" size={22} color={color} />
                            ) : isImageFile(item.name) ? (
                              <Image source={{ uri: item.uri }} style={styles.thumbnail} resizeMode="cover" />
                            ) : (
                              <Text style={[styles.extLabel, { color }]}>{ext.slice(0, 4)}</Text>
                            )}
                          </View>
                          <View style={styles.fileInfo}>
                            <Text style={styles.fileName} numberOfLines={1}>{item.name}</Text>
                            <Text style={styles.fileMeta}>{item.isDirectory ? 'Folder' : ext + ' file'}</Text>
                          </View>
                          {!item.isDirectory && (
                            <TouchableOpacity onPress={() => openSheet({ ...item, inFolder: true })} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                              <Ionicons name="ellipsis-vertical" size={16} color="#888780" />
                            </TouchableOpacity>
                          )}
                        </TouchableOpacity>
                      );
                    }}
                  />
                )}
              </>
            );
          })()}
        </SafeAreaView>
      </Modal>

      <Modal visible={showSheet} transparent animationType="none" onRequestClose={closeSheet}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'android' ? 'height' : 'padding'}>
          <Pressable style={styles.overlay} onPress={closeSheet}>
            <Animated.View
              style={[styles.sheet, { transform: [{ translateY: sheetAnim }], paddingBottom: insets.bottom + 16 }]}
              {...panResponder.panHandlers}
            >
              <Pressable>
                <View style={styles.sheetHandle} />
                <View style={styles.sheetHeader}>
                  <View style={[styles.sheetIcon, { backgroundColor: getFileColor(selectedItem?.name ?? '') + '22' }]}>
                    {isImageFile(selectedItem?.name ?? '') ? (
                      <Image source={{ uri: selectedItem?.uri }} style={styles.sheetThumb} resizeMode="cover" />
                    ) : (
                      <Text style={[styles.extLabel, { color: getFileColor(selectedItem?.name ?? '') }]}>
                        {selectedItem?.name.split('.').pop()?.toUpperCase().slice(0, 4)}
                      </Text>
                    )}
                  </View>
                  <View style={styles.sheetFileInfo}>
                    <Text style={styles.sheetFileName} numberOfLines={2}>{selectedItem?.name}</Text>
                    {fileSize && <Text style={styles.sheetFileMeta}>{fileSize}</Text>}
                  </View>
                </View>
                <View style={styles.sheetDivider} />
                <TouchableOpacity style={styles.sheetAction} onPress={handleShare}>
                  <Ionicons name="share-outline" size={20} color="#111" />
                  <Text style={styles.sheetActionText}>Share</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.sheetAction} onPress={handleMoveToVault}>
                  <Ionicons name="shield-checkmark-outline" size={20} color="#185FA5" />
                  <Text style={[styles.sheetActionText, { color: '#185FA5' }]}>Move to Vault</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.sheetAction} onPress={handleToggleFavourite}>
                  <Ionicons name={isFav ? 'heart' : 'heart-outline'} size={20} color={isFav ? '#E24B4A' : '#111'} />
                  <Text style={[styles.sheetActionText, isFav && { color: '#E24B4A' }]}>
                    {isFav ? 'Remove from Favourites' : 'Add to Favourites'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.sheetAction} onPress={() => {
                  closeSheet();
                  const location = selectedItem?.uri.replace('file:///storage/emulated/0/', '').split('/').slice(0, -1).join('/') || 'Storage';
                  Alert.alert(selectedItem?.name ?? '', [
                    fileSize ? `Size: ${fileSize}` : null,
                    `Type: ${selectedItem?.name.split('.').pop()?.toUpperCase()} file`,
                    `Location: /${location}`,
                  ].filter(Boolean).join('\n'));
                }}>
                  <Ionicons name="information-circle-outline" size={20} color="#111" />
                  <Text style={styles.sheetActionText}>Info</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.sheetAction} onPress={handleDelete}>
                  <Ionicons name="trash-outline" size={20} color="#E24B4A" />
                  <Text style={[styles.sheetActionText, { color: '#E24B4A' }]}>Delete</Text>
                </TouchableOpacity>
                <View style={styles.sheetDivider} />
                <TouchableOpacity style={styles.sheetAction} onPress={closeSheet}>
                  <Ionicons name="close-outline" size={20} color="#888780" />
                  <Text style={[styles.sheetActionText, { color: '#888780' }]}>Cancel</Text>
                </TouchableOpacity>
              </Pressable>
            </Animated.View>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  title: { fontSize: 26, fontWeight: '500', color: '#111', letterSpacing: -0.5 },
  modeToggle: { flexDirection: 'row', marginHorizontal: 16, marginVertical: 12, backgroundColor: '#F1EFE8', borderRadius: 10, padding: 4 },
  modeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 8, borderRadius: 8 },
  modeBtnActive: { backgroundColor: '#fff' },
  modeBtnText: { fontSize: 13, color: '#888780', fontWeight: '500' },
  modeBtnTextActive: { color: '#185FA5' },
  inputWrap: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 12, backgroundColor: '#F1EFE8', borderRadius: 10, padding: 12 },
  inputWrapDisabled: { opacity: 0.5 },
  input: { flex: 1, fontSize: 14, color: '#111' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  centeredContent: { alignItems: 'center', paddingVertical: 32, gap: 8 },
  hint: { fontSize: 13, color: '#888780', textAlign: 'center', marginTop: 8 },
  listContent: { paddingHorizontal: 16 },
  resultCount: { fontSize: 11, color: '#888780', marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: '#F1EFE8' },
  fileIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  thumbnail: { width: 40, height: 40 },
  extLabel: { fontSize: 9, fontWeight: '500' },
  fileInfo: { flex: 1 },
  fileName: { fontSize: 14, fontWeight: '500', color: '#111', marginBottom: 2 },
  fileMeta: { fontSize: 11, color: '#888780' },
  answerScroll: { flex: 1 },
  answerScrollContent: { padding: 16, gap: 12 },
  answerWrap: { backgroundColor: '#E6F1FB', borderRadius: 12, padding: 16 },
  answerHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  answerLabel: { fontSize: 13, fontWeight: '500', color: '#185FA5' },
  answerText: { fontSize: 14, color: '#111', lineHeight: 22 },
  askAgainBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1EFE8', borderRadius: 10, padding: 12 },
  askAgainText: { fontSize: 13, color: '#5F5E5A', fontWeight: '500' },
  suggestionsLabel: { fontSize: 11, fontWeight: '500', color: '#888780', letterSpacing: 0.5, textTransform: 'uppercase', marginTop: 4 },
  suggestionsScroll: { paddingHorizontal: 16, paddingBottom: 24 },
  suggestions: { gap: 8 },
  suggestion: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F1EFE8', borderRadius: 10, padding: 14 },
  suggestionText: { fontSize: 13, color: '#5F5E5A' },

  // Query limit styles
  quotaBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 16, marginBottom: 8 },
  quotaText: { fontSize: 12, color: '#185FA5' },
  quotaTextLimit: { color: '#E24B4A' },
  upgradeBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginHorizontal: 16, marginBottom: 12,
    backgroundColor: '#EBF3FC', borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: '#C5DCEF',
  },
  upgradeBannerLeft: { flexDirection: 'row', alignItems: 'center' },
  upgradeBannerTitle: { fontSize: 14, fontWeight: '600', color: '#111' },
  upgradeBannerSub: { fontSize: 12, color: '#888780', marginTop: 2 },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 16 },
  sheetHandle: { width: 36, height: 4, backgroundColor: '#D3D1C7', borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 16 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 12 },
  sheetIcon: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  sheetThumb: { width: 44, height: 44 },
  sheetFileInfo: { flex: 1 },
  sheetFileName: { fontSize: 14, fontWeight: '500', color: '#111', marginBottom: 2 },
  sheetFileMeta: { fontSize: 12, color: '#888780' },
  sheetDivider: { height: 0.5, backgroundColor: '#F1EFE8', marginVertical: 8 },
  sheetAction: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 },
  sheetActionText: { fontSize: 15, color: '#111' },
  folderHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  folderBackBtn: { width: 40, height: 40, justifyContent: 'center' },
  folderTitle: { flex: 1, fontSize: 18, fontWeight: '500', color: '#111', textAlign: 'center', letterSpacing: -0.3 },
});
