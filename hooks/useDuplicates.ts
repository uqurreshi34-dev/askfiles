import { useState } from 'react';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';

export interface DuplicateFile {
  name: string;
  uri: string;
  size: number;
}

export interface DuplicateGroup {
  key: string; // name_size
  name: string;
  size: number;
  files: DuplicateFile[];
}

const SCAN_DIRS = [
  'file:///storage/emulated/0/Download/',
  'file:///storage/emulated/0/Documents/',
  'file:///storage/emulated/0/Pictures/',
  'file:///storage/emulated/0/Movies/',
  'file:///storage/emulated/0/DCIM/',
  'file:///storage/emulated/0/Music/',
  'file:///storage/emulated/0/Android/media/',
];

function formatSize(bytes: number): string {
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + ' GB';
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
  if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return bytes + ' B';
}

async function scanDir(path: string, results: DuplicateFile[]) {
  try {
    const uri = path.endsWith('/') ? path : path + '/';
    const dir = new FileSystem.Directory(uri);
    const contents = dir.list();
    for (const item of contents) {
      if (item instanceof FileSystem.File) {
        if (!item.name.startsWith('.') && (item.size ?? 0) > 0) {
          results.push({ name: item.name, uri: item.uri, size: item.size ?? 0 });
        }
      } else if (item instanceof FileSystem.Directory) {
        const subUri = item.uri.endsWith('/') ? item.uri : item.uri + '/';
        await scanDir(subUri, results);
      }
    }
  } catch {}
}

export function useDuplicates() {
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [totalWasted, setTotalWasted] = useState(0);

  async function scan() {
    setScanning(true);
    setScanned(false);
    setGroups([]);
    // Let React flush the loading state before heavy scanning begins
    await new Promise(resolve => setTimeout(resolve, 50));

    try {
      const allFiles: DuplicateFile[] = [];

      // Scan filesystem dirs
      for (const dir of SCAN_DIRS) {
        await scanDir(dir, allFiles);
      }

      // Also pull from MediaLibrary for complete coverage
      let after: string | undefined;
      for (let page = 0; page < 100; page++) {
        const result = await MediaLibrary.getAssetsAsync({
          mediaType: ['photo', 'video'],
          first: 50,
          after,
        });
        for (const asset of result.assets) {
          allFiles.push({ name: asset.filename, uri: asset.uri, size: 0 });
        }
        if (!result.hasNextPage || !result.endCursor || result.assets.length === 0) break;
        after = result.endCursor;
      }

      // Group by name + size
      const map: Record<string, DuplicateFile[]> = {};
      for (const file of allFiles) {
        const key = `${file.name.toLowerCase()}__${file.size}`;
        if (!map[key]) map[key] = [];
        // Dedupe URIs
        if (!map[key].find(f => f.uri === file.uri)) {
          map[key].push(file);
        }
      }

      // Only keep groups with 2+ files
      const dupGroups: DuplicateGroup[] = Object.entries(map)
        .filter(([, files]) => files.length >= 2)
        .map(([key, files]) => ({
          key,
          name: files[0].name,
          size: files[0].size,
          files,
        }))
        .sort((a, b) => (b.size * (b.files.length - 1)) - (a.size * (a.files.length - 1)));

      // Calculate wasted space (all copies minus one original per group)
      const wasted = dupGroups.reduce((sum, g) => sum + g.size * (g.files.length - 1), 0);

      setGroups(dupGroups);
      setTotalWasted(wasted);
    } catch (e) {
      console.log('Scan error:', e);
    } finally {
      setScanning(false);
      setScanned(true);
    }
  }

  async function deleteFile(groupKey: string, uri: string): Promise<boolean> {
    try {
      const file = new FileSystem.File(uri);
      if (file.exists) {
        file.delete();
      }
      // Only remove from UI if we get here without throwing
      setGroups(prev => {
        const updated = prev.map(g => {
          if (g.key !== groupKey) return g;
          return { ...g, files: g.files.filter(f => f.uri !== uri) };
        }).filter(g => g.files.length >= 2);
        const newWasted = updated.reduce((sum, g) => sum + g.size * (g.files.length - 1), 0);
        setTotalWasted(newWasted);
        return updated;
      });
      return true;
    } catch (e) {
      console.log('Delete error:', e);
      return false;
    }
  }

  return { groups, scanning, scanned, totalWasted, scan, deleteFile, formatSize };
}
