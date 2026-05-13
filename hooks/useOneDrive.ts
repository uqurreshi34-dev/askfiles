import { useState, useEffect } from 'react';
import { makeRedirectUri, useAuthRequest, exchangeCodeAsync } from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import { setCloudSyncing } from '@/hooks/useCloudSync';
import { uploadToOneDrive, downloadFile } from '@/modules/upload-manager';
import { setUploadProgress as setGlobalUploadProgress, setRestoreProgress as setGlobalRestoreProgress } from '@/hooks/useCloudProgress';

WebBrowser.maybeCompleteAuthSession();

const CLIENT_ID = process.env.EXPO_PUBLIC_ONEDRIVE_CLIENT_ID ?? '';
const TENANT = 'consumers'; // personal Microsoft accounts
const SCOPES = ['Files.ReadWrite.AppFolder', 'offline_access', 'User.Read'];
const TOKEN_KEY = 'onedrive_access_token';
const REFRESH_KEY = 'onedrive_refresh_token';
const LAST_BACKUP_KEY = 'onedrive_last_backup';

const discovery = {
  authorizationEndpoint: `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/authorize`,
  tokenEndpoint: `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`,
};

const redirectUri = makeRedirectUri({ scheme: 'askfiles', path: 'callback' });
//const redirectUri = 'askfiles://callback';

export function useOneDrive() {
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
      scopes: SCOPES,
      redirectUri,
      responseType: 'code',
      usePKCE: true,
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
    } catch (e) {
      setError('Microsoft sign-in failed. Try again.');
    }
  }

  async function getAccessToken(): Promise<string | null> {
    try {
      // Try stored access token first
      const token = await AsyncStorage.getItem(TOKEN_KEY);
      if (token) return token;

      // Try refresh token
      const refreshToken = await AsyncStorage.getItem(REFRESH_KEY);
      if (!refreshToken) return null;

      const res = await fetch(discovery.tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: CLIENT_ID,
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          scope: SCOPES.join(' '),
        }).toString(),
      });
      const data = await res.json();
      if (data.access_token) {
        await AsyncStorage.setItem(TOKEN_KEY, data.access_token);
        if (data.refresh_token) {
          await AsyncStorage.setItem(REFRESH_KEY, data.refresh_token);
        }
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

  async function uploadFileToOneDrive(
    token: string,
    fileName: string,
    fileUri: string,
  ): Promise<void> {
    const path = (() => {
      try { return decodeURIComponent(fileUri.replace('file://', '')); }
      catch { return fileUri.replace('file://', ''); }
    })();

    const result = await uploadToOneDrive(path, token, fileName);
    if (result === 'storage_full') throw new Error('storage_full');
    if (result !== 'success') throw new Error('upload_failed');
  }

  async function backupVault(vaultDir: string): Promise<boolean> {
    setSyncing(true);
    setCloudSyncing(true);
    setError(null);
    try {
      const token = await getAccessToken();
      if (!token) { setError('Not connected to OneDrive.'); return false; }

      const dir = new FileSystem.Directory(vaultDir);
      const contents = dir.list();
      const files = contents.filter(
        item => item instanceof FileSystem.File && !item.name.startsWith('.')
      ) as FileSystem.File[];

      if (files.length === 0) {
        setError('No files in vault to back up.');
        return false;
      }

      setUploadProgress({ current: 0, total: files.length });
      setGlobalUploadProgress('onedrive', { current: 0, total: files.length });

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        await uploadFileToOneDrive(token, file.name, file.uri);
        setUploadProgress({ current: i + 1, total: files.length });
        setGlobalUploadProgress('onedrive', { current: i + 1, total: files.length });
      }

      const now = new Date().toLocaleString();
      await AsyncStorage.setItem(LAST_BACKUP_KEY, now);
      setLastBackup(now);
      return true;
    } catch (e: any) {
      if (e?.message === 'storage_full') {
        setError('Backup failed. Your OneDrive storage may be full. Check your available space and try again.');
      } else {
        setError('Backup failed. Check your connection and try again.');
      }
      return false;
    } finally {
      setSyncing(false);
      setCloudSyncing(false);
      setUploadProgress(null);
      setGlobalUploadProgress('onedrive', null);
    }
  }

  async function restoreVault(vaultDir: string): Promise<number> {
    setRestoring(true);
    setCloudSyncing(true);
    setError(null);
    try {
      const token = await getAccessToken();
      if (!token) { setError('Not connected to OneDrive.'); return 0; }

      const listRes = await fetch(
        'https://graph.microsoft.com/v1.0/me/drive/special/approot/children',
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const listData = await listRes.json();
      const oneDriveFiles = listData.value ?? [];
      const fileEntries = oneDriveFiles.filter((f: any) => !f.folder);
      const filesToRestore = fileEntries.filter((f: any) => {
        const destFile = new FileSystem.File(vaultDir + f.name);
        return !destFile.exists;
      });
      setRestoreProgress({ current: 0, total: filesToRestore.length });
      setGlobalRestoreProgress('onedrive', { current: 0, total: filesToRestore.length });

      let restored = 0;
      let restoreIndex = 0;
      for (const driveFile of oneDriveFiles) {
        if (driveFile.folder) continue;
        const destUri = vaultDir + driveFile.name;
        const destFile = new FileSystem.File(destUri);
        if (destFile.exists) continue;
        restoreIndex++;
        setRestoreProgress({ current: restoreIndex, total: filesToRestore.length });
        setGlobalRestoreProgress('onedrive', { current: restoreIndex, total: filesToRestore.length });

        const destPath = (() => {
          try { return decodeURIComponent(destUri.replace('file://', '')); }
          catch { return destUri.replace('file://', ''); }
        })();

        const dlResult = await downloadFile(
          driveFile['@microsoft.graph.downloadUrl'],
          {},
          destPath
        );
        if (dlResult !== 'success') continue;
        restored++;
      }
      return restored;
    } catch (e) {
      setError('Restore failed. Check your connection and try again.');
      return 0;
    } finally {
      setRestoring(false);
      setCloudSyncing(false);
      setRestoreProgress(null);
      setGlobalRestoreProgress('onedrive', null);
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
