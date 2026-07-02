import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useGoogleDrive } from '@/hooks/useGoogleDrive';
import { useOneDrive } from '@/hooks/useOneDrive';
import { useDropbox } from '@/hooks/useDropbox';
import { useVault } from '@/hooks/useVault';
import { useTheme } from '@/hooks/useTheme';
import { isCloudSyncing, addCloudSyncListener } from '@/hooks/useCloudSync';
import { useEffect, useState } from 'react';
import { getUploadProgress, getRestoreProgress, addProgressListener } from '@/hooks/useCloudProgress';
import { AppState } from 'react-native';

export default function BackupScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const {
    isConnected, lastBackup, loading, syncing, restoring, error,
    signIn, disconnect, backupVault, restoreVault,
  } = useGoogleDrive();

  const {
    isConnected: odConnected, lastBackup: odLastBackup,
    syncing: odSyncing, restoring: odRestoring, error: odError,
    signIn: odSignIn, disconnect: odDisconnect,
    backupVault: odBackupVault, restoreVault: odRestoreVault,
  } = useOneDrive();

  const {
    isConnected: dbConnected, lastBackup: dbLastBackup,
    syncing: dbSyncing, restoring: dbRestoring, error: dbError,
    signIn: dbSignIn, disconnect: dbDisconnect,
    backupVault: dbBackupVault, restoreVault: dbRestoreVault,
  } = useDropbox();

  const [cloudBusy, setCloudBusy] = useState(isCloudSyncing());

  const [globalUpload, setGlobalUpload] = useState({
    google: getUploadProgress('google'),
    onedrive: getUploadProgress('onedrive'),
    dropbox: getUploadProgress('dropbox'),
  });
  const [globalRestore, setGlobalRestore] = useState({
    google: getRestoreProgress('google'),
    onedrive: getRestoreProgress('onedrive'),
    dropbox: getRestoreProgress('dropbox'),
  });

  useEffect(() => {
    const unsub = addProgressListener(() => {
      setGlobalUpload({
        google: getUploadProgress('google'),
        onedrive: getUploadProgress('onedrive'),
        dropbox: getUploadProgress('dropbox'),
      });
      setGlobalRestore({
        google: getRestoreProgress('google'),
        onedrive: getRestoreProgress('onedrive'),
        dropbox: getRestoreProgress('dropbox'),
      });
    });
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = addCloudSyncListener(() => setCloudBusy(isCloudSyncing()));
    return unsub;
  }, []);

  const { vaultDir } = useVault() as any;

  async function handleDBBackup() {
    const ok = await dbBackupVault(vaultDir);
    if (ok) {
      if (AppState.currentState === 'active') {
        Alert.alert('Backup complete', 'Your vault and settings have been backed up to Dropbox.');
      }
    }
  }

  async function runDBRestore(scope: 'all' | 'files' | 'settings') {
    const count = await dbRestoreVault(vaultDir, scope);
    if (AppState.currentState === 'active') {
      if (scope === 'settings') {
        Alert.alert(dbError ? 'Restore failed' : 'Settings restored', dbError ? undefined : 'Your tags, favourites, pinned folders and appearance have been restored.');
      } else if (count > 0) {
        Alert.alert('Restore complete', `${count} file${count !== 1 ? 's' : ''} restored to your vault${scope === 'all' ? ' and settings applied' : ''}.`);
      } else if (count === 0 && !dbError) {
        Alert.alert('Nothing to restore', 'All Dropbox backup files are already in your vault.');
      }
    }
  }

  function handleDBRestore() {
    Alert.alert(
      'Restore from Dropbox',
      'Choose what to restore. Files already in your vault will be skipped.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Choose what...', onPress: () => {
          Alert.alert('What would you like to restore?', undefined, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Files Only', onPress: () => runDBRestore('files') },
            { text: 'Settings Only', onPress: () => runDBRestore('settings') },
          ]);
        }},
        { text: 'Restore Everything', onPress: () => runDBRestore('all') },
      ]
    );
  }

  function handleDBDisconnect() {
    Alert.alert(
      'Disconnect Dropbox',
      'This removes access to Dropbox from AskFiles. Your backed-up files will remain on Dropbox.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Disconnect', style: 'destructive', onPress: dbDisconnect },
      ]
    );
  }

  async function handleODBackup() {
    const ok = await odBackupVault(vaultDir);
    if (ok) {
      if (AppState.currentState === 'active') {
        Alert.alert('Backup complete', 'Your vault and settings have been backed up to OneDrive.');
      }
    }
  }

  async function runODRestore(scope: 'all' | 'files' | 'settings') {
    const count = await odRestoreVault(vaultDir, scope);
    if (AppState.currentState === 'active') {
      if (scope === 'settings') {
        Alert.alert(odError ? 'Restore failed' : 'Settings restored', odError ? undefined : 'Your tags, favourites, pinned folders and appearance have been restored.');
      } else if (count > 0) {
        Alert.alert('Restore complete', `${count} file${count !== 1 ? 's' : ''} restored to your vault${scope === 'all' ? ' and settings applied' : ''}.`);
      } else if (count === 0 && !odError) {
        Alert.alert('Nothing to restore', 'All backed-up files are already in your vault.');
      }
    }
  }

  function handleODRestore() {
    Alert.alert(
      'Restore from OneDrive',
      'Choose what to restore. Files already in your vault will be skipped.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Choose what...', onPress: () => {
          Alert.alert('What would you like to restore?', undefined, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Files Only', onPress: () => runODRestore('files') },
            { text: 'Settings Only', onPress: () => runODRestore('settings') },
          ]);
        }},
        { text: 'Restore Everything', onPress: () => runODRestore('all') },
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
      if (AppState.currentState === 'active') {
        Alert.alert('Backup complete', 'Your vault and settings have been backed up to Google Drive.');
      }
    }
  }

  async function runRestore(scope: 'all' | 'files' | 'settings') {
    const count = await restoreVault(vaultDir, scope);
    if (AppState.currentState === 'active') {
      if (scope === 'settings') {
        Alert.alert(error ? 'Restore failed' : 'Settings restored', error ? undefined : 'Your tags, favourites, pinned folders and appearance have been restored.');
      } else if (count > 0) {
        Alert.alert('Restore complete', `${count} file${count !== 1 ? 's' : ''} restored to your vault${scope === 'all' ? ' and settings applied' : ''}.`);
      } else if (count === 0 && !error) {
        Alert.alert('Nothing to restore', 'All backed-up files are already in your vault.');
      }
    }
  }

  function handleRestore() {
    Alert.alert(
      'Restore from Drive',
      'Choose what to restore. Files already in your vault will be skipped.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Choose what...', onPress: () => {
          Alert.alert('What would you like to restore?', undefined, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Files Only', onPress: () => runRestore('files') },
            { text: 'Settings Only', onPress: () => runRestore('settings') },
          ]);
        }},
        { text: 'Restore Everything', onPress: () => runRestore('all') },
      ]
    );
  }

  async function handleDisconnect() {
    Alert.alert(
      'Disconnect Google Drive',
      'This removes access to Google Drive from AskFiles. Your backed-up files will remain on Google Drive.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Disconnect', style: 'destructive', onPress: disconnect },
      ]
    );
  }

  if (loading) {
    return (
      <SafeAreaView edges={['left', 'right', 'bottom']} style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Cloud Backup</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.blue} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.background }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Cloud Backup</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

      <View style={[styles.section, { backgroundColor: colors.surfaceAlt }]}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>What's backed up</Text>
          <View style={styles.itemRow}>
            <Ionicons name="shield-checkmark-outline" size={18} color={colors.blue} style={{ marginRight: 10 }} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.itemTitle, { color: colors.textPrimary }]}>Vault files</Text>
              <Text style={[styles.itemDesc, { color: colors.textMuted }]}>Your files are stored privately in each cloud provider</Text>
            </View>
          </View>
          <View style={[styles.itemRow, { marginTop: 14 }]}>
            <Ionicons name="pricetag-outline" size={18} color={colors.purple} style={{ marginRight: 10 }} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.itemTitle, { color: colors.textPrimary }]}>Tags, favourites & pinned folders</Text>
              <Text style={[styles.itemDesc, { color: colors.textMuted }]}>Back up after making changes to keep them in sync across devices</Text>
            </View>
          </View>
        </View>

        {/* Google Drive */}
        <Text style={[styles.providerLabel, { color: colors.textMuted }]}>Google Drive</Text>
        <View style={[styles.driveCard, { backgroundColor: colors.surfaceAlt }]}>
          <View style={styles.driveCardLeft}>
            <View style={[styles.driveIcon, { backgroundColor: isConnected ? '#E8F5E9' : colors.surface }]}>
              <Ionicons
                name={isConnected ? 'cloud-done-outline' : 'cloud-outline'}
                size={24}
                color={isConnected ? '#2E7D32' : colors.textMuted}
              />
            </View>
            <View>
              <Text style={[styles.driveTitle, { color: colors.textPrimary }]}>Google Drive</Text>
              <Text style={[styles.driveStatus, { color: colors.textMuted }]}>
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

        {error && <Text style={styles.errorText}>{error}</Text>}

        {isConnected && (
          <>
            <View style={styles.infoRow}>
              <Ionicons name="time-outline" size={16} color={colors.textMuted} style={{ marginRight: 8 }} />
              <Text style={[styles.infoText, { color: colors.textMuted }]}>
              {globalUpload.google
                  ? <Text>Uploading — please wait: <Text style={{ color: colors.blue, fontWeight: '600' }}>{globalUpload.google.current}/{globalUpload.google.total} files uploaded</Text></Text>
                  : globalRestore.google
                    ? <Text>Restoring — please wait: <Text style={{ color: colors.blue, fontWeight: '600' }}>{globalRestore.google.current}/{globalRestore.google.total} files restored</Text></Text>
                    : lastBackup ? `Last backup: ${lastBackup}` : 'No Google Drive backup yet'
                }
              </Text>
            </View>
            <TouchableOpacity style={styles.backupBtn} onPress={handleBackup} disabled={cloudBusy || syncing || restoring} activeOpacity={0.85}>
              {syncing ? (
                <>
                  <ActivityIndicator color="#fff" size="small" style={{ marginRight: 8 }} />
                  <Text style={styles.backupBtnText}>Backing up...</Text>
                </>
              ) : (
                <>
                  <Ionicons name="cloud-upload-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
                  <Text style={styles.backupBtnText}>Back Up to Google Drive</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={[styles.restoreBtn, { backgroundColor: colors.blueTint }]} onPress={handleRestore} disabled={cloudBusy || syncing || restoring} activeOpacity={0.85}>
              {restoring ? (
                <>
                  <ActivityIndicator color={colors.blue} size="small" style={{ marginRight: 8 }} />
                  <Text style={[styles.restoreBtnText, { color: colors.blue }]}>Restoring...</Text>
                </>
              ) : (
                <>
                  <Ionicons name="cloud-download-outline" size={18} color={colors.blue} style={{ marginRight: 8 }} />
                  <Text style={[styles.restoreBtnText, { color: colors.blue }]}>Restore from Google Drive</Text>
                </>
              )}
            </TouchableOpacity>
            <View style={{ paddingHorizontal: 20 }}>
              <Text style={[styles.note, { color: colors.textSecondary }]}>
                <Text style={{ fontWeight: 'bold' }}>File location:</Text> "AskFiles" folder on your Google Drive.
              </Text>
              <Text style={[styles.note, { marginTop: 4, color: '#2E7D32', fontWeight: '500' }]}>
                Only you can see these files.
              </Text>
            </View>
          </>
        )}

        {!isConnected && (
          <Text style={[styles.notConnectedHint, { color: colors.textMuted }]}>
            Connect your Google account to back up and restore your vault files.
          </Text>
        )}

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        {/* OneDrive */}
        <Text style={[styles.providerLabel, { color: colors.textMuted }]}>OneDrive</Text>
        <View style={[styles.driveCard, { backgroundColor: colors.surfaceAlt }]}>
          <View style={styles.driveCardLeft}>
            <View style={[styles.driveIcon, { backgroundColor: odConnected ? '#E8F0FE' : colors.surface }]}>
              <Ionicons
                name={odConnected ? 'cloud-done-outline' : 'cloud-outline'}
                size={24}
                color={odConnected ? colors.blue : colors.textMuted}
              />
            </View>
            <View>
              <Text style={[styles.driveTitle, { color: colors.textPrimary }]}>OneDrive</Text>
              <Text style={[styles.driveStatus, { color: colors.textMuted }]}>
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
              <Ionicons name="time-outline" size={16} color={colors.textMuted} style={{ marginRight: 8 }} />
              <Text style={[styles.infoText, { color: colors.textMuted }]}>
              {globalUpload.onedrive
                  ? <Text>Uploading — please wait: <Text style={{ color: colors.blue, fontWeight: '600' }}>{globalUpload.onedrive.current}/{globalUpload.onedrive.total} files uploaded</Text></Text>
                  : globalRestore.onedrive
                    ? <Text>Restoring — please wait: <Text style={{ color: colors.blue, fontWeight: '600' }}>{globalRestore.onedrive.current}/{globalRestore.onedrive.total} files restored</Text></Text>
                    : odLastBackup ? `Last backup: ${odLastBackup}` : 'No OneDrive backup yet'
                }
              </Text>
            </View>
            <TouchableOpacity style={styles.backupBtn} onPress={handleODBackup} disabled={cloudBusy || odSyncing || odRestoring} activeOpacity={0.85}>
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
            <TouchableOpacity style={[styles.restoreBtn, { backgroundColor: colors.blueTint }]} onPress={handleODRestore} disabled={cloudBusy || odSyncing || odRestoring} activeOpacity={0.85}>
              {odRestoring ? (
                <>
                  <ActivityIndicator color={colors.blue} size="small" style={{ marginRight: 8 }} />
                  <Text style={[styles.restoreBtnText, { color: colors.blue }]}>Restoring...</Text>
                </>
              ) : (
                <>
                  <Ionicons name="cloud-download-outline" size={18} color={colors.blue} style={{ marginRight: 8 }} />
                  <Text style={[styles.restoreBtnText, { color: colors.blue }]}>Restore from OneDrive</Text>
                </>
              )}
            </TouchableOpacity>
            <View style={{ paddingHorizontal: 20 }}>
              <Text style={[styles.note, { color: colors.textSecondary }]}>
                <Text style={{ fontWeight: 'bold' }}>File location:</Text> "AskFiles" folder on your OneDrive.
              </Text>
              <Text style={[styles.note, { marginTop: 4, color: '#2E7D32', fontWeight: '500' }]}>
                Only you can see these files.
              </Text>
            </View>
          </>
        )}

        {!odConnected && (
          <Text style={[styles.notConnectedHint, { color: colors.textMuted }]}>
            Connect your Microsoft account to back up and restore your vault files.
          </Text>
        )}


        {/* Dropbox */}
        <Text style={[styles.providerLabel, { color: colors.textMuted }]}>Dropbox</Text>
        <View style={[styles.driveCard, { backgroundColor: colors.surfaceAlt }]}>
          <View style={styles.driveCardLeft}>
            <View style={[styles.driveIcon, { backgroundColor: dbConnected ? '#E8F0FE' : colors.surface }]}>
              <Ionicons
                name={dbConnected ? 'cloud-done-outline' : 'cloud-outline'}
                size={24}
                color={dbConnected ? '#0061FF' : colors.textMuted}
              />
            </View>
            <View>
              <Text style={[styles.driveTitle, { color: colors.textPrimary }]}>Dropbox</Text>
              <Text style={[styles.driveStatus, { color: colors.textMuted }]}>
                {dbConnected ? 'Connected' : 'Not connected'}
              </Text>
            </View>
          </View>
          {dbConnected ? (
            <TouchableOpacity onPress={handleDBDisconnect} style={styles.disconnectBtn}>
              <Text style={styles.disconnectText}>Disconnect</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={dbSignIn} style={styles.connectBtn}>
              <Text style={styles.connectText}>Connect</Text>
            </TouchableOpacity>
          )}
        </View>

        {dbError && <Text style={styles.errorText}>{dbError}</Text>}

        {dbConnected && (
          <>
            <View style={styles.infoRow}>
              <Ionicons name="time-outline" size={16} color={colors.textMuted} style={{ marginRight: 8 }} />
              <Text style={[styles.infoText, { color: colors.textMuted }]}>
              {globalUpload.dropbox
                  ? <Text>Uploading — please wait: <Text style={{ color: colors.blue, fontWeight: '600' }}>{globalUpload.dropbox.current}/{globalUpload.dropbox.total} files uploaded</Text></Text>
                  : globalRestore.dropbox
                    ? <Text>Restoring — please wait: <Text style={{ color: colors.blue, fontWeight: '600' }}>{globalRestore.dropbox.current}/{globalRestore.dropbox.total} files restored</Text></Text>
                    : dbLastBackup ? `Last backup: ${dbLastBackup}` : 'No Dropbox backup yet'
                }
              </Text>
            </View>
            <TouchableOpacity style={styles.backupBtn} onPress={handleDBBackup} disabled={cloudBusy || dbSyncing || dbRestoring} activeOpacity={0.85}>
              {dbSyncing ? (
                <>
                  <ActivityIndicator color="#fff" size="small" style={{ marginRight: 8 }} />
                  <Text style={styles.backupBtnText}>Backing up...</Text>
                </>
              ) : (
                <>
                  <Ionicons name="cloud-upload-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
                  <Text style={styles.backupBtnText}>Back Up to Dropbox</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={[styles.restoreBtn, { backgroundColor: colors.blueTint }]} onPress={handleDBRestore} disabled={cloudBusy || dbSyncing || dbRestoring} activeOpacity={0.85}>
              {dbRestoring ? (
                <>
                  <ActivityIndicator color={colors.blue} size="small" style={{ marginRight: 8 }} />
                  <Text style={[styles.restoreBtnText, { color: colors.blue }]}>Restoring...</Text>
                </>
              ) : (
                <>
                  <Ionicons name="cloud-download-outline" size={18} color={colors.blue} style={{ marginRight: 8 }} />
                  <Text style={[styles.restoreBtnText, { color: colors.blue }]}>Restore from Dropbox</Text>
                </>
              )}
            </TouchableOpacity>
            <View style={{ paddingHorizontal: 20 }}>
              <Text style={[styles.note, { color: colors.textSecondary }]}>
                <Text style={{ fontWeight: 'bold' }}>File location:</Text> "AskFiles" folder on your Dropbox.
              </Text>
              <Text style={[styles.note, { marginTop: 4, color: '#2E7D32', fontWeight: '500' }]}>
                Only you can see these files.
              </Text>
            </View>
          </>
        )}

        {!dbConnected && (
          <Text style={[styles.notConnectedHint, { color: colors.textMuted }]}>
            Connect your Dropbox account to back up and restore your vault files.
          </Text>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  title: { flex: 1, fontSize: 20, fontWeight: '500', textAlign: 'center', letterSpacing: -0.5 },
  scroll: { paddingHorizontal: 24, paddingBottom: 40 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  providerLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 },
  driveCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 16, padding: 16, marginBottom: 16 },
  driveCardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  driveIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  driveTitle: { fontSize: 15, fontWeight: '500' },
  driveStatus: { fontSize: 12, marginTop: 2 },
  connectBtn: { backgroundColor: '#185FA5', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8 },
  connectText: { fontSize: 13, fontWeight: '600', color: '#fff' },
  disconnectBtn: { paddingHorizontal: 12, paddingVertical: 8 },
  disconnectText: { fontSize: 13, color: '#E24B4A' },
  errorText: { fontSize: 13, color: '#E24B4A', textAlign: 'center', marginBottom: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  infoText: { fontSize: 13 },
  section: { borderRadius: 12, padding: 16, marginBottom: 24 },
  sectionTitle: { fontSize: 11, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 12 },
  itemRow: { flexDirection: 'row', alignItems: 'flex-start' },
  itemTitle: { fontSize: 14, fontWeight: '500', marginBottom: 2 },
  itemDesc: { fontSize: 12, lineHeight: 17 },
  backupBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#185FA5', borderRadius: 14, paddingVertical: 16, marginBottom: 12 },
  backupBtnText: { fontSize: 15, fontWeight: '600', color: '#fff' },
  restoreBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 14, paddingVertical: 16, borderWidth: 1.5, borderColor: '#185FA5', marginBottom: 16 },
  restoreBtnText: { fontSize: 15, fontWeight: '600' },
  note: { fontSize: 11, textAlign: 'center', lineHeight: 16, marginBottom: 8 },
  notConnectedHint: { fontSize: 13, textAlign: 'center', lineHeight: 19, marginBottom: 8 },
  divider: { height: 1, marginVertical: 24 },
});
