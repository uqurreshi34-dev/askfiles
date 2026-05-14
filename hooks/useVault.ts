import { useState, useEffect } from 'react';
import * as FileSystem from 'expo-file-system';
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

  async function unlockVault(): Promise<void> {
    setAuthenticated(true);
    await loadFiles();
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
      src.move(dst);
      await loadFiles();
      return true;
    } catch (e) {
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
    unlockVault,
    addToVault,
    removeFromVault,
    deleteFromVault,
    loadFiles,
    lock,
    vaultDir: VAULT_DIR,
  };
}
