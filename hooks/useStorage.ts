import { useState, useEffect } from 'react';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';

interface StorageInfo {
  totalBytes: number;
  freeBytes: number;
  usedBytes: number;
  usedPercent: number;
  totalReadable: string;
  usedReadable: string;
}

interface FileCounts {
  images: number;
  videos: number;
  documents: number;
  downloads: number;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + ' GB';
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
  return (bytes / 1024).toFixed(1) + ' KB';
}

export function useStorage() {
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);
  const [fileCounts, setFileCounts] = useState<FileCounts>({ images: 0, videos: 0, documents: 0, downloads: 0 });
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const { status } = await MediaLibrary.requestPermissionsAsync();
        if (status !== 'granted') {
          setLoading(false);
          return;
        }
        setPermissionGranted(true);

        const total = FileSystem.Paths.totalDiskSpace;
        const free = FileSystem.Paths.availableDiskSpace;
        const used = total - free;

        setStorageInfo({
          totalBytes: total,
          freeBytes: free,
          usedBytes: used,
          usedPercent: Math.round((used / total) * 100),
          totalReadable: formatBytes(total),
          usedReadable: formatBytes(used),
        });

        const [images, videos] = await Promise.all([
          MediaLibrary.getAssetsAsync({ mediaType: 'photo', first: 1 }),
          MediaLibrary.getAssetsAsync({ mediaType: 'video', first: 1 }),
        ]);

        let downloadCount = 0;
        try {
        const dlDir = new FileSystem.Directory('file:///storage/emulated/0/Download/');
        const dlContents = dlDir.list();
        downloadCount = dlContents.length;
        } catch {
        downloadCount = 0;
        }

        setFileCounts({
          images: images.totalCount,
          videos: videos.totalCount,
          documents: 0,
          downloads: downloadCount,
        });

      } catch (e) {
        console.error('Storage load error:', e);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  return { storageInfo, fileCounts, permissionGranted, loading };
}
