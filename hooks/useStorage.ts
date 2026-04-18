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

export function pluralise(count: number, word: string): string {
  return `${count.toLocaleString()} ${word}${count === 1 ? '' : 's'}`;
}

const DOCUMENT_EXTENSIONS = [
  '.pdf', '.doc', '.docx', '.xls', '.xlsx',
  '.ppt', '.pptx', '.txt', '.csv', '.rtf',
  '.odt', '.ods', '.odp', '.pages', '.numbers',
];

async function countFilesInDir(path: string, extensions?: string[]): Promise<number> {
    try {
      const dir = new FileSystem.Directory(path);
      const contents = dir.list();
      let count = 0;
      for (const item of contents) {
        if (item instanceof FileSystem.File) {
          if (!extensions) {
            count++;
          } else {
            const lower = item.name.toLowerCase();
            if (extensions.some(ext => lower.endsWith(ext))) count++;
          }
        } else if (item instanceof FileSystem.Directory) {
          count += await countFilesInDir(item.uri, extensions);
        }
      }
      return count;
    } catch {
      return 0;
    }
  }

export function useStorage() {
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);
  const [fileCounts, setFileCounts] = useState<FileCounts>({
    images: 0,
    videos: 0,
    documents: 0,
    downloads: 0,
  });
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

        try {
            const dl = new FileSystem.Directory('file:///storage/emulated/0/Download/');
            const dlContents = dl.list();
            console.log('DOWNLOAD CONTENTS:', dlContents.length);
            for (const item of dlContents) {
            console.log(item instanceof FileSystem.File ? 'FILE: ' + item.name : 'DIR: ' + item.uri);
            }
        } catch (e) {
            console.log('DOWNLOAD ERROR:', e);
        }

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

        const [docCount, dlCount] = await Promise.all([
          Promise.all([
                countFilesInDir('file:///storage/emulated/0/Documents/', DOCUMENT_EXTENSIONS),
                countFilesInDir('file:///storage/emulated/0/Download/', DOCUMENT_EXTENSIONS),
                countFilesInDir('file:///storage/emulated/0/Android/media/', DOCUMENT_EXTENSIONS),
          ]).then(counts => counts.reduce((a, b) => a + b, 0)),
            countFilesInDir('file:///storage/emulated/0/Download/'),
        ]);

        setFileCounts({
          images: images.totalCount,
          videos: videos.totalCount,
          documents: docCount,
          downloads: dlCount,
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
