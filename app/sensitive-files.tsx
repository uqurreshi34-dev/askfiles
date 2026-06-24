import React, { useEffect, useState } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity, FlatList,
  ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useVault } from '@/hooks/useVault';
import { usePro } from '@/hooks/usePro';
import { useTheme } from '@/hooks/useTheme';
import { openFile as openFileNative } from '@/modules/share-module';
import { removeFavourite } from '@/hooks/useFavourites';
import { getFileColor, formatSize, getMimeType, getFriendlyPath } from '@/utils/files';
import { DocIndexer } from '@/modules/doc-indexer';
import { useTrash } from '@/hooks/useTrash';
import { querySensitiveFiles } from 'media-store';
import { getStorageVolumes } from '@/modules/storage-stats';

interface SensitiveFile {
  name: string;
  uri: string;
  size: number;
  matchedKeyword: string;
}

const SENSITIVE_KEYWORDS = [
  'personal', 'private', 'bank', 'statement',
  'invoice', 'salary', 'payslip', 'tax', 'secret',
  'prescription', 'medical', 'hospital',
  'licence', 'license', 'passport', 'insurance', 'contract',
];

export default function SensitiveFilesScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { addToVault } = useVault();
  const { isPro } = usePro();
  const [files, setFiles] = useState<SensitiveFile[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [movingUri, setMovingUri] = useState<string | null>(null);
  const [openingUri, setOpeningUri] = useState<string | null>(null);
  const { moveToTrash } = useTrash();
  const [deletingUri, setDeletingUri] = useState<string | null>(null);
  const [volumes, setVolumes] = useState<{ name: string; path: string; type: string }[]>([]);

  useEffect(() => {
    getStorageVolumes().then(setVolumes);
  }, []);

  async function scan() {
    setScanning(true);
    setScanned(false);
    setFiles([]);
    await new Promise(r => setTimeout(r, 50));
    try {
      const results = await querySensitiveFiles(SENSITIVE_KEYWORDS);
      const withKeyword = results
        .map(f => ({
          ...f,
          matchedKeyword: SENSITIVE_KEYWORDS.find(kw =>
            f.name.toLowerCase().includes(kw)
          ) ?? '',
        }))
        .filter(f => f.matchedKeyword !== '');
      setFiles(withKeyword);
    } catch {}
    finally {
      setScanning(false);
      setScanned(true);
    }
  }

  async function handleMoveToVault(file: SensitiveFile) {
    if (!isPro) {
      Alert.alert('Pro Feature', 'Upgrade to AskFiles Pro to move files to the Vault.', [
        { text: 'Not now', style: 'cancel' },
        { text: 'Upgrade', onPress: () => router.push('/(tabs)/cloud' as any) },
      ]);
      return;
    }
    Alert.alert('Move to Vault', `Move "${file.name}" to your Secure Vault?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Move', onPress: async () => {
        setMovingUri(file.uri);
        const ok = await addToVault(file.uri, file.name);
        if (ok) {
          setFiles(prev => prev.filter(f => f.uri !== file.uri));
          DocIndexer.removeFromIndex(file.uri);
        } else {
          Alert.alert('Error', 'Could not move file to Vault.');
        }
        setMovingUri(null);
      }},
    ]);
  }

  async function handleDelete(file: SensitiveFile) {
    Alert.alert('Move to Trash', `"${file.name}" will be moved to Trash and deleted after 30 days.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Move to Trash', style: 'destructive', onPress: async () => {
        setDeletingUri(file.uri);
        const ok = await moveToTrash(file.uri, file.name);
        if (ok) {
          await removeFavourite(file.uri);
          DocIndexer.removeFromIndex(file.uri);
          setFiles(prev => prev.filter(f => f.uri !== file.uri));
        } else {
          Alert.alert('Error', 'Could not move file to Trash.');
        }
        setDeletingUri(null);
      }},
    ]);
  }

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.background }]}>
      <TouchableOpacity 
        onPress={() => !scanning && router.back()} 
        style={styles.backBtn}
        disabled={scanning}
      >
        <Ionicons name="arrow-back" size={24} color={scanning ? colors.textDisabled : colors.textPrimary} />
      </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Sensitive Files</Text>
        <View style={{ width: 40 }} />
      </View>

      {!scanned && !scanning && (
        <View style={styles.centered}>
          <View style={[styles.startIcon, { backgroundColor: colors.amberTint }]}>
            <Ionicons name="shield-outline" size={40} color={colors.amber} />
          </View>
          <Text style={[styles.startTitle, { color: colors.textPrimary }]}>Find sensitive files</Text>
          <Text style={[styles.startSub, { color: colors.textMuted }]}>
            Scans for files with names suggesting sensitive content — passwords, bank statements, IDs, CVs and more. Move them to your Secure Vault.
          </Text>
          <TouchableOpacity style={[styles.scanBtn, { backgroundColor: colors.amber }]} onPress={scan} activeOpacity={0.85}>
            <Ionicons name="search-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.scanBtnText}>Start Scan</Text>
          </TouchableOpacity>
        </View>
      )}

      {scanning && (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.amber} />
          <Text style={[styles.scanningText, { color: colors.textPrimary }]}>Scanning your storage...</Text>
          <Text style={[styles.scanningSubText, { color: colors.textMuted }]}>This may take a moment</Text>
        </View>
      )}

      {scanned && !scanning && (
        <FlatList
          data={files}
          keyExtractor={item => item.uri}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <View style={[styles.summaryCard, { backgroundColor: colors.amberTint }]}>
              <Ionicons name="warning-outline" size={20} color={colors.amber} style={{ marginRight: 10 }} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.summaryTitle, { color: colors.textPrimary }]}>
                  {files.length === 0 ? 'No sensitive files found' : `${files.length} sensitive file${files.length !== 1 ? 's' : ''} found`}
                </Text>
                <Text style={[styles.summarySub, { color: colors.textSecondary }]}>
                  {files.length === 0 ? 'Your storage looks clean.' : 'Consider moving these to your Secure Vault.'}
                </Text>
              </View>
              <TouchableOpacity onPress={scan} style={{ paddingLeft: 8 }}>
                <Text style={[styles.rescanText, { color: colors.amber }]}>Rescan</Text>
              </TouchableOpacity>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.centered}>
              <Ionicons name="shield-checkmark-outline" size={56} color="#2E7D32" />
              <Text style={[styles.cleanTitle, { color: colors.textPrimary }]}>No sensitive files found!</Text>
              <Text style={[styles.cleanSub, { color: colors.textMuted }]}>Your storage looks clean.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const color = getFileColor(item.name);
            const ext = item.name.split('.').pop()?.toUpperCase() ?? '?';
            return (
                <TouchableOpacity
                style={[styles.row, { borderBottomColor: colors.border }]}
                activeOpacity={0.7}
                onPress={async () => {
                  setOpeningUri(item.uri);
                  try {
                    const path = item.uri.replace('file://', '');
                    await openFileNative(path, getMimeType(item.name));
                  } catch {}
                  setOpeningUri(null);
                }}
              >
                <View style={styles.fileInfo}>
                  <Text style={[styles.fileName, { color: colors.textPrimary }]} numberOfLines={1}>{item.name}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                    <View style={[styles.keywordBadge, { backgroundColor: colors.amberTint }]}>
                      <Text style={[styles.keywordText, { color: colors.amber }]}>{item.matchedKeyword}</Text>
                    </View>
                    <Text numberOfLines={1} ellipsizeMode="tail" style={{ flex: 1, fontSize: 11, color: colors.textMuted }}>
                      {formatSize(item.size)} · {getFriendlyPath(item.uri, volumes)}
                    </Text>
                  </View>
                </View>
                <View style={styles.actions}>
                  {openingUri === item.uri && (
                    <ActivityIndicator size="small" color={colors.blue} style={{ marginRight: 6 }} />
                  )}
                  <TouchableOpacity
                    style={[styles.vaultBtn, { backgroundColor: isPro ? colors.blue : colors.surface }]}
                    onPress={() => handleMoveToVault(item)}
                    disabled={movingUri === item.uri}
                  >
                    {movingUri === item.uri ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Ionicons name="shield-checkmark-outline" size={14} color={isPro ? '#fff' : colors.textMuted} />
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.deleteBtn, { backgroundColor: colors.surface }]}
                    onPress={() => handleDelete(item)}
                    disabled={deletingUri === item.uri}
                  >
                    {deletingUri === item.uri ? (
                      <ActivityIndicator size="small" color={colors.deleteRed} />
                    ) : (
                      <Ionicons name="trash-outline" size={14} color={colors.deleteRed} />
                    )}
                  </TouchableOpacity>
                </View>
               </TouchableOpacity>
            );
          }}
        />
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
  startIcon: { width: 88, height: 88, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  startTitle: { fontSize: 22, fontWeight: '600', letterSpacing: -0.5 },
  startSub: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  scanBtn: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32, marginTop: 8 },
  scanBtnText: { fontSize: 15, fontWeight: '600', color: '#fff' },
  scanningText: { fontSize: 16, fontWeight: '500', marginTop: 16 },
  scanningSubText: { fontSize: 13 },
  listContent: { paddingHorizontal: 16, paddingBottom: 32 },
  summaryCard: { borderRadius: 12, padding: 14, marginBottom: 16, flexDirection: 'row', alignItems: 'center' },
  summaryTitle: { fontSize: 14, fontWeight: '600', marginBottom: 2 },
  summarySub: { fontSize: 12 },
  rescanText: { fontSize: 13, fontWeight: '500' },
  cleanTitle: { fontSize: 20, fontWeight: '600' },
  cleanSub: { fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 0.5 },
  fileIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  thumbnail: { width: 40, height: 40 },
  extLabel: { fontSize: 9, fontWeight: '500' },
  fileInfo: { flex: 1 },
  fileName: { fontSize: 14, fontWeight: '500' },
  fileMeta: { fontSize: 11 },
  keywordBadge: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  keywordText: { fontSize: 10, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 6 },
  vaultBtn: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  deleteBtn: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
});
