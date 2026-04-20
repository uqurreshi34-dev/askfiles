import { useState, useEffect } from 'react';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import * as FileSystem from 'expo-file-system';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';

const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';
const LAST_BACKUP_KEY = 'google_drive_last_backup';
const DRIVE_FOLDER_NAME = 'AskFiles Backup';

GoogleSignin.configure({
  webClientId: WEB_CLIENT_ID,
  scopes: [
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/drive.appdata',
  ],
  offlineAccess: true,
});

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

export function useGoogleDrive() {
  const [isConnected, setIsConnected] = useState(false);
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    const base64 = await FileSystemLegacy.readAsStringAsync(fileUri, {
      encoding: FileSystemLegacy.EncodingType.Base64,
    });
    const mimeType = getMimeTypeFromName(fileName);
    const boundary = 'askfiles_multipart_boundary';
    const metadata = JSON.stringify({
      name: fileName,
      ...(existingFileId ? {} : { parents: [folderId] }),
    });

    const body =
      `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${metadata}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: ${mimeType}\r\n` +
      `Content-Transfer-Encoding: base64\r\n\r\n` +
      `${base64}\r\n` +
      `--${boundary}--`;

    const url = existingFileId
      ? `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart`
      : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`;

    await fetch(url, {
      method: existingFileId ? 'PATCH' : 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    });
  }

  async function backupVault(vaultDir: string): Promise<boolean> {
    setSyncing(true);
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
        setError('No files in vault to back up.');
        return false;
      }

      for (const file of files) {
        const existsRes = await fetch(
          `https://www.googleapis.com/drive/v3/files?q=name='${file.name}' and '${folderId}' in parents and trashed=false&fields=files(id)`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const existsData = await existsRes.json();
        const existingId = existsData.files?.[0]?.id;

        await uploadFileToDrive(token, folderId, file.name, file.uri, existingId);
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
      if (!token) { setError('Not connected to Google Drive.'); return 0; }

      const folderId = await getOrCreateFolder(token);
      if (!folderId) { setError('No backup found.'); return 0; }

      const listRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?q='${folderId}' in parents and trashed=false&fields=files(id,name,size)`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const listData = await listRes.json();
      const driveFiles = listData.files ?? [];

      let restored = 0;
      for (const driveFile of driveFiles) {
        const destUri = vaultDir + driveFile.name;
        const destFile = new FileSystem.File(destUri);
        if (destFile.exists) continue;

        const dlRes = await fetch(
          `https://www.googleapis.com/drive/v3/files/${driveFile.id}?alt=media`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
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
    signIn,
    disconnect,
    backupVault,
    restoreVault,
  };
}
