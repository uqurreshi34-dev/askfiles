import { useState, useEffect } from 'react';
import { makeRedirectUri, useAuthRequest, exchangeCodeAsync } from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import * as FileSystemLegacy from 'expo-file-system/legacy';

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

export function useDropbox() {
  const [isConnected, setIsConnected] = useState(false);
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    const base64 = await FileSystemLegacy.readAsStringAsync(fileUri, {
      encoding: FileSystemLegacy.EncodingType.Base64,
    });

    const binaryStr = atob(base64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    // Dropbox upload — path is relative to app folder
    await fetch('https://content.dropboxapi.com/2/files/upload', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/octet-stream',
        'Dropbox-API-Arg': JSON.stringify({
          path: `/${fileName}`,
          mode: 'overwrite',
          autorename: false,
          mute: true,
        }),
      },
      body: bytes,
    });
  }

  async function backupVault(vaultDir: string): Promise<boolean> {
    setSyncing(true);
    setError(null);
    try {
      const token = await getAccessToken();
      if (!token) { setError('Not connected to Dropbox.'); return false; }

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
        await uploadFileToDropbox(token, file.name, file.uri);
      }

      const now = new Date().toLocaleString();
      await AsyncStorage.setItem(LAST_BACKUP_KEY, now);
      setLastBackup(now);
      return true;
    } catch {
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

      let restored = 0;
      for (const dropboxFile of dropboxFiles) {
        if (dropboxFile['.tag'] !== 'file') continue;
        const fileName = dropboxFile.name;
        const destUri = vaultDir + fileName;
        const destFile = new FileSystem.File(destUri);
        if (destFile.exists) continue;

        const dlRes = await fetch('https://content.dropboxapi.com/2/files/download', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Dropbox-API-Arg': JSON.stringify({ path: `/${fileName}` }),
          },
        });
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
    } catch {
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
