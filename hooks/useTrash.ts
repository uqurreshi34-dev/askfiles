import { useState, useEffect, useCallback } from 'react';
import * as FileSystem from 'expo-file-system';
import RNFS from 'react-native-fs';

const TRASH_DIR = FileSystem.Paths.document.uri.endsWith('/')
  ? FileSystem.Paths.document.uri + 'trash/'
  : FileSystem.Paths.document.uri + '/trash/';

const TRASH_META = TRASH_DIR + '.meta.json';
const TRASH_EXPIRY_DAYS = 30;

export interface TrashFile {
  name: string;
  uri: string;
  size: number;
  deletedAt: number;
  originalUri: string;
}

async function ensureTrashDir() {
  try {
    const dir = new FileSystem.Directory(TRASH_DIR);
    if (!dir.exists) dir.create();
  } catch {}
}

async function readMeta(): Promise<Record<string, { originalUri: string; deletedAt: number }>> {
  try {
    const file = new FileSystem.File(TRASH_META);
    if (!file.exists) return {};
    const text = await file.text();
    return JSON.parse(text);
  } catch {
    return {};
  }
}

async function writeMeta(meta: Record<string, { originalUri: string; deletedAt: number }>) {
  try {
    const file = new FileSystem.File(TRASH_META);
    file.write(JSON.stringify(meta));
  } catch {}
}

export function useTrash() {
  const [files, setFiles] = useState<TrashFile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    ensureTrashDir().then(() => {
      loadFiles();
      purgeExpired();
    });
  }, []);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    try {
      const meta = await readMeta();
      const dir = new FileSystem.Directory(TRASH_DIR);
      const contents = dir.list();
      const trashFiles: TrashFile[] = contents
        .filter(item => item instanceof FileSystem.File && !item.name.startsWith('.'))
        .map(item => {
          const file = item as FileSystem.File;
          const info = meta[file.name] ?? { originalUri: '', deletedAt: Date.now() };
          return {
            name: file.name,
            uri: file.uri,
            size: file.size ?? 0,
            deletedAt: info.deletedAt,
            originalUri: info.originalUri,
          };
        })
        .sort((a, b) => b.deletedAt - a.deletedAt);
      setFiles(trashFiles);
    } catch {
      setFiles([]);
    } finally {
        setLoading(false);
      }
    }, []);

  async function moveToTrash(sourceUri: string, fileName: string): Promise<boolean> {
    try {
      await ensureTrashDir();
      // Handle duplicate names in trash
      let destName = fileName;
      let destUri = TRASH_DIR + destName;
      let counter = 1;
      while (new FileSystem.File(destUri).exists) {
        const ext = fileName.includes('.') ? '.' + fileName.split('.').pop() : '';
        const base = fileName.includes('.') ? fileName.slice(0, fileName.lastIndexOf('.')) : fileName;
        destName = `${base}(${counter})${ext}`;
        destUri = TRASH_DIR + destName;
        counter++;
      }
      // Move file to trash
      // Handle both file:// and content:// URIs
      let srcPath = sourceUri;
      if (sourceUri.startsWith('content://')) {
        // Get real path from content URI
        const realPath = await RNFS.stat(sourceUri).then(s => s.path).catch(() => null);
        if (!realPath) return false;
        srcPath = realPath;
      } else {
        try {
          srcPath = decodeURIComponent(sourceUri.replace('file://', ''));
        } catch {
          srcPath = sourceUri.replace('file://', '');
        }
      }
      await RNFS.moveFile(
        srcPath,
        decodeURIComponent(destUri.replace('file://', ''))
      );
      // Update metadata
      const meta = await readMeta();
      meta[destName] = { originalUri: sourceUri, deletedAt: Date.now() };
      await writeMeta(meta);
      await loadFiles();
      return true;
    } catch {
      return false;
    }
  }

  async function restoreFile(file: TrashFile): Promise<boolean> {
    try {
      const destUri = file.originalUri;
      const destPath = (() => { try { return decodeURIComponent(destUri.replace('file://', '')); } catch { return destUri.replace('file://', ''); } })();
      const srcPath = (() => { try { return decodeURIComponent(file.uri.replace('file://', '')); } catch { return file.uri.replace('file://', ''); } })();
      // Check if original location still exists as a directory
      const destDir = destPath.substring(0, destPath.lastIndexOf('/'));
      const dirExists = await RNFS.exists(destDir);
      if (!dirExists) {
        // Restore to Downloads if original path gone
        const fallback = `/storage/emulated/0/Download/${file.name}`;
        await RNFS.moveFile(srcPath, fallback);
      } else {
        await RNFS.moveFile(srcPath, destPath);
      }
      // Remove from metadata
      const meta = await readMeta();
      delete meta[file.name];
      await writeMeta(meta);
      await loadFiles();
      return true;
    } catch {
      return false;
    }
  }

  async function deletePermanently(file: TrashFile): Promise<boolean> {
    try {
      const f = new FileSystem.File(file.uri);
      f.delete();
      const meta = await readMeta();
      delete meta[file.name];
      await writeMeta(meta);
      await loadFiles();
      return true;
    } catch {
      return false;
    }
  }

  async function emptyTrash(): Promise<void> {
    try {
      const meta = await readMeta();
      const dir = new FileSystem.Directory(TRASH_DIR);
      const contents = dir.list();
      for (const item of contents) {
        if (item instanceof FileSystem.File && !item.name.startsWith('.')) {
          item.delete();
        }
      }
      await writeMeta({});
      await loadFiles();
    } catch {}
  }

  async function purgeExpired() {
    try {
      const meta = await readMeta();
      const now = Date.now();
      const expiry = TRASH_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
      let changed = false;
      for (const [name, info] of Object.entries(meta)) {
        if (now - info.deletedAt > expiry) {
          try {
            const f = new FileSystem.File(TRASH_DIR + name);
            if (f.exists) f.delete();
            delete meta[name];
            changed = true;
          } catch {}
        }
      }
      if (changed) await writeMeta(meta);
    } catch {}
  }

  function formatDaysLeft(deletedAt: number): string {
    const days = TRASH_EXPIRY_DAYS - Math.floor((Date.now() - deletedAt) / 86400000);
    if (days <= 0) return 'Expiring soon';
    if (days === 1) return 'Expires tomorrow';
    return `Expires in ${days} days`;
  }

  return {
    files,
    loading,
    moveToTrash,
    restoreFile,
    deletePermanently,
    emptyTrash,
    loadFiles,
    formatDaysLeft,
    trashDir: TRASH_DIR,
  };
}
