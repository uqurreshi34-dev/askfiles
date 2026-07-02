import { useState, useEffect } from 'react';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setCloudSyncing } from '@/hooks/useCloudSync';
import { uploadToGoogleDrive, downloadFile } from '@/modules/upload-manager';
import { setUploadProgress as setGlobalUploadProgress, setRestoreProgress as setGlobalRestoreProgress } from '@/hooks/useCloudProgress';
import { startUploadService, updateUploadService, stopUploadService } from '@/modules/upload-service';
import { exportSettings, importSettings, SettingsBundle } from '@/hooks/useSettingsSync';
import RNFS from 'react-native-fs';
const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';
const LAST_BACKUP_KEY = 'google_drive_last_backup';
const DRIVE_FOLDER_NAME = 'AskFiles';

GoogleSignin.configure({
  webClientId: WEB_CLIENT_ID,
  scopes: [
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/drive.appdata',
  ],
  offlineAccess: true,
});

export function useGoogleDrive() {
  const [isConnected, setIsConnected] = useState(false);
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const [restoreProgress, setRestoreProgress] = useState<{ current: number; total: number } | null>(null);

  useEffect(() => {
    checkSignInStatus();
  }, []);

  async function checkSignInStatus() {
    try {
      const user = await GoogleSignin.getCurrentUser();
      setIsConnected(!!user);
      const lastBackupVal = await AsyncStorage.getItem(LAST_BACKUP_KEY);
      setLastBackup(lastBackupVal);
    } catch {
      setIsConnected(false);
    } finally {
      setLoading(false);
    }
  }

  async function getAccessToken(): Promise<string | null> {
    try {
      const tokens = await GoogleSignin.getTokens();
      return tokens.accessToken;
    } catch {
      return null;
    }
  }

  async function signIn() {
    setError(null);
    try {
      await GoogleSignin.hasPlayServices();
      await GoogleSignin.signIn();
      setIsConnected(true);
      const lastBackupVal = await AsyncStorage.getItem(LAST_BACKUP_KEY);
      setLastBackup(lastBackupVal);
    } catch (e: any) {
      if (e.code === statusCodes.SIGN_IN_CANCELLED) return;
      if (e.code === statusCodes.IN_PROGRESS) return;
      setError('Google sign-in failed. Try again.');
    }
  }

  async function disconnect() {
    try {
      await GoogleSignin.signOut();
    } catch {}
    setIsConnected(false);
  }

  async function getOrCreateFolder(token: string): Promise<string | null> {
    try {
      const searchRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=name='${DRIVE_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id,name)`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const searchData = await searchRes.json();
      if (searchData.files?.length > 0) return searchData.files[0].id;

      const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: DRIVE_FOLDER_NAME,
          mimeType: 'application/vnd.google-apps.folder',
        }),
      });
      const createData = await createRes.json();
      return createData.id ?? null;
    } catch {
      return null;
    }
  }

  async function uploadFileToDrive(
    token: string,
    folderId: string,
    fileName: string,
    fileUri: string,
    existingFileId?: string
  ): Promise<void> {
    const path = (() => {
      try { return decodeURIComponent(fileUri.replace('file://', '')); }
      catch { return fileUri.replace('file://', ''); }
    })();

    const result = await uploadToGoogleDrive(path, token, folderId, fileName, existingFileId ?? '');
    if (result === 'storage_full') throw new Error('storage_full');
    if (result !== 'success') throw new Error('upload_failed');
  }

  async function backupVault(vaultDir: string): Promise<boolean> {
    setSyncing(true);
    setCloudSyncing(true);
    setError(null);
    try {
      const token = await getAccessToken();
      if (!token) { setError('Not connected to Google Drive.'); return false; }

      const folderId = await getOrCreateFolder(token);
      if (!folderId) { setError('Could not create Drive folder.'); return false; }

      const dir = new FileSystem.Directory(vaultDir);
      const contents = dir.list();
      const files = contents.filter(
        item => item instanceof FileSystem.File && !item.name.startsWith('.')
      ) as FileSystem.File[];

      if (files.length === 0) {
        // Still upload settings even if vault is empty
        const settings = await exportSettings();
        const settingsJson = JSON.stringify(settings);
        const settingsPath = `${RNFS.CachesDirectoryPath}/askfiles_settings.json`;
        await RNFS.writeFile(settingsPath, settingsJson, 'utf8');
        const existsRes2 = await fetch(
          `https://www.googleapis.com/drive/v3/files?q=name='askfiles_settings.json' and '${folderId}' in parents and trashed=false&fields=files(id)`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const existsData2 = await existsRes2.json();
        const existingSettingsId = existsData2.files?.[0]?.id;
        await uploadFileToDrive(token, folderId, 'askfiles_settings.json', settingsPath, existingSettingsId);
        const now = new Date().toLocaleString();
        await AsyncStorage.setItem(LAST_BACKUP_KEY, now);
        setLastBackup(now);
        return true;
      }

      setUploadProgress({ current: 0, total: files.length });
      setGlobalUploadProgress('google', { current: 0, total: files.length });
      startUploadService(`Backing up to Google Drive — 0/${files.length} files`);

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const existsRes = await fetch(
          `https://www.googleapis.com/drive/v3/files?q=name='${file.name}' and '${folderId}' in parents and trashed=false&fields=files(id)`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const existsData = await existsRes.json();
        const existingId = existsData.files?.[0]?.id;

        await uploadFileToDrive(token, folderId, file.name, file.uri, existingId);
        setUploadProgress({ current: i + 1, total: files.length });
        setGlobalUploadProgress('google', { current: i + 1, total: files.length });
        updateUploadService(`Backing up to Google Drive — ${i + 1}/${files.length} files`);
      }

      // Upload settings JSON
      const settings = await exportSettings();
      const settingsJson = JSON.stringify(settings);
      const settingsPath = `${RNFS.CachesDirectoryPath}/askfiles_settings.json`;
      await RNFS.writeFile(settingsPath, settingsJson, 'utf8');
      const existsRes2 = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=name='askfiles_settings.json' and '${folderId}' in parents and trashed=false&fields=files(id)`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const existsData2 = await existsRes2.json();
      const existingSettingsId = existsData2.files?.[0]?.id;
      await uploadFileToDrive(token, folderId, 'askfiles_settings.json', settingsPath, existingSettingsId);

      const now = new Date().toLocaleString();
      await AsyncStorage.setItem(LAST_BACKUP_KEY, now);
      setLastBackup(now);
      return true;
    } catch (e: any) {
      if (e?.message === 'storage_full') {
        setError('Backup failed. Your Google Drive storage may be full. Check your available space and try again.');
      } else {
        setError('Backup failed. Check your connection and try again.');
      }
      return false;
    } finally {
      setSyncing(false);
      setCloudSyncing(false);
      setUploadProgress(null);
      setGlobalUploadProgress('google', null);
      stopUploadService();
    }
  }

  async function restoreVault(vaultDir: string, scope: 'all' | 'files' | 'settings' = 'all'): Promise<number> {
    setRestoring(true);
    setCloudSyncing(true);
    setError(null);
    try {
      const token = await getAccessToken();
      if (!token) { setError('Not connected to Google Drive.'); return 0; }

      const folderId = await getOrCreateFolder(token);
      if (!folderId) { setError('No backup found.'); return 0; }

      const listRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?q='${folderId}' in parents and trashed=false&fields=files(id,name,size)`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const listData = await listRes.json();
      const driveFiles = listData.files ?? [];
      const fileEntries = driveFiles.filter((f: any) => f.mimeType !== 'application/vnd.google-apps.folder');
      const filesToRestore = fileEntries.filter((f: any) => {
        if (f.name === 'askfiles_settings.json') return false;
        const destFile = new FileSystem.File(vaultDir + f.name);
        return !destFile.exists;
      });
      setRestoreProgress({ current: 0, total: filesToRestore.length });
      setGlobalRestoreProgress('google', { current: 0, total: filesToRestore.length });
      startUploadService(`Restoring from Google Drive — 0/${filesToRestore.length} files`);

      let restored = 0;
      let restoreIndex = 0;
      if (scope !== 'settings') {
      for (const driveFile of driveFiles) {
        if (driveFile.mimeType === 'application/vnd.google-apps.folder') continue;
        if (driveFile.name === 'askfiles_settings.json') continue;
        const destUri = vaultDir + driveFile.name;
        const destFile = new FileSystem.File(destUri);
        if (destFile.exists) continue;
        restoreIndex++;
        setRestoreProgress({ current: restoreIndex, total: filesToRestore.length });
        setGlobalRestoreProgress('google', { current: restoreIndex, total: filesToRestore.length });
        updateUploadService(`Restoring from Google Drive — ${restoreIndex}/${filesToRestore.length} files`);

        const destPath = (() => {
          try { return decodeURIComponent(destUri.replace('file://', '')); }
          catch { return destUri.replace('file://', ''); }
        })();

        const dlResult = await downloadFile(
          `https://www.googleapis.com/drive/v3/files/${driveFile.id}?alt=media`,
          { Authorization: `Bearer ${token}` },
          destPath
        );
        if (dlResult !== 'success') continue;
        restored++;
      }
      }

      // Download and apply settings
      if (scope !== 'files') {
      const settingsFile = driveFiles.find((f: any) => f.name === 'askfiles_settings.json');
      if (settingsFile) {
        const settingsPath = `${RNFS.CachesDirectoryPath}/askfiles_settings.json`;
        const dlSettings = await downloadFile(
          `https://www.googleapis.com/drive/v3/files/${settingsFile.id}?alt=media`,
          { Authorization: `Bearer ${token}` },
          settingsPath
        );
        if (dlSettings === 'success') {
          try {
            const raw = await RNFS.readFile(settingsPath, 'utf8');
            const bundle: SettingsBundle = JSON.parse(raw);
            importSettings(bundle);
          } catch {}
        }
      }
    }

      return restored;
    } catch (e) {
      setError('Restore failed. Check your connection and try again.');
      return 0;
    } finally {
      setRestoring(false);
      setCloudSyncing(false);
      setRestoreProgress(null);
      setGlobalRestoreProgress('google', null);
      stopUploadService();
    }
  }

  return {
    isConnected,
    lastBackup,
    loading,
    syncing,
    restoring,
    error,
    uploadProgress,
    restoreProgress,
    signIn,
    disconnect,
    backupVault,
    restoreVault,
  };
}
