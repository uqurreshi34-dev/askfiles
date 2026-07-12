import { useState, useCallback } from 'react';
import { scanImageDuplicates, ImageDuplicateGroup } from '@/modules/image-hash';
import * as FileSystem from 'expo-file-system';

function formatSize(bytes: number): string {
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + ' GB';
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
  if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return bytes + ' B';
}

export function useImageDuplicates() {
  const [groups, setGroups] = useState<ImageDuplicateGroup[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [totalWasted, setTotalWasted] = useState(0);
  const [listVersion, setListVersion] = useState(0);

  const scan = useCallback(async () => {
    setScanning(true);
    setScanned(false);
    setGroups([]);
    await new Promise(resolve => setTimeout(resolve, 50));
    try {
      const result = await scanImageDuplicates();
      const wasted = result.reduce((sum, g) => {
        const max = Math.max(...g.files.map(f => f.size));
        return sum + max * (g.files.length - 1);
      }, 0);
      setGroups(result);
      setTotalWasted(wasted);
      setListVersion(v => v + 1);
    } catch (e) {
      console.error('Image duplicate scan failed:', e);
    } finally {
      setScanning(false);
      setScanned(true);
    }
  }, []);

  async function deleteFile(groupKey: string, uri: string): Promise<void> {
    setGroups(prev => {
      const updated = prev.map(g => {
        if (g.key !== groupKey) return g;
        return { ...g, files: g.files.filter(f => f.uri !== uri) };
      }).filter(g => g.files.length >= 2);
      const newWasted = updated.reduce((sum, g) => {
        const max = Math.max(...g.files.map(f => f.size));
        return sum + max * (g.files.length - 1);
      }, 0);
      setTotalWasted(newWasted);
      return updated;
    });

    try {
      const file = new FileSystem.File(uri);
      if (file.exists) file.delete();
    } catch (e) {
      console.error('delete failed:', e);
    }
  }

  const deleteAllButOne = useCallback(async (group: ImageDuplicateGroup) => {
    const sorted = [...group.files].sort((a, b) => b.size - a.size || a.dateAdded - b.dateAdded);
    const toDelete = sorted.slice(1);
    for (const file of toDelete) {
      await deleteFile(group.key, file.uri);
    }
  }, [deleteFile]);

  return {
    groups,
    scanning,
    scanned,
    totalWasted,
    listVersion,
    scan,
    deleteFile,
    deleteAllButOne,
    formatSize,
  };
}
