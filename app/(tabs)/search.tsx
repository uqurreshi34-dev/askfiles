import { useState, useRef } from 'react';
import {
  StyleSheet, Text, View, TextInput, TouchableOpacity,
  FlatList, ActivityIndicator, Image, Keyboard, ScrollView,
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

  return `
Device storage: ${storageInfo?.usedReadable} used of ${storageInfo?.totalReadable} total. ${freeSpace} free.
File counts: ${fileCounts.images} images (jpg, jpeg, png, gif, webp, heic), ${fileCounts.videos} videos, ${fileCounts.documents} documents, ${fileCounts.downloads} downloads.
Screenshots: exactly ${mediaContext.screenshotCount} files (do not count manually, use this number).
Folder sizes: DCIM/Camera ${folderSizes.dcim}, Pictures ${folderSizes.pictures}, Videos total ${folderSizes.videos}, Downloads ${folderSizes.downloads}, Documents ${folderSizes.documents}, Music ${folderSizes.music}.
All image filenames sorted newest first: ${imageNames}.
All video filenames sorted newest first: ${videoNames}.
Note: PNG files are image files. Files with 1970 date have corrupted/missing timestamps from WhatsApp.
  `.trim();
}

export default function SearchScreen() {
  const [mode, setMode] = useState<Mode>('search');
  const [query, setQuery] = useState('');
  const [aiQuery, setAiQuery] = useState('');
  const { results, searching, search } = useSearch();
  const { answer, thinking, ask, reset } = useAskAI();
  const router = useRouter();
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { fileCounts, storageInfo, folderSizes, mediaContext } = useStorage();

  function handleSearchChange(text: string) {
    setQuery(text);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => search(text), 300);
  }

  async function handleAsk(question?: string) {
    const q = question ?? aiQuery;
    if (q.trim().length < 3) return;
    Keyboard.dismiss();
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
        <Text style={styles.title}>Search</Text>
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
                    onPress={() => !item.isDirectory && openFile(item.name, item.uri)}
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
                      <Ionicons name="chevron-forward" size={16} color="#D3D1C7" />
                    )}
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </>
      ) : (
        <>
          <View style={styles.inputWrap}>
            <Ionicons name="sparkles-outline" size={16} color="#888780" style={{ marginRight: 8 }} />
            <TextInput
              style={styles.input}
              placeholder="Ask anything about your files..."
              placeholderTextColor="#888780"
              value={aiQuery}
              onChangeText={setAiQuery}
              onSubmitEditing={() => handleAsk()}
              returnKeyType="send"
            />
            {aiQuery.length > 0 && (
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
            </ScrollView>
          ) : (
            <ScrollView
              contentContainerStyle={styles.suggestionsScroll}
              showsVerticalScrollIndicator={false}
            >
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
            </ScrollView>
          )}
        </>
      )}
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
});
