import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useGoogleDrive } from '@/hooks/useGoogleDrive';
import { useOneDrive } from '@/hooks/useOneDrive';
import { useVault } from '@/hooks/useVault';

export default function BackupScreen() {
  const router = useRouter();
  const {
    isConnected, lastBackup, loading, syncing, restoring, error,
    signIn, disconnect, backupVault, restoreVault,
  } = useGoogleDrive();
  const {
    isConnected: odConnected, lastBackup: odLastBackup, loading: odLoading,
    syncing: odSyncing, restoring: odRestoring, error: odError,
    signIn: odSignIn, disconnect: odDisconnect,
    backupVault: odBackupVault, restoreVault: odRestoreVault,
  } = useOneDrive();
  const { vaultDir } = useVault() as any;

  async function handleODBackup() {
    const ok = await odBackupVault(vaultDir);
    if (ok) {
      Alert.alert('Backup complete', 'Your vault files have been backed up to OneDrive.');
    }
  }

  async function handleODRestore() {
    Alert.alert(
      'Restore from OneDrive',
      'This will download your backed-up vault files to this device. Files already in your vault will be skipped.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          onPress: async () => {
            const count = await odRestoreVault(vaultDir);
            if (count > 0) {
              Alert.alert('Restore complete', `${count} file${count !== 1 ? 's' : ''} restored to your vault.`);
            } else if (count === 0 && !odError) {
              Alert.alert('Nothing to restore', 'All backed-up files are already in your vault.');
            }
          },
        },
      ]
    );
  }

  async function handleODDisconnect() {
    Alert.alert(
      'Disconnect OneDrive',
      'This removes access to OneDrive from AskFiles. Your backed-up files will remain on OneDrive.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Disconnect', style: 'destructive', onPress: odDisconnect },
      ]
    );
  }

  async function handleBackup() {
    const ok = await backupVault(vaultDir);
    if (ok) {
      Alert.alert('Backup complete', 'Your vault files have been backed up to Google Drive.');
    }
  }

  async function handleRestore() {
    Alert.alert(
      'Restore from Drive',
      'This will download your backed-up vault files to this device. Files already in your vault will be skipped.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          onPress: async () => {
            const count = await restoreVault(vaultDir);
            if (count > 0) {
              Alert.alert('Restore complete', `${count} file${count !== 1 ? 's' : ''} restored to your vault.`);
            } else if (count === 0 && !error) {
              Alert.alert('Nothing to restore', 'All backed-up files are already in your vault.');
            }
          },
        },
      ]
    );
  }

  async function handleDisconnect() {
    Alert.alert(
      'Disconnect Google Drive',
      'This removes access to Google Drive from AskFiles. Your backed-up files will remain on Drive.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Disconnect', style: 'destructive', onPress: disconnect },
      ]
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#111" />
          </TouchableOpacity>
          <Text style={styles.title}>Cloud Backup</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.centered}>
          <ActivityIndicator color="#185FA5" />
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
        <Text style={styles.title}>Cloud Backup</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Google Drive connection status */}
        <View style={styles.driveCard}>
          <View style={styles.driveCardLeft}>
            <View style={[styles.driveIcon, { backgroundColor: isConnected ? '#E8F5E9' : '#F1EFE8' }]}>
              <Ionicons
                name={isConnected ? 'cloud-done-outline' : 'cloud-outline'}
                size={24}
                color={isConnected ? '#2E7D32' : '#888780'}
              />
            </View>
            <View>
              <Text style={styles.driveTitle}>Google Drive</Text>
              <Text style={styles.driveStatus}>
                {isConnected ? 'Connected' : 'Not connected'}
              </Text>
            </View>
          </View>
          {isConnected ? (
            <TouchableOpacity onPress={handleDisconnect} style={styles.disconnectBtn}>
              <Text style={styles.disconnectText}>Disconnect</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={signIn} style={styles.connectBtn}>
              <Text style={styles.connectText}>Connect</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* OneDrive connection status */}
        <View style={styles.driveCard}>
          <View style={styles.driveCardLeft}>
            <View style={[styles.driveIcon, { backgroundColor: odConnected ? '#E8F0FE' : '#F1EFE8' }]}>
              <Ionicons
                name={odConnected ? 'cloud-done-outline' : 'cloud-outline'}
                size={24}
                color={odConnected ? '#185FA5' : '#888780'}
              />
            </View>
            <View>
              <Text style={styles.driveTitle}>OneDrive</Text>
              <Text style={styles.driveStatus}>
                {odConnected ? 'Connected' : 'Not connected'}
              </Text>
            </View>
          </View>
          {odConnected ? (
            <TouchableOpacity onPress={handleODDisconnect} style={styles.disconnectBtn}>
              <Text style={styles.disconnectText}>Disconnect</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={odSignIn} style={styles.connectBtn}>
              <Text style={styles.connectText}>Connect</Text>
            </TouchableOpacity>
          )}
        </View>

        {odError && <Text style={styles.errorText}>{odError}</Text>}

        {odConnected && (
          <>
            <View style={styles.infoRow}>
              <Ionicons name="time-outline" size={16} color="#888780" style={{ marginRight: 8 }} />
              <Text style={styles.infoText}>
                {odLastBackup ? `Last OneDrive backup: ${odLastBackup}` : 'No OneDrive backup yet'}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.backupBtn}
              onPress={handleODBackup}
              disabled={odSyncing || odRestoring}
              activeOpacity={0.85}
            >
              {odSyncing ? (
                <>
                  <ActivityIndicator color="#fff" size="small" style={{ marginRight: 8 }} />
                  <Text style={styles.backupBtnText}>Backing up...</Text>
                </>
              ) : (
                <>
                  <Ionicons name="cloud-upload-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
                  <Text style={styles.backupBtnText}>Back Up to OneDrive</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.restoreBtn, { marginBottom: 24 }]}
              onPress={handleODRestore}
              disabled={odSyncing || odRestoring}
              activeOpacity={0.85}
            >
              {odRestoring ? (
                <>
                  <ActivityIndicator color="#185FA5" size="small" style={{ marginRight: 8 }} />
                  <Text style={styles.restoreBtnText}>Restoring...</Text>
                </>
              ) : (
                <>
                  <Ionicons name="cloud-download-outline" size={18} color="#185FA5" style={{ marginRight: 8 }} />
                  <Text style={styles.restoreBtnText}>Restore from OneDrive</Text>
                </>
              )}
            </TouchableOpacity>
          </>
        )}

        {error && <Text style={styles.errorText}>{error}</Text>}

        {isConnected && (
          <>
            {/* Last backup info */}
            <View style={styles.infoRow}>
              <Ionicons name="time-outline" size={16} color="#888780" style={{ marginRight: 8 }} />
              <Text style={styles.infoText}>
                {lastBackup ? `Last backup: ${lastBackup}` : 'No backup yet'}
              </Text>
            </View>

            {/* What gets backed up */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>What's backed up</Text>
              <View style={styles.itemRow}>
                <Ionicons name="shield-checkmark-outline" size={18} color="#185FA5" style={{ marginRight: 10 }} />
                <View>
                  <Text style={styles.itemTitle}>Vault files</Text>
                  <Text style={styles.itemDesc}>Stored in a private AskFiles folder on your Drive</Text>
                </View>
              </View>
            </View>

            {/* Backup button */}
            <TouchableOpacity
              style={styles.backupBtn}
              onPress={handleBackup}
              disabled={syncing || restoring}
              activeOpacity={0.85}
            >
              {syncing ? (
                <>
                  <ActivityIndicator color="#fff" size="small" style={{ marginRight: 8 }} />
                  <Text style={styles.backupBtnText}>Backing up...</Text>
                </>
              ) : (
                <>
                  <Ionicons name="cloud-upload-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
                  <Text style={styles.backupBtnText}>Back Up Now</Text>
                </>
              )}
            </TouchableOpacity>

            {/* Restore button */}
            <TouchableOpacity
              style={styles.restoreBtn}
              onPress={handleRestore}
              disabled={syncing || restoring}
              activeOpacity={0.85}
            >
              {restoring ? (
                <>
                  <ActivityIndicator color="#185FA5" size="small" style={{ marginRight: 8 }} />
                  <Text style={styles.restoreBtnText}>Restoring...</Text>
                </>
              ) : (
                <>
                  <Ionicons name="cloud-download-outline" size={18} color="#185FA5" style={{ marginRight: 8 }} />
                  <Text style={styles.restoreBtnText}>Restore from Drive</Text>
                </>
              )}
            </TouchableOpacity>

            <Text style={styles.note}>
              Files are stored in "AskFiles Backup" folder on your Google Drive. Only you can see them.
            </Text>
          </>
        )}

        {!isConnected && (
          <View style={styles.emptyState}>
            <Ionicons name="cloud-outline" size={48} color="#D3D1C7" />
            <Text style={styles.emptyTitle}>Connect Google Drive</Text>
            <Text style={styles.emptySub}>
              Connect your Google account to back up your vault files and restore them on any device.
            </Text>
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  title: { flex: 1, fontSize: 20, fontWeight: '500', color: '#111', textAlign: 'center', letterSpacing: -0.5 },
  scroll: { paddingHorizontal: 24, paddingBottom: 40 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  driveCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#FAFAF8', borderRadius: 16, padding: 16, marginTop: 8, marginBottom: 16,
  },
  driveCardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  driveIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  driveTitle: { fontSize: 15, fontWeight: '500', color: '#111' },
  driveStatus: { fontSize: 12, color: '#888780', marginTop: 2 },
  connectBtn: { backgroundColor: '#185FA5', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8 },
  connectText: { fontSize: 13, fontWeight: '600', color: '#fff' },
  disconnectBtn: { paddingHorizontal: 12, paddingVertical: 8 },
  disconnectText: { fontSize: 13, color: '#E24B4A' },

  errorText: { fontSize: 13, color: '#E24B4A', textAlign: 'center', marginBottom: 12 },

  infoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  infoText: { fontSize: 13, color: '#888780' },

  section: { backgroundColor: '#FAFAF8', borderRadius: 12, padding: 16, marginBottom: 24 },
  sectionTitle: { fontSize: 11, fontWeight: '600', color: '#888780', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 12 },
  itemRow: { flexDirection: 'row', alignItems: 'flex-start' },
  itemTitle: { fontSize: 14, fontWeight: '500', color: '#111', marginBottom: 2 },
  itemDesc: { fontSize: 12, color: '#888780', lineHeight: 17 },

  backupBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#185FA5', borderRadius: 14, paddingVertical: 16, marginBottom: 12,
  },
  backupBtnText: { fontSize: 15, fontWeight: '600', color: '#fff' },

  restoreBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#EBF3FC', borderRadius: 14, paddingVertical: 16,
    borderWidth: 1.5, borderColor: '#185FA5', marginBottom: 16,
  },
  restoreBtnText: { fontSize: 15, fontWeight: '600', color: '#185FA5' },

  note: { fontSize: 11, color: '#5F5E5A', textAlign: 'center', lineHeight: 16 },

  emptyState: { alignItems: 'center', paddingTop: 48, gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '500', color: '#111' },
  emptySub: { fontSize: 14, color: '#888780', textAlign: 'center', lineHeight: 20 },
});
