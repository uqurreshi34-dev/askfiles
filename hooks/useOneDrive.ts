import { useState, useEffect } from 'react';
import { makeRedirectUri, useAuthRequest, exchangeCodeAsync } from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import * as FileSystemLegacy from 'expo-file-system/legacy';

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

function getMimeTypeFromName(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    gif: 'image/gif', webp: 'image/webp', heic: 'image/heic',
    mp4: 'video/mp4', pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    txt: 'text/plain',
  };
  return map[ext ?? ''] ?? 'application/octet-stream';
}

export function useOneDrive() {
  const [isConnected, setIsConnected] = useState(false);
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      console.log('Token exchange error:', e);
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
    const base64 = await FileSystemLegacy.readAsStringAsync(fileUri, {
      encoding: FileSystemLegacy.EncodingType.Base64,
    });

    // Convert base64 to binary string for upload
    const binaryStr = atob(base64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    const mimeType = getMimeTypeFromName(fileName);

    // OneDrive approot — special folder only this app can access
    await fetch(
      `https://graph.microsoft.com/v1.0/me/drive/special/approot:/${encodeURIComponent(fileName)}:/content`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': mimeType,
        },
        body: bytes,
      }
    );
  }

  async function backupVault(vaultDir: string): Promise<boolean> {
    setSyncing(true);
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

      for (const file of files) {
        await uploadFileToOneDrive(token, file.name, file.uri);
      }

      const now = new Date().toLocaleString();
      await AsyncStorage.setItem(LAST_BACKUP_KEY, now);
      setLastBackup(now);
      return true;
    } catch (e) {
      console.log('Backup error:', e instanceof Error ? e.message : String(e));
      setError('Backup failed. Check your connection and try again.');
      return false;
    } finally {
      setSyncing(false);
    }
  }

  async function restoreVault(vaultDir: string): Promise<number> {
    setRestoring(true);
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

      let restored = 0;
      for (const driveFile of oneDriveFiles) {
        const destUri = vaultDir + driveFile.name;
        const destFile = new FileSystem.File(destUri);
        if (destFile.exists) continue;

        const dlRes = await fetch(driveFile['@microsoft.graph.downloadUrl']);
        const blob = await dlRes.blob();
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });

        await FileSystemLegacy.writeAsStringAsync(destUri, base64, {
          encoding: FileSystemLegacy.EncodingType.Base64,
        });
        restored++;
      }
      return restored;
    } catch (e) {
      console.log('Restore error:', e instanceof Error ? e.message : String(e));
      setError('Restore failed. Check your connection and try again.');
      return 0;
    } finally {
      setRestoring(false);
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
    signIn,
    disconnect,
    backupVault,
    restoreVault,
  };
}
