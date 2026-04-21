import { useState, useEffect, useCallback } from 'react';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import * as IntentLauncher from 'expo-intent-launcher';
import DeviceInfo from 'react-native-device-info';

interface StorageInfo {
  totalBytes: number;
  freeBytes: number;
  usedBytes: number;
  usedPercent: number;
  totalReadable: string;
  usedReadable: string;
  marketedGB: number;
}

interface FileCounts {
  images: number;
  videos: number;
  documents: number;
  downloads: number;
}

export interface FolderSizes {
  pictures: string;
  videos: string;
  downloads: string;
  documents: string;
  music: string;
  dcim: string;
}

export interface MediaContext {
  recentImages: string[];
  recentVideos: string[];
  screenshotCount: number;
}

interface StorageCache {
  storageInfo: StorageInfo | null;
  fileCounts: FileCounts;
  folderSizes: FolderSizes;
  mediaContext: MediaContext;
  loaded: boolean;
}

const cache: StorageCache = {
  storageInfo: null,
  fileCounts: { images: 0, videos: 0, documents: 0, downloads: 0 },
  folderSizes: {
    pictures: '0 MB',
    videos: '0 MB',
    downloads: '0 MB',
    documents: '0 MB',
    music: '0 MB',
    dcim: '0 MB',
  },
  mediaContext: { recentImages: [], recentVideos: [], screenshotCount: 0 },
  loaded: false,
};

let loadingPromise: Promise<void> | null = null;
let permissionRequested = false;

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

function ensureTrailingSlash(uri: string): string {
  return uri.endsWith('/') ? uri : uri + '/';
}

async function countFilesInDir(path: string, extensions?: string[]): Promise<number> {
  try {
    const dir = new FileSystem.Directory(ensureTrailingSlash(path));
    const contents = dir.list();
    let count = 0;
    for (const item of contents) {
      if (item instanceof FileSystem.File) {
        if (!extensions) {
          if (!item.name.startsWith('.')) count++;
        } else {
          const lower = item.name.toLowerCase();
          if (extensions.some(ext => lower.endsWith(ext))) count++;
        }
      } else if (item instanceof FileSystem.Directory) {
        count += await countFilesInDir(ensureTrailingSlash(item.uri), extensions);
      }
    }
    return count;
  } catch {
    return 0;
  }
}

async function getFolderSize(path: string): Promise<number> {
  try {
    const dir = new FileSystem.Directory(ensureTrailingSlash(path));
    const contents = dir.list();
    let size = 0;
    for (const item of contents) {
      if (item instanceof FileSystem.File) {
        size += item.size ?? 0;
      } else if (item instanceof FileSystem.Directory) {
        size += await getFolderSize(ensureTrailingSlash(item.uri));
      }
    }
    return size;
  } catch {
    return 0;
  }
}

async function getAllAssets(mediaType: 'photo' | 'video'): Promise<MediaLibrary.Asset[]> {
  const assets: MediaLibrary.Asset[] = [];
  let after: string | undefined = undefined;

  for (let page = 0; page < 50; page++) {
    const result = await MediaLibrary.getAssetsAsync({
      mediaType,
      first: 100,
      after,
    });
    for (const asset of result.assets) {
      assets.push(asset);
    }
    if (!result.hasNextPage || !result.endCursor) break;
    after = result.endCursor;
  }

  return assets.sort((a, b) => {
    const aTime = a.creationTime > 0 ? a.creationTime : a.modificationTime;
    const bTime = b.creationTime > 0 ? b.creationTime : b.modificationTime;
    return bTime - aTime;
  });
}

async function requestManageStoragePermission(): Promise<void> {
  if (Platform.OS !== 'android' || Platform.Version < 30) return;
  try {
    await IntentLauncher.startActivityAsync(
      'android.settings.MANAGE_APP_ALL_FILES_ACCESS_PERMISSION',
      { data: 'package:com.askfiles.mobile' }
    );
  } catch (e) {
    // Device doesn't support this intent — skip silently
  }
}

async function doLoad(): Promise<void> {
  const { status } = await MediaLibrary.requestPermissionsAsync();
  if (status !== 'granted') return;

  // Request full filesystem access once per app session only
  if (!permissionRequested) {
    permissionRequested = true;
    await requestManageStoragePermission();
  }

  // const total = FileSystem.Paths.totalDiskSpace;
  // const free = FileSystem.Paths.availableDiskSpace;
  // const used = total - free;

  const [total, free] = await Promise.all([
    DeviceInfo.getTotalDiskCapacity(),
    DeviceInfo.getFreeDiskStorage(),
  ]);
  
  const used = total - free;
  const marketedGB = Math.pow(2, Math.round(Math.log2(total / 1073741824)));

  cache.storageInfo = {
    totalBytes: total,
    freeBytes: free,
    usedBytes: used,
    usedPercent: Math.round((used / total) * 100),
    totalReadable: formatBytes(total),
    usedReadable: formatBytes(used),
    marketedGB,
  };

  const [allImages, allVideos] = await Promise.all([
    getAllAssets('photo'),
    getAllAssets('video'),
  ]);

  const screenshotCount = allImages.filter(a =>
    a.filename.toLowerCase().startsWith('screenshot')
  ).length;

  cache.fileCounts.images = allImages.length;
  cache.fileCounts.videos = allVideos.length;

  cache.mediaContext = {
    recentImages: allImages.map(a => a.filename),
    recentVideos: allVideos.map(a => a.filename),
    screenshotCount,
  };

  const [docCount, dlCount] = await Promise.all([
    Promise.all([
      countFilesInDir('file:///storage/emulated/0/Documents/', DOCUMENT_EXTENSIONS),
      countFilesInDir('file:///storage/emulated/0/Download/', DOCUMENT_EXTENSIONS),
      countFilesInDir('file:///storage/emulated/0/Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Documents/', DOCUMENT_EXTENSIONS),
      countFilesInDir('file:///storage/emulated/0/Android/media/com.whatsapp.w4b/WhatsApp Business/Media/WhatsApp Business Documents/', DOCUMENT_EXTENSIONS),
      countFilesInDir('file:///storage/emulated/0/Android/media/org.telegram.messenger/Telegram/Telegram Documents/', DOCUMENT_EXTENSIONS),
    ]).then(counts => counts.reduce((a, b) => a + b, 0)),
    countFilesInDir('file:///storage/emulated/0/Download/'),
  ]);

  cache.fileCounts.documents = docCount;
  cache.fileCounts.downloads = dlCount;

  const [picturesSize, moviesSize, dcimSize, downloadsSize, documentsSize, musicSize] =
    await Promise.all([
      getFolderSize('file:///storage/emulated/0/Pictures/'),
      getFolderSize('file:///storage/emulated/0/Movies/'),
      getFolderSize('file:///storage/emulated/0/DCIM/'),
      getFolderSize('file:///storage/emulated/0/Download/'),
      getFolderSize('file:///storage/emulated/0/Documents/'),
      getFolderSize('file:///storage/emulated/0/Music/'),
    ]);

  cache.folderSizes = {
    pictures: formatBytes(picturesSize),
    videos: formatBytes(moviesSize + dcimSize),
    downloads: formatBytes(downloadsSize),
    documents: formatBytes(documentsSize),
    music: formatBytes(musicSize),
    dcim: formatBytes(dcimSize),
  };

  cache.loaded = true;
}

function getLoadingPromise(): Promise<void> {
  if (!loadingPromise) {
    loadingPromise = doLoad().catch(e => {
      console.error('Storage load error:', e);
      loadingPromise = null;
    });
  }
  return loadingPromise;
}

export function useStorage() {
  const [, setTick] = useState(0);
  const [loading, setLoading] = useState(!cache.loaded);

  useEffect(() => {
    if (cache.loaded) {
      setLoading(false);
      return;
    }
    getLoadingPromise().then(() => {
      setLoading(false);
      setTick(t => t + 1);
    });
  }, []);

  const reload = useCallback(async () => {
    cache.loaded = false;
    loadingPromise = null;
    setLoading(true);
    await doLoad();
    setLoading(false);
    setTick(t => t + 1);
  }, []);

  return {
    storageInfo: cache.storageInfo,
    fileCounts: { ...cache.fileCounts },
    folderSizes: { ...cache.folderSizes },
    mediaContext: { ...cache.mediaContext },
    permissionGranted: cache.loaded,
    loading,
    reload,
  };
}
