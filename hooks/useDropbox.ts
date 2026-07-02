import { useState, useEffect } from 'react';
import { makeRedirectUri, useAuthRequest, exchangeCodeAsync } from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import { setCloudSyncing } from '@/hooks/useCloudSync';
import { uploadToDropbox, downloadFile } from '@/modules/upload-manager';
import { setUploadProgress as setGlobalUploadProgress, setRestoreProgress as setGlobalRestoreProgress } from '@/hooks/useCloudProgress';
import { startUploadService, updateUploadService, stopUploadService } from '@/modules/upload-service';
import RNFS from 'react-native-fs';
import { exportSettings, importSettings, SettingsBundle } from '@/hooks/useSettingsSync';

WebBrowser.maybeCompleteAuthSession();

const CLIENT_ID = process.env.EXPO_PUBLIC_DROPBOX_CLIENT_ID ?? '';
const TOKEN_KEY = 'dropbox_access_token';
const REFRESH_KEY = 'dropbox_refresh_token';
const LAST_BACKUP_KEY = 'dropbox_last_backup';

const discovery = {
  authorizationEndpoint: 'https://www.dropbox.com/oauth2/authorize',
  tokenEndpoint: 'https://api.dropboxapi.com/oauth2/token',
};

const redirectUri = makeRedirectUri({ scheme: 'askfiles', path: 'callback' });

export function useDropbox() {
  const [isConnected, setIsConnected] = useState(false);
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const [restoreProgress, setRestoreProgress] = useState<{ current: number; total: number } | null>(null);

  const [request, response, promptAsync] = useAuthRequest(
    {
      clientId: CLIENT_ID,
      scopes: ['files.content.write', 'files.content.read'],
      redirectUri,
      responseType: 'code',
      usePKCE: true,
      extraParams: {
        token_access_type: 'offline', // required to get a refresh token from Dropbox
      },
    },
    discovery
  );

  useEffect(() => {
    checkSignInStatus();
  }, []);

  useEffect(() => {
    if (response?.type === 'success') {
      const { code } = response.params;
      handleCodeExchange(code);
    }
  }, [response]);

  async function checkSignInStatus() {
    try {
      const token = await AsyncStorage.getItem(TOKEN_KEY);
      setIsConnected(!!token);
      const lastBackupVal = await AsyncStorage.getItem(LAST_BACKUP_KEY);
      setLastBackup(lastBackupVal);
    } catch {
      setIsConnected(false);
    } finally {
      setLoading(false);
    }
  }

  async function handleCodeExchange(code: string) {
    try {
      const tokenResponse = await exchangeCodeAsync(
        {
          clientId: CLIENT_ID,
          code,
          redirectUri,
          extraParams: { code_verifier: request?.codeVerifier ?? '' },
        },
        discovery
      );
      await AsyncStorage.setItem(TOKEN_KEY, tokenResponse.accessToken);
      if (tokenResponse.refreshToken) {
        await AsyncStorage.setItem(REFRESH_KEY, tokenResponse.refreshToken);
      }
      setIsConnected(true);
      const lastBackupVal = await AsyncStorage.getItem(LAST_BACKUP_KEY);
      setLastBackup(lastBackupVal);
    } catch {
      setError('Dropbox sign-in failed. Try again.');
    }
  }

  async function getAccessToken(): Promise<string | null> {
    try {
      const token = await AsyncStorage.getItem(TOKEN_KEY);
      if (token) return token;

      const refreshToken = await AsyncStorage.getItem(REFRESH_KEY);
      if (!refreshToken) return null;

      const res = await fetch(discovery.tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: CLIENT_ID,
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }).toString(),
      });
      const data = await res.json();
      if (data.access_token) {
        await AsyncStorage.setItem(TOKEN_KEY, data.access_token);
        return data.access_token;
      }
      return null;
    } catch {
      return null;
    }
  }

  async function signIn() {
    setError(null);
    await promptAsync();
  }

  async function disconnect() {
    try {
      await AsyncStorage.removeItem(TOKEN_KEY);
      await AsyncStorage.removeItem(REFRESH_KEY);
    } catch {}
    setIsConnected(false);
  }

  async function uploadFileToDropbox(
    token: string,
    fileName: string,
    fileUri: string,
  ): Promise<void> {
    const path = (() => {
      try { return decodeURIComponent(fileUri.replace('file://', '')); }
      catch { return fileUri.replace('file://', ''); }
    })();

    const result = await uploadToDropbox(path, token, fileName);
    if (result === 'storage_full') throw new Error('storage_full');
    if (result !== 'success') throw new Error('upload_failed');
  }

  async function uploadSettingsOnly(token: string): Promise<void> {
    const settings = await exportSettings();
    const settingsJson = JSON.stringify(settings);
    const settingsPath = `${RNFS.CachesDirectoryPath}/askfiles_settings.json`;
    await RNFS.writeFile(settingsPath, settingsJson, 'utf8');
    await uploadFileToDropbox(token, 'askfiles_settings.json', settingsPath);
  }

  async function backupVault(vaultDir: string, scope: 'all' | 'files' | 'settings' = 'all'): Promise<boolean> {
    setSyncing(true);
    setCloudSyncing(true);
    setError(null);
    try {
      const token = await getAccessToken();
      if (!token) { setError('Not connected to Dropbox.'); return false; }

      if (scope === 'settings') {
        await uploadSettingsOnly(token);
        const now = new Date().toLocaleString();
        await AsyncStorage.setItem(LAST_BACKUP_KEY, now);
        setLastBackup(now);
        return true;
      }

      const dir = new FileSystem.Directory(vaultDir);
      const contents = dir.list();
      const files = contents.filter(
        item => item instanceof FileSystem.File && !item.name.startsWith('.')
      ) as FileSystem.File[];

      if (files.length === 0) {
        if (scope === 'files') { setError('No files in vault to back up.'); return false; }
        await uploadSettingsOnly(token);
        const now = new Date().toLocaleString();
        await AsyncStorage.setItem(LAST_BACKUP_KEY, now);
        setLastBackup(now);
        return true;
      }

      setUploadProgress({ current: 0, total: files.length });
      setGlobalUploadProgress('dropbox', { current: 0, total: files.length });
      startUploadService(`Backing up to Dropbox — 0/${files.length} files`);

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        await uploadFileToDropbox(token, file.name, file.uri);
        setUploadProgress({ current: i + 1, total: files.length });
        setGlobalUploadProgress('dropbox', { current: i + 1, total: files.length });
        updateUploadService(`Backing up to Dropbox — ${i + 1}/${files.length} files`);
      }

      if (scope === 'all') {
        await uploadSettingsOnly(token);
      }

      const now = new Date().toLocaleString();
      await AsyncStorage.setItem(LAST_BACKUP_KEY, now);
      setLastBackup(now);
      return true;
     } catch (e: any) {
      if (e?.message === 'storage_full') {
        setError('Backup failed. Your Dropbox storage may be full. Check your available space and try again.');
      } else {
        setError('Backup failed. Check your connection and try again.');
      }
      return false;
    }finally {
      setSyncing(false);
      setCloudSyncing(false);
      setUploadProgress(null);
      setGlobalUploadProgress('dropbox', null);
      stopUploadService();
    }
  }

  async function restoreVault(vaultDir: string, scope: 'all' | 'files' | 'settings' = 'all'): Promise<number> {
    setRestoring(true);
    setCloudSyncing(true);
    setError(null);
    try {
      const token = await getAccessToken();
      if (!token) { setError('Not connected to Dropbox.'); return 0; }

      const listRes = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ path: '' }),
      });
      const listData = await listRes.json();
      const dropboxFiles = listData.entries ?? [];
      const fileEntries = dropboxFiles.filter((f: any) => f['.tag'] === 'file');
      const filesToRestore = fileEntries.filter((f: any) => {
        if (f.name === 'askfiles_settings.json') return false;
        const destFile = new FileSystem.File(vaultDir + f.name);
        return !destFile.exists;
      });
      setRestoreProgress({ current: 0, total: filesToRestore.length });
      setGlobalRestoreProgress('dropbox', { current: 0, total: filesToRestore.length });
      startUploadService(`Restoring from Dropbox — 0/${filesToRestore.length} files`);

      let restored = 0;
      let restoreIndex = 0;
      if (scope !== 'settings') {
      for (const dropboxFile of dropboxFiles) {
        if (dropboxFile['.tag'] !== 'file') continue;
        if (dropboxFile.name === 'askfiles_settings.json') continue;
        const fileName = dropboxFile.name;
        const destUri = vaultDir + fileName;
        const destFile = new FileSystem.File(destUri);
        if (destFile.exists) continue;
        restoreIndex++;
        setRestoreProgress({ current: restoreIndex, total: filesToRestore.length });
        setGlobalRestoreProgress('dropbox', { current: restoreIndex, total: filesToRestore.length });
        updateUploadService(`Restoring from Dropbox — ${restoreIndex}/${filesToRestore.length} files`);

        const destPath = (() => {
          try { return decodeURIComponent(destUri.replace('file://', '')); }
          catch { return destUri.replace('file://', ''); }
        })();

        const dlResult = await downloadFile(
          'https://content.dropboxapi.com/2/files/download',
          {
            Authorization: `Bearer ${token}`,
            'Dropbox-API-Arg': JSON.stringify({ path: `/${fileName}` }),
          },
          destPath,
          'GET'
        );
        if (dlResult !== 'success') continue;
        restored++;
      }
     }

      // Download and apply settings
      if (scope !== 'files') {
      const settingsEntry = dropboxFiles.find((f: any) => f.name === 'askfiles_settings.json');
      if (settingsEntry) {
        const settingsPath = `${RNFS.CachesDirectoryPath}/askfiles_settings.json`;
        const dlSettings = await downloadFile(
          'https://content.dropboxapi.com/2/files/download',
          {
            Authorization: `Bearer ${token}`,
            'Dropbox-API-Arg': JSON.stringify({ path: '/askfiles_settings.json' }),
          },
          settingsPath,
          'GET'
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
    } catch {
      setError('Restore failed. Check your connection and try again.');
      return 0;
    } finally {
      setRestoring(false);
      setCloudSyncing(false);
      setRestoreProgress(null);
      setGlobalRestoreProgress('dropbox', null);
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
    request,
    uploadProgress,
    restoreProgress,
    signIn,
    disconnect,
    backupVault,
    restoreVault,
  };
}
