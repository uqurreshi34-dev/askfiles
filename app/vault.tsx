import { useState } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity, FlatList,
  ActivityIndicator, Alert, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import { useVault, VaultFile } from '@/hooks/useVault';
import { isImageFile, getMimeType } from '@/utils/files';

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
  if (['pdf', 'doc', 'docx', 'txt', 'xls', 'xlsx'].includes(ext ?? '')) return '#534AB7';
  return '#5F5E5A';
}

export default function VaultScreen() {
  const router = useRouter();
  const { files, loading, authenticated, authError, authenticate, removeFromVault, deleteFromVault, lock } = useVault();
  const [busy, setBusy] = useState(false);

  async function handleAuth() {
    await authenticate();
  }

  async function openFile(file: VaultFile) {
    if (isImageFile(file.name)) {
      router.push({ pathname: '/viewer', params: { uri: file.uri, name: file.name } });
      return;
    }
    try {
      await Sharing.shareAsync(file.uri, {
        mimeType: getMimeType(file.name),
        dialogTitle: file.name,
      });
    } catch {}
  }

  async function handleRemove(file: VaultFile) {
    Alert.alert(
      'Move out of Vault',
      `Move "${file.name}" back to Downloads?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Move Out',
          onPress: async () => {
            setBusy(true);
            const ok = await removeFromVault(file, 'file:///storage/emulated/0/Download/');
            setBusy(false);
            if (!ok) Alert.alert('Error', 'Could not move file. Try again.');
          },
        },
      ]
    );
  }

  async function handleDelete(file: VaultFile) {
    Alert.alert(
      'Delete permanently',
      `Delete "${file.name}" forever? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            await deleteFromVault(file);
            setBusy(false);
          },
        },
      ]
    );
  }

  function renderFile({ item }: { item: VaultFile }) {
    const color = getFileColor(item.name);
    const ext = item.name.split('.').pop()?.toUpperCase() ?? '?';
    return (
      <TouchableOpacity style={styles.row} onPress={() => openFile(item)} activeOpacity={0.7}>
        <View style={[styles.icon, { backgroundColor: color + '22', overflow: 'hidden' }]}>
          {isImageFile(item.name) ? (
            <Image source={{ uri: item.uri }} style={styles.thumb} resizeMode="cover" />
          ) : (
            <Text style={[styles.ext, { color }]}>{ext.slice(0, 4)}</Text>
          )}
        </View>
        <View style={styles.info}>
          <Text style={styles.fileName} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.fileMeta}>{formatSize(item.size)}</Text>
        </View>
        <TouchableOpacity
          style={styles.menuBtn}
          onPress={() => Alert.alert(item.name, undefined, [
            { text: 'Open', onPress: () => openFile(item) },
            { text: 'Move out of Vault', onPress: () => handleRemove(item) },
            { text: 'Delete permanently', style: 'destructive', onPress: () => handleDelete(item) },
            { text: 'Cancel', style: 'cancel' },
          ])}
        >
          <Ionicons name="ellipsis-vertical" size={16} color="#888780" />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  }

  // Locked state
  if (!authenticated) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#111" />
          </TouchableOpacity>
          <Text style={styles.title}>Vault</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.lockScreen}>
          <View style={styles.lockIcon}>
            <Ionicons name="lock-closed" size={40} color="#185FA5" />
          </View>
          <Text style={styles.lockTitle}>Secure Vault</Text>
          <Text style={styles.lockSub}>Your files are protected. Authenticate to access your vault.</Text>
          {authError && <Text style={styles.errorText}>{authError}</Text>}
          <TouchableOpacity style={styles.authBtn} onPress={handleAuth} activeOpacity={0.85}>
            <Ionicons name="finger-print-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.authBtnText}>Unlock with Biometrics</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#111" />
        </TouchableOpacity>
        <Text style={styles.title}>Vault</Text>
        <TouchableOpacity onPress={lock} style={styles.backBtn}>
          <Ionicons name="lock-closed-outline" size={22} color="#185FA5" />
        </TouchableOpacity>
      </View>

      {busy && (
        <View style={styles.busyBanner}>
          <ActivityIndicator size="small" color="#185FA5" />
          <Text style={styles.busyText}>Working...</Text>
        </View>
      )}

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color="#185FA5" />
        </View>
      ) : files.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="shield-checkmark-outline" size={48} color="#D3D1C7" />
          <Text style={styles.emptyTitle}>Vault is empty</Text>
          <Text style={styles.emptySub}>Move files here from Browse using long press → Move to Vault</Text>
        </View>
      ) : (
        <FlatList
          data={files}
          keyExtractor={item => item.uri}
          renderItem={renderFile}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <Text style={styles.count}>{files.length} file{files.length !== 1 ? 's' : ''} secured</Text>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  title: { flex: 1, fontSize: 20, fontWeight: '500', color: '#111', textAlign: 'center', letterSpacing: -0.5 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 32 },

  lockScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 12 },
  lockIcon: { width: 88, height: 88, borderRadius: 24, backgroundColor: '#EBF3FC', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  lockTitle: { fontSize: 22, fontWeight: '600', color: '#111', letterSpacing: -0.5 },
  lockSub: { fontSize: 14, color: '#888780', textAlign: 'center', lineHeight: 20 },
  errorText: { fontSize: 13, color: '#E24B4A', textAlign: 'center' },
  authBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#185FA5', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 28, marginTop: 8 },
  authBtnText: { fontSize: 15, fontWeight: '600', color: '#fff' },

  busyBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#EBF3FC' },
  busyText: { fontSize: 13, color: '#185FA5' },

  list: { paddingHorizontal: 16, paddingBottom: 24 },
  count: { fontSize: 11, color: '#888780', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: '#F1EFE8' },
  icon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  thumb: { width: 40, height: 40 },
  ext: { fontSize: 9, fontWeight: '500' },
  info: { flex: 1 },
  fileName: { fontSize: 14, fontWeight: '500', color: '#111', marginBottom: 2 },
  fileMeta: { fontSize: 11, color: '#888780' },
  menuBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: '500', color: '#111' },
  emptySub: { fontSize: 13, color: '#888780', textAlign: 'center', lineHeight: 18 },
});
