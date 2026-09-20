import { useState, useEffect } from 'react';
import * as FileSystem from 'expo-file-system';
import { removeFavourite } from '@/hooks/useFavourites';
import { recordActivity, readableFolder } from '@/modules/activityLog';

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

    /**
   * Is a name already taken in the vault?
   *
   * addToVault cannot say why it failed -- it catches everything and
   * returns false -- so "Could not move file to vault" covers a name
   * clash, a permission problem and a full disk alike. Asking first is
   * what lets the screen say something useful.
   */
    async function vaultHas(fileName: string): Promise<boolean> {
      try {
        return new FileSystem.File(VAULT_DIR + fileName).exists;
      } catch {
        return false;
      }
    }
  
    /**
     * Every name in the vault, for checking a batch.
     *
     * One listing and a Set, rather than one filesystem call per selected
     * file. Moving 200 files then costs one directory read, not 200 stats.
     */
    async function vaultFileNames(): Promise<Set<string>> {
      try {
        const dir = new FileSystem.Directory(VAULT_DIR);
  
        return new Set(
          dir.list()
            .filter(item => item instanceof FileSystem.File)
            .map(item => item.name)
        );
      } catch {
        return new Set();
      }
    }

  async function addToVault(sourceUri: string, fileName: string, refresh: boolean = true): Promise<boolean> {
    try {
      const destUri = VAULT_DIR + fileName;
      const src = new FileSystem.File(sourceUri);
      const dst = new FileSystem.File(destUri);
      src.move(dst);
      await removeFavourite(sourceUri);
      if (refresh) await loadFiles();

      await recordActivity({
        action: 'moved',
        name: fileName,
        from: readableFolder(sourceUri),
        to: 'Vault',
        source: 'Vault',
      });

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

      await recordActivity({
        action: 'deleted',
        name: file.name,
        from: 'Vault',
        source: 'Vault',
      });

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
    vaultHas,
    vaultFileNames,
    loadFiles,
    lock,
    vaultDir: VAULT_DIR,
  };
}
