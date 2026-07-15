import { useState, useCallback } from 'react';
import { scanImageDuplicates, ImageDuplicateGroup, addScanProgressListener } from '@/modules/image-hash';
import * as FileSystem from 'expo-file-system';
import { formatSize } from '@/utils/files';

export function useImageDuplicates() {
  const [groups, setGroups] = useState<ImageDuplicateGroup[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [totalWasted, setTotalWasted] = useState(0);
  const [listVersion, setListVersion] = useState(0);
  const [progress, setProgress] = useState({ scanned: 0, total: 0 });

  const scan = useCallback(async () => {
    setScanning(true);
    setScanned(false);
    setGroups([]);
    await new Promise(resolve => setTimeout(resolve, 50));
    setProgress({ scanned: 0, total: 0 });
    const sub = addScanProgressListener((scanned, total) => {
      setProgress({ scanned, total });
    });
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
      sub.remove();
    }
  }, []);

  const deleteFile = useCallback(async (groupKey: string, uri: string): Promise<void> => {
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
  }, []);

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
    progress,
    scan,
    deleteFile,
    deleteAllButOne,
    formatSize,
  };
}
