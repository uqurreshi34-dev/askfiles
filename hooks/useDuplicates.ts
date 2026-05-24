import { useState } from 'react';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import { queryAllFiles } from 'media-store';

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

function formatSize(bytes: number): string {
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + ' GB';
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
  if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return bytes + ' B';
}

export function useDuplicates() {
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [totalWasted, setTotalWasted] = useState(0);
  const [listVersion, setListVersion] = useState(0);

  async function scan() {
    setScanning(true);
    setScanned(false);
    setGroups([]);
    await new Promise(resolve => setTimeout(resolve, 50));
    try {
      const allFiles = await queryAllFiles();
  
      const map: Record<string, DuplicateFile[]> = {};
      for (const file of allFiles) {
        const key = `${file.name.toLowerCase()}__${file.size}`;
        if (!map[key]) map[key] = [];
        const dir = file.uri.substring(0, file.uri.lastIndexOf('/'));
        if (!map[key].find(f => f.uri === file.uri) &&
            !map[key].find(f => f.uri.substring(0, f.uri.lastIndexOf('/')) === dir)) {
          map[key].push(file);
        }
      }
  
      const dupGroups: DuplicateGroup[] = Object.entries(map)
        .filter(([, files]) => files.length >= 2)
        .map(([key, files]) => ({
          key,
          name: files[0].name,
          size: files[0].size,
          files,
        }))
        .sort((a, b) => (b.size * (b.files.length - 1)) - (a.size * (a.files.length - 1)));
  
      const wasted = dupGroups.reduce((sum, g) => sum + g.size * (g.files.length - 1), 0);
      setGroups(dupGroups);
      setTotalWasted(wasted);
    } catch {}
    finally {
      setScanning(false);
      setScanned(true);
    }
  }

  async function deleteFile(groupKey: string, uri: string): Promise<boolean> {
    
    setGroups(prev => {
      const updated = prev.map(g => {
        if (g.key !== groupKey) return g;
        const remainingFiles = g.files.filter(f => f.uri !== uri);
        return { ...g, files: remainingFiles };
      }).filter(g => g.files.length >= 2);
      const newWasted = updated.reduce((sum, g) => sum + g.size * (g.files.length - 1), 0);
      setTotalWasted(newWasted);
      return updated;
    });
    // Only force FlatList remount when a group is fully removed (2 copies deleted)
    // For 3+ copy groups where one file is removed, no remount needed

    // Attempt actual file delete in background
    try {
      const file = new FileSystem.File(uri);
      if (file.exists) file.delete();
    } catch {
      try {
        const assets = await MediaLibrary.getAssetsAsync({ first: 1000 });
        const match = assets.assets.find(a => a.uri === uri);
        if (match) await MediaLibrary.deleteAssetsAsync([match]);
      } catch {}
    }

    return true;
  }

  return { groups, scanning, scanned, totalWasted, listVersion, scan, deleteFile, formatSize };
}
