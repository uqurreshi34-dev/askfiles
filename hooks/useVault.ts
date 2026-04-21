import { useState, useEffect } from 'react';
import * as FileSystem from 'expo-file-system';
import * as LocalAuthentication from 'expo-local-authentication';
import { removeFavourite } from '@/hooks/useFavourites';

const VAULT_DIR = FileSystem.Paths.document.uri.endsWith('/')
  ? FileSystem.Paths.document.uri + 'vault/'
  : FileSystem.Paths.document.uri + '/vault/';

export interface VaultFile {
  name: string;
  uri: string;
  size: number;
  addedAt: number;
}

export function useVault() {
  const [files, setFiles] = useState<VaultFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    ensureVaultDir();
  }, []);

  async function ensureVaultDir() {
    try {
      const dir = new FileSystem.Directory(VAULT_DIR);
      if (!dir.exists) {
        dir.create();
      }
    } catch {}
  }

  async function authenticate(): Promise<boolean> {
    setAuthError(null);
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();

      if (!hasHardware || !isEnrolled) {
        setAuthError('Biometrics not available on this device.');
        return false;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Authenticate to access your Vault',
        cancelLabel: 'Cancel',
        fallbackLabel: 'Use PIN',
        disableDeviceFallback: false,
      });

      if (result.success) {
        setAuthenticated(true);
        await loadFiles();
        return true;
      } else {
        setAuthError('Authentication failed. Try again.');
        return false;
      }
    } catch (e) {
      setAuthError('Authentication error. Try again.');
      return false;
    }
  }

  async function loadFiles() {
    setLoading(true);
    try {
      const dir = new FileSystem.Directory(VAULT_DIR);
      const contents = dir.list();
      const vaultFiles: VaultFile[] = contents
        .filter(item => item instanceof FileSystem.File && !item.name.startsWith('.'))
        .map(item => {
          const file = item as FileSystem.File;
          return {
            name: file.name,
            uri: file.uri,
            size: file.size ?? 0,
            addedAt: Date.now(),
          };
        });
      setFiles(vaultFiles);
    } catch {
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }

  async function addToVault(sourceUri: string, fileName: string): Promise<boolean> {
    try {
      const destUri = VAULT_DIR + fileName;
      const src = new FileSystem.File(sourceUri);
      const dst = new FileSystem.File(destUri);
      src.move(dst);
      await removeFavourite(sourceUri);
      await loadFiles();
      return true;
    } catch {
      return false;
    }
  }

  async function removeFromVault(file: VaultFile, destDir: string): Promise<boolean> {
    try {
      const destUri = destDir.endsWith('/') ? destDir + file.name : destDir + '/' + file.name;
      const src = new FileSystem.File(file.uri);
      const dst = new FileSystem.File(destUri);
      // Copy first, then delete source — move fails across filesystem boundaries
      src.copy(dst);
      src.delete();
      await loadFiles();
      return true;
    } catch (e) {
      console.log('removeFromVault error:', e);
      return false;
    }
  }

  async function deleteFromVault(file: VaultFile): Promise<boolean> {
    try {
      const f = new FileSystem.File(file.uri);
      f.delete();
      await loadFiles();
      return true;
    } catch {
      return false;
    }
  }

  function lock() {
    setAuthenticated(false);
    setFiles([]);
  }

  return {
    files,
    loading,
    authenticated,
    authError,
    authenticate,
    addToVault,
    removeFromVault,
    deleteFromVault,
    lock,
    vaultDir: VAULT_DIR,
  };
}
