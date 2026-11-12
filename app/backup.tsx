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
import { useLanguage } from '@/modules/appLanguage';
import { commonText } from '@/modules/i18n/common';
import { backupText } from '@/modules/i18n/backupText';
import { isCloudSyncing, addCloudSyncListener } from '@/hooks/useCloudSync';
import { useEffect, useState } from 'react';
import { getUploadProgress, getRestoreProgress, addProgressListener } from '@/hooks/useCloudProgress';
import { AppState } from 'react-native';

export default function BackupScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const lang = useLanguage();
  const tc = commonText(lang);
  const bt = backupText(lang);
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

  async function runDBBackup(scope: 'all' | 'files' | 'settings') {
    const ok = await dbBackupVault(vaultDir, scope);
    if (ok && AppState.currentState === 'active') {
      const msg = scope === 'files' ? bt.backedUpFiles('Dropbox')
        : scope === 'settings' ? bt.backedUpSettings('Dropbox')
        : bt.backedUpAll('Dropbox');
      Alert.alert(bt.backupComplete, msg);
    }
  }

  function handleDBBackup() {
    Alert.alert(
      bt.backUpTo('Dropbox'),
      bt.chooseBackup,
      [
        { text: tc.cancel, style: 'cancel' },
        { text: bt.chooseWhat, onPress: () => {
          Alert.alert(bt.whatBackup, undefined, [
            { text: tc.cancel, style: 'cancel' },
            { text: bt.filesOnly, onPress: () => runDBBackup('files') },
            { text: bt.settingsOnly, onPress: () => runDBBackup('settings') },
          ]);
        }},
        { text: bt.backUpEverything, onPress: () => runDBBackup('all') },
      ]
    );
  }

  async function runDBRestore(scope: 'all' | 'files' | 'settings') {
    const count = await dbRestoreVault(vaultDir, scope);
    if (AppState.currentState === 'active') {
      if (scope === 'settings') {
        Alert.alert(dbError ? bt.restoreFailed : bt.settingsRestored, dbError ? undefined : bt.settingsRestoredMsg);
      } else if (count > 0) {
        Alert.alert(bt.restoreComplete, bt.restoredToVault(count, scope === 'all'));
      } else if (count === 0 && !dbError) {
        Alert.alert(bt.nothingToRestore, bt.allProviderInVault('Dropbox'));
      }
    }
  }

  function handleDBRestore() {
    Alert.alert(
      bt.restoreFrom('Dropbox'),
      bt.chooseRestore,
      [
        { text: tc.cancel, style: 'cancel' },
        { text: bt.chooseWhat, onPress: () => {
          Alert.alert(bt.whatRestore, undefined, [
            { text: tc.cancel, style: 'cancel' },
            { text: bt.filesOnly, onPress: () => runDBRestore('files') },
            { text: bt.settingsOnly, onPress: () => runDBRestore('settings') },
          ]);
        }},
        { text: bt.restoreEverything, onPress: () => runDBRestore('all') },
      ]
    );
  }

  function handleDBDisconnect() {
    Alert.alert(
      bt.disconnectTitle('Dropbox'),
      bt.disconnectMsg('Dropbox'),
      [
        { text: tc.cancel, style: 'cancel' },
        { text: bt.disconnect, style: 'destructive', onPress: dbDisconnect },
      ]
    );
  }

  async function runODBackup(scope: 'all' | 'files' | 'settings') {
    const ok = await odBackupVault(vaultDir, scope);
    if (ok && AppState.currentState === 'active') {
      const msg = scope === 'files' ? bt.backedUpFiles('OneDrive')
        : scope === 'settings' ? bt.backedUpSettings('OneDrive')
        : bt.backedUpAll('OneDrive');
      Alert.alert(bt.backupComplete, msg);
    }
  }

  function handleODBackup() {
    Alert.alert(
      bt.backUpTo('OneDrive'),
      bt.chooseBackup,
      [
        { text: tc.cancel, style: 'cancel' },
        { text: bt.chooseWhat, onPress: () => {
          Alert.alert(bt.whatBackup, undefined, [
            { text: tc.cancel, style: 'cancel' },
            { text: bt.filesOnly, onPress: () => runODBackup('files') },
            { text: bt.settingsOnly, onPress: () => runODBackup('settings') },
          ]);
        }},
        { text: bt.backUpEverything, onPress: () => runODBackup('all') },
      ]
    );
  }

  async function runODRestore(scope: 'all' | 'files' | 'settings') {
    const count = await odRestoreVault(vaultDir, scope);
    if (AppState.currentState === 'active') {
      if (scope === 'settings') {
        Alert.alert(odError ? bt.restoreFailed : bt.settingsRestored, odError ? undefined : bt.settingsRestoredMsg);
      } else if (count > 0) {
        Alert.alert(bt.restoreComplete, bt.restoredToVault(count, scope === 'all'));
      } else if (count === 0 && !odError) {
        Alert.alert(bt.nothingToRestore, bt.allInVault);
      }
    }
  }

  function handleODRestore() {
    Alert.alert(
      bt.restoreFrom('OneDrive'),
      bt.chooseRestore,
      [
        { text: tc.cancel, style: 'cancel' },
        { text: bt.chooseWhat, onPress: () => {
          Alert.alert(bt.whatRestore, undefined, [
            { text: tc.cancel, style: 'cancel' },
            { text: bt.filesOnly, onPress: () => runODRestore('files') },
            { text: bt.settingsOnly, onPress: () => runODRestore('settings') },
          ]);
        }},
        { text: bt.restoreEverything, onPress: () => runODRestore('all') },
      ]
    );
  }

  async function handleODDisconnect() {
    Alert.alert(
      bt.disconnectTitle('OneDrive'),
      bt.disconnectMsg('OneDrive'),
      [
        { text: tc.cancel, style: 'cancel' },
        { text: bt.disconnect, style: 'destructive', onPress: odDisconnect },
      ]
    );
  }

  async function runBackup(scope: 'all' | 'files' | 'settings') {
    const ok = await backupVault(vaultDir, scope);
    if (ok && AppState.currentState === 'active') {
      const msg = scope === 'files' ? bt.backedUpFiles('Google Drive')
        : scope === 'settings' ? bt.backedUpSettings('Google Drive')
        : bt.backedUpAll('Google Drive');
      Alert.alert(bt.backupComplete, msg);
    }
  }

  function handleBackup() {
    Alert.alert(
      bt.backUpTo('Google Drive'),
      bt.chooseBackup,
      [
        { text: tc.cancel, style: 'cancel' },
        { text: bt.chooseWhat, onPress: () => {
          Alert.alert(bt.whatBackup, undefined, [
            { text: tc.cancel, style: 'cancel' },
            { text: bt.filesOnly, onPress: () => runBackup('files') },
            { text: bt.settingsOnly, onPress: () => runBackup('settings') },
          ]);
        }},
        { text: bt.backUpEverything, onPress: () => runBackup('all') },
      ]
    );
  }

  async function runRestore(scope: 'all' | 'files' | 'settings') {
    const count = await restoreVault(vaultDir, scope);
    if (AppState.currentState === 'active') {
      if (scope === 'settings') {
        Alert.alert(error ? bt.restoreFailed : bt.settingsRestored, error ? undefined : bt.settingsRestoredMsg);
      } else if (count > 0) {
        Alert.alert(bt.restoreComplete, bt.restoredToVault(count, scope === 'all'));
      } else if (count === 0 && !error) {
        Alert.alert(bt.nothingToRestore, bt.allInVault);
      }
    }
  }

  function handleRestore() {
    Alert.alert(
      bt.restoreFrom('Google Drive'),
      bt.chooseRestore,
      [
        { text: tc.cancel, style: 'cancel' },
        { text: bt.chooseWhat, onPress: () => {
          Alert.alert(bt.whatRestore, undefined, [
            { text: tc.cancel, style: 'cancel' },
            { text: bt.filesOnly, onPress: () => runRestore('files') },
            { text: bt.settingsOnly, onPress: () => runRestore('settings') },
          ]);
        }},
        { text: bt.restoreEverything, onPress: () => runRestore('all') },
      ]
    );
  }

  async function handleDisconnect() {
    Alert.alert(
      bt.disconnectTitle('Google Drive'),
      bt.disconnectMsg('Google Drive'),
      [
        { text: tc.cancel, style: 'cancel' },
        { text: bt.disconnect, style: 'destructive', onPress: disconnect },
      ]
    );
  }

  if (loading) {
    return (
      <SafeAreaView edges={['left', 'right', 'bottom']} style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.textPrimary }]}>{bt.cloudBackup}</Text>
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
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>{bt.cloudBackup}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

      <View style={[styles.section, { backgroundColor: colors.surfaceAlt }]}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>{bt.whatsBackedUp}</Text>
          <View style={styles.itemRow}>
            <Ionicons name="shield-checkmark-outline" size={18} color={colors.blue} style={{ marginRight: 10 }} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.itemTitle, { color: colors.textPrimary }]}>{bt.vaultFiles}</Text>
              <Text style={[styles.itemDesc, { color: colors.textMuted }]}>{bt.vaultFilesDesc}</Text>
            </View>
          </View>
          <View style={[styles.itemRow, { marginTop: 14 }]}>
            <Ionicons name="pricetag-outline" size={18} color={colors.purple} style={{ marginRight: 10 }} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.itemTitle, { color: colors.textPrimary }]}>{bt.tagsFavPinned}</Text>
              <Text style={[styles.itemDesc, { color: colors.textMuted }]}>{bt.tagsDesc}</Text>
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
                {isConnected ? bt.connected : bt.notConnected}
              </Text>
            </View>
          </View>
          {isConnected ? (
            <TouchableOpacity onPress={handleDisconnect} style={styles.disconnectBtn}>
              <Text style={styles.disconnectText}>{bt.disconnect}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={signIn} style={styles.connectBtn}>
              <Text style={styles.connectText}>{bt.connect}</Text>
            </TouchableOpacity>
          )}
        </View>

        {error && <Text style={styles.errorText}>{bt.error(error)}</Text>}

        {isConnected && (
          <>
            <View style={styles.infoRow}>
              <Ionicons name="time-outline" size={16} color={colors.textMuted} style={{ marginRight: 8 }} />
              <Text style={[styles.infoText, { color: colors.textMuted }]}>
              {globalUpload.google
                  ? <Text>{bt.uploadingWait}<Text style={{ color: colors.blue, fontWeight: '600' }}>{bt.nUploaded(globalUpload.google.current, globalUpload.google.total)}</Text></Text>
                  : globalRestore.google
                    ? <Text>{bt.restoringWait}<Text style={{ color: colors.blue, fontWeight: '600' }}>{bt.nRestored(globalRestore.google.current, globalRestore.google.total)}</Text></Text>
                    : lastBackup ? bt.lastBackup(lastBackup) : bt.noBackupYet('Google Drive')
                }
              </Text>
            </View>
            <TouchableOpacity style={styles.backupBtn} onPress={handleBackup} disabled={cloudBusy || syncing || restoring} activeOpacity={0.85}>
              {syncing ? (
                <>
                  <ActivityIndicator color="#fff" size="small" style={{ marginRight: 8 }} />
                  <Text style={styles.backupBtnText}>{bt.backingUp}</Text>
                </>
              ) : (
                <>
                  <Ionicons name="cloud-upload-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
                  <Text style={styles.backupBtnText}>{bt.backUpTo('Google Drive')}</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={[styles.restoreBtn, { backgroundColor: colors.blueTint }]} onPress={handleRestore} disabled={cloudBusy || syncing || restoring} activeOpacity={0.85}>
              {restoring ? (
                <>
                  <ActivityIndicator color={colors.blue} size="small" style={{ marginRight: 8 }} />
                  <Text style={[styles.restoreBtnText, { color: colors.blue }]}>{bt.restoring}</Text>
                </>
              ) : (
                <>
                  <Ionicons name="cloud-download-outline" size={18} color={colors.blue} style={{ marginRight: 8 }} />
                  <Text style={[styles.restoreBtnText, { color: colors.blue }]}>{bt.restoreFrom('Google Drive')}</Text>
                </>
              )}
            </TouchableOpacity>
            <View style={{ paddingHorizontal: 20 }}>
              <Text style={[styles.note, { color: colors.textSecondary }]}>
                <Text style={{ fontWeight: 'bold' }}>{bt.fileLocation}</Text>{bt.folderOn('Google Drive')}
              </Text>
              <Text style={[styles.note, { marginTop: 4, color: '#2E7D32', fontWeight: '500' }]}>
                {bt.onlyYou}
              </Text>
            </View>
          </>
        )}

        {!isConnected && (
          <Text style={[styles.notConnectedHint, { color: colors.textMuted }]}>
            {bt.connectHint('Google')}
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
                {odConnected ? bt.connected : bt.notConnected}
              </Text>
            </View>
          </View>
          {odConnected ? (
            <TouchableOpacity onPress={handleODDisconnect} style={styles.disconnectBtn}>
              <Text style={styles.disconnectText}>{bt.disconnect}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={odSignIn} style={styles.connectBtn}>
              <Text style={styles.connectText}>{bt.connect}</Text>
            </TouchableOpacity>
          )}
        </View>

        {odError && <Text style={styles.errorText}>{bt.error(odError)}</Text>}

        {odConnected && (
          <>
            <View style={styles.infoRow}>
              <Ionicons name="time-outline" size={16} color={colors.textMuted} style={{ marginRight: 8 }} />
              <Text style={[styles.infoText, { color: colors.textMuted }]}>
              {globalUpload.onedrive
                  ? <Text>{bt.uploadingWait}<Text style={{ color: colors.blue, fontWeight: '600' }}>{bt.nUploaded(globalUpload.onedrive.current, globalUpload.onedrive.total)}</Text></Text>
                  : globalRestore.onedrive
                    ? <Text>{bt.restoringWait}<Text style={{ color: colors.blue, fontWeight: '600' }}>{bt.nRestored(globalRestore.onedrive.current, globalRestore.onedrive.total)}</Text></Text>
                    : odLastBackup ? bt.lastBackup(odLastBackup) : bt.noBackupYet('OneDrive')
                }
              </Text>
            </View>
            <TouchableOpacity style={styles.backupBtn} onPress={handleODBackup} disabled={cloudBusy || odSyncing || odRestoring} activeOpacity={0.85}>
              {odSyncing ? (
                <>
                  <ActivityIndicator color="#fff" size="small" style={{ marginRight: 8 }} />
                  <Text style={styles.backupBtnText}>{bt.backingUp}</Text>
                </>
              ) : (
                <>
                  <Ionicons name="cloud-upload-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
                  <Text style={styles.backupBtnText}>{bt.backUpTo('OneDrive')}</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={[styles.restoreBtn, { backgroundColor: colors.blueTint }]} onPress={handleODRestore} disabled={cloudBusy || odSyncing || odRestoring} activeOpacity={0.85}>
              {odRestoring ? (
                <>
                  <ActivityIndicator color={colors.blue} size="small" style={{ marginRight: 8 }} />
                  <Text style={[styles.restoreBtnText, { color: colors.blue }]}>{bt.restoring}</Text>
                </>
              ) : (
                <>
                  <Ionicons name="cloud-download-outline" size={18} color={colors.blue} style={{ marginRight: 8 }} />
                  <Text style={[styles.restoreBtnText, { color: colors.blue }]}>{bt.restoreFrom('OneDrive')}</Text>
                </>
              )}
            </TouchableOpacity>
            <View style={{ paddingHorizontal: 20 }}>
              <Text style={[styles.note, { color: colors.textSecondary }]}>
                <Text style={{ fontWeight: 'bold' }}>{bt.fileLocation}</Text>{bt.folderOn('OneDrive')}
              </Text>
              <Text style={[styles.note, { marginTop: 4, color: '#2E7D32', fontWeight: '500' }]}>
                {bt.onlyYou}
              </Text>
            </View>
          </>
        )}

        {!odConnected && (
          <Text style={[styles.notConnectedHint, { color: colors.textMuted }]}>
            {bt.connectHint('Microsoft')}
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
                {dbConnected ? bt.connected : bt.notConnected}
              </Text>
            </View>
          </View>
          {dbConnected ? (
            <TouchableOpacity onPress={handleDBDisconnect} style={styles.disconnectBtn}>
              <Text style={styles.disconnectText}>{bt.disconnect}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={dbSignIn} style={styles.connectBtn}>
              <Text style={styles.connectText}>{bt.connect}</Text>
            </TouchableOpacity>
          )}
        </View>

        {dbError && <Text style={styles.errorText}>{bt.error(dbError)}</Text>}

        {dbConnected && (
          <>
            <View style={styles.infoRow}>
              <Ionicons name="time-outline" size={16} color={colors.textMuted} style={{ marginRight: 8 }} />
              <Text style={[styles.infoText, { color: colors.textMuted }]}>
              {globalUpload.dropbox
                  ? <Text>{bt.uploadingWait}<Text style={{ color: colors.blue, fontWeight: '600' }}>{bt.nUploaded(globalUpload.dropbox.current, globalUpload.dropbox.total)}</Text></Text>
                  : globalRestore.dropbox
                    ? <Text>{bt.restoringWait}<Text style={{ color: colors.blue, fontWeight: '600' }}>{bt.nRestored(globalRestore.dropbox.current, globalRestore.dropbox.total)}</Text></Text>
                    : dbLastBackup ? bt.lastBackup(dbLastBackup) : bt.noBackupYet('Dropbox')
                }
              </Text>
            </View>
            <TouchableOpacity style={styles.backupBtn} onPress={handleDBBackup} disabled={cloudBusy || dbSyncing || dbRestoring} activeOpacity={0.85}>
              {dbSyncing ? (
                <>
                  <ActivityIndicator color="#fff" size="small" style={{ marginRight: 8 }} />
                  <Text style={styles.backupBtnText}>{bt.backingUp}</Text>
                </>
              ) : (
                <>
                  <Ionicons name="cloud-upload-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
                  <Text style={styles.backupBtnText}>{bt.backUpTo('Dropbox')}</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={[styles.restoreBtn, { backgroundColor: colors.blueTint }]} onPress={handleDBRestore} disabled={cloudBusy || dbSyncing || dbRestoring} activeOpacity={0.85}>
              {dbRestoring ? (
                <>
                  <ActivityIndicator color={colors.blue} size="small" style={{ marginRight: 8 }} />
                  <Text style={[styles.restoreBtnText, { color: colors.blue }]}>{bt.restoring}</Text>
                </>
              ) : (
                <>
                  <Ionicons name="cloud-download-outline" size={18} color={colors.blue} style={{ marginRight: 8 }} />
                  <Text style={[styles.restoreBtnText, { color: colors.blue }]}>{bt.restoreFrom('Dropbox')}</Text>
                </>
              )}
            </TouchableOpacity>
            <View style={{ paddingHorizontal: 20 }}>
              <Text style={[styles.note, { color: colors.textSecondary }]}>
                <Text style={{ fontWeight: 'bold' }}>{bt.fileLocation}</Text>{bt.folderOn('Dropbox')}
              </Text>
              <Text style={[styles.note, { marginTop: 4, color: '#2E7D32', fontWeight: '500' }]}>
                {bt.onlyYou}
              </Text>
            </View>
          </>
        )}

        {!dbConnected && (
          <Text style={[styles.notConnectedHint, { color: colors.textMuted }]}>
            {bt.connectHint('Dropbox')}
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
