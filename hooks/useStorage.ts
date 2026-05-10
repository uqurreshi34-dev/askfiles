import { useState, useEffect, useCallback } from 'react';
import { Platform, AppState } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import * as IntentLauncher from 'expo-intent-launcher';
import RNFS from 'react-native-fs';
import { formatBytes } from '@/utils/formatBytes';
import { getStorageStats, isStorageManager } from '@/modules/storage-stats';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

export interface FolderSizes {
  pictures: string;
  videos: string;
  downloads: string;
  documents: string;
  music: string;
  dcim: string;
  other: string;
}

export interface MediaContext {
  recentImages: string[];
  recentVideos: string[];
  screenshotCount: number;
  allDocuments: string[];
  allDownloads: string[];
}

interface StorageCache {
  storageInfo: StorageInfo | null;
  fileCounts: FileCounts;
  folderSizes: FolderSizes;
  mediaContext: MediaContext;
  largestFiles: {
    images: { name: string; size: string; folder: string }[];
    videos: { name: string; size: string; folder: string }[];
    documents: { name: string; size: string; folder: string }[];
    downloads: { name: string; size: string; folder: string }[];
    overall: { name: string; size: string; folder: string }[];
  };
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
    other: '0 MB',
  },
  mediaContext: { recentImages: [], recentVideos: [], screenshotCount: 0, allDocuments: [], allDownloads: [] },
  largestFiles: {
    images: [] as { name: string; size: string; folder: string }[],
    videos: [] as { name: string; size: string; folder: string }[],
    documents: [] as { name: string; size: string; folder: string }[],
    downloads: [] as { name: string; size: string; folder: string }[],
    overall: [] as { name: string; size: string; folder: string }[],
  },
  loaded: false,
};

let loadingPromise: Promise<void> | null = null;
let appStateHandling = false;

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
  // Strip file:// prefix — RNFS works on raw paths
  const rawPath = path.replace('file://', '').replace(/\/$/, '');
  try {
    const contents = await RNFS.readDir(rawPath);
    let size = 0;
    for (const item of contents) {
      if (item.isFile()) {
        size += Number(item.size) || 0;
      } else if (item.isDirectory()) {
        size += await getFolderSize(item.path);
      }
    }
    return size;
  } catch {
    return 0;
  }
}

async function getFolderSizeByExtension(path: string, extensions: string[]): Promise<number> {
  const rawPath = path.replace('file://', '').replace(/\/$/, '');
  try {
    const contents = await RNFS.readDir(rawPath);
    let size = 0;
    for (const item of contents) {
      if (item.isFile()) {
        const lower = item.name.toLowerCase();
        if (extensions.some(ext => lower.endsWith(ext))) {
          size += Number(item.size) || 0;
        }
      } else if (item.isDirectory()) {
        size += await getFolderSizeByExtension(item.path, extensions);
      }
    }
    return size;
  } catch {
    return 0;
  }
}

async function getLargestFiles(
  paths: string[],
  extensions?: string[],
  topN = 5,
  includeNonStandardRoot = false
): Promise<{ name: string; size: string; folder: string }[]> {
  const files: { name: string; size: number; folder: string }[] = [];

  const scanDir = async (rawPath: string) => {
    const folderName = rawPath.split('/').filter(Boolean).pop() ?? 'Storage';
    try {
      const contents = await RNFS.readDir(rawPath);
      for (const item of contents) {
        if (!item.isFile()) continue;
        if (item.name.startsWith('.')) continue;
        if (extensions) {
          const lower = item.name.toLowerCase();
          if (!extensions.some(ext => lower.endsWith(ext))) continue;
        }
        files.push({ name: item.name, size: Number(item.size) || 0, folder: folderName });
      }
    } catch {}
  };

  for (const path of paths) {
    await scanDir(path.replace('file://', '').replace(/\/$/, ''));
  }

  // Also scan non-standard root folders (e.g. Samsung My Files)
  if (includeNonStandardRoot) {
    const STANDARD_ROOT_DIRS = ['Download', 'Documents', 'Pictures', 'Movies', 'Music', 'DCIM', 'Recordings', 'Android'];
    try {
      const rootItems = await RNFS.readDir('/storage/emulated/0/');
      for (const item of rootItems) {
        if (!item.isDirectory()) continue;
        if (item.name.startsWith('.')) continue;
        if (STANDARD_ROOT_DIRS.includes(item.name)) continue;
        await scanDir(item.path);
      }
    } catch {}
  }

  return files
    .sort((a, b) => b.size - a.size)
    .slice(0, topN)
    .map(f => ({ name: f.name, size: formatBytes(f.size), folder: f.folder }));
}

async function getAllFilenames(paths: string[], extensions?: string[]): Promise<string[]> {
  const names: string[] = [];
  
  async function scanDir(rawPath: string) {
    try {
      const contents = await RNFS.readDir(rawPath);
      for (const item of contents) {
        if (item.name.startsWith('.')) continue;
        if (item.isDirectory()) {
          await scanDir(item.path);
        } else if (item.isFile()) {
          if (extensions) {
            const lower = item.name.toLowerCase();
            if (!extensions.some(ext => lower.endsWith(ext))) continue;
          }
          names.push(item.name);
        }
      }
    } catch {}
  }

  for (const path of paths) {
    await scanDir(path.replace('file://', '').replace(/\/$/, ''));
  }
  return names;
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
  
  const hasPermission = await isStorageManager();
  if (hasPermission) return;

  try {
    await IntentLauncher.startActivityAsync(
      'android.settings.MANAGE_APP_ALL_FILES_ACCESS_PERMISSION',
      { data: 'package:com.askfiles.mobile' }
    );
  } catch {
    try {
      await IntentLauncher.startActivityAsync(
        'android.settings.MANAGE_ALL_FILES_ACCESS_PERMISSION'
      );
    } catch {}
  }
}

async function doLoad(): Promise<void> {
  const onboardingDone = await AsyncStorage.getItem('askfiles-onboarding-done');
  if (!onboardingDone) return;
  const { status } = await MediaLibrary.requestPermissionsAsync();
  if (status !== 'granted') return;
  const askedBefore = await AsyncStorage.getItem('askfiles-asked-manage-storage');
  if (!askedBefore) {
    await AsyncStorage.setItem('askfiles-asked-manage-storage', 'true');
    await requestManageStoragePermission();
  }

  const stats = await getStorageStats();
  const total = stats.total;
  const free = stats.free;
  const used = (stats as any).used ?? (total - free);

  cache.storageInfo = {
    totalBytes: total,
    freeBytes: free,
    usedBytes: used,
    usedPercent: Math.round((used / total) * 100),
    totalReadable: formatBytes(total),
    usedReadable: formatBytes(used),
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
    allDocuments: [],
    allDownloads: [],
  };

  // Dynamically find non-standard root folders (e.g. Samsung My Files)
  const STANDARD_ROOT_DIRS = ['Download', 'Documents', 'Pictures', 'Movies', 'Music', 'DCIM', 'Recordings', 'Android'];
  let extraDocCount = 0;
  try {
    const rootItems = await RNFS.readDir('/storage/emulated/0/');
    for (const item of rootItems) {
      if (!item.isDirectory()) continue;
      if (item.name.startsWith('.')) continue;
      if (STANDARD_ROOT_DIRS.includes(item.name)) continue;
      extraDocCount += await countFilesInDir(`file://${item.path}/`, DOCUMENT_EXTENSIONS);
    }
  } catch {}

  const [docCount, dlCount] = await Promise.all([
    Promise.all([
      countFilesInDir('file:///storage/emulated/0/Documents/', DOCUMENT_EXTENSIONS),
      countFilesInDir('file:///storage/emulated/0/Download/', DOCUMENT_EXTENSIONS),
      countFilesInDir('file:///storage/emulated/0/Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Documents/', DOCUMENT_EXTENSIONS),
      countFilesInDir('file:///storage/emulated/0/Android/media/com.whatsapp.w4b/WhatsApp Business/Media/WhatsApp Business Documents/', DOCUMENT_EXTENSIONS),
      countFilesInDir('file:///storage/emulated/0/Android/media/org.telegram.messenger/Telegram/Telegram Documents/', DOCUMENT_EXTENSIONS),
    ]).then(counts => counts.reduce((a, b) => a + b, 0) + extraDocCount),
    countFilesInDir('file:///storage/emulated/0/Download/'),
  ]);

  cache.fileCounts.documents = docCount;
  cache.fileCounts.downloads = dlCount;

  const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic'];
  const VIDEO_EXTS = ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.3gp', '.m4v', '.ts', '.wmv', '.flv'];

  const [picturesSize, dcimImagesSize, dcimVideosSize, moviesSize,
    downloadsSize, documentsSize, musicSize,
    documentsInDownloadSize, documentsInWhatsappSize, documentsInWhatsappBizSize,
    documentsInTelegramSize] =
    await Promise.all([
      getFolderSizeByExtension('file:///storage/emulated/0/Pictures/', IMAGE_EXTS),
      getFolderSizeByExtension('file:///storage/emulated/0/DCIM/', IMAGE_EXTS),
      getFolderSizeByExtension('file:///storage/emulated/0/DCIM/', VIDEO_EXTS),
      getFolderSize('file:///storage/emulated/0/Movies/'),
      getFolderSize('file:///storage/emulated/0/Download/'),
      getFolderSize('file:///storage/emulated/0/Documents/'),
      getFolderSize('file:///storage/emulated/0/Music/'),
      getFolderSizeByExtension('file:///storage/emulated/0/Download/', DOCUMENT_EXTENSIONS),
      getFolderSizeByExtension('file:///storage/emulated/0/Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Documents/', DOCUMENT_EXTENSIONS),
      getFolderSizeByExtension('file:///storage/emulated/0/Android/media/com.whatsapp.w4b/WhatsApp Business/Media/WhatsApp Business Documents/', DOCUMENT_EXTENSIONS),
      getFolderSizeByExtension('file:///storage/emulated/0/Android/media/org.telegram.messenger/Telegram/Telegram Documents/', DOCUMENT_EXTENSIONS),
    ]);

  const totalImagesSize = picturesSize + dcimImagesSize;
  const totalVideosSize = dcimVideosSize + moviesSize;
  const knownBytes = totalImagesSize + totalVideosSize + downloadsSize + documentsSize + musicSize;
  const otherBytes = Math.max(0, (cache.storageInfo?.usedBytes ?? 0) - knownBytes);

  cache.folderSizes = {
    pictures: formatBytes(totalImagesSize),
    videos: formatBytes(totalVideosSize),
    downloads: formatBytes(downloadsSize),
    documents: formatBytes(documentsSize + documentsInDownloadSize + documentsInWhatsappSize + documentsInWhatsappBizSize + documentsInTelegramSize),
    music: formatBytes(musicSize),
    dcim: formatBytes(dcimImagesSize + dcimVideosSize),
    other: formatBytes(otherBytes),
  };

  const [largestImages, largestVideos, largestDocs, largestDownloads, largestOverall] = await Promise.all([
    getLargestFiles(['/storage/emulated/0/DCIM/Camera/', '/storage/emulated/0/Pictures/'], IMAGE_EXTS, 5, true),
    getLargestFiles(['/storage/emulated/0/DCIM/Camera/', '/storage/emulated/0/Movies/'], VIDEO_EXTS, 5, true),
    getLargestFiles([
      '/storage/emulated/0/Documents/',
      '/storage/emulated/0/Download/',
      '/storage/emulated/0/Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Documents/',
    ], DOCUMENT_EXTENSIONS, 5, true),
    getLargestFiles(['/storage/emulated/0/Download/'], undefined, 5, false),
    getLargestFiles([
      '/storage/emulated/0/Download/',
      '/storage/emulated/0/DCIM/Camera/',
      '/storage/emulated/0/Pictures/',
      '/storage/emulated/0/Movies/',
      '/storage/emulated/0/Documents/',
    ], undefined, 10, true),
  ]);

  cache.largestFiles = {
    images: largestImages,
    videos: largestVideos,
    documents: largestDocs,
    downloads: largestDownloads,
    overall: largestOverall,
  };

  const extraDocPaths: string[] = [];
  try {
    const rootItems = await RNFS.readDir('/storage/emulated/0/');
    for (const item of rootItems) {
      if (!item.isDirectory() || item.name.startsWith('.') || STANDARD_ROOT_DIRS.includes(item.name)) continue;
      extraDocPaths.push(item.path);
    }
  } catch {}

  const [allDocNames, allDlNames] = await Promise.all([
    getAllFilenames([
      '/storage/emulated/0/Documents/',
      '/storage/emulated/0/Download/',
      '/storage/emulated/0/Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Documents/',
      ...extraDocPaths,
    ], DOCUMENT_EXTENSIONS),
    getAllFilenames(['/storage/emulated/0/Download/']),
  ]);

  cache.mediaContext.allDocuments = allDocNames;
  cache.mediaContext.allDownloads = allDlNames;

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

  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active' && !cache.loaded && !appStateHandling) {
        appStateHandling = true;
        loadingPromise = null;
        getLoadingPromise().then(() => {
          setLoading(false);
          setTick(t => t + 1);
          appStateHandling = false;
        });
      }
    });
    return () => sub.remove();
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
    largestFiles: {
      images: [...cache.largestFiles.images],
      videos: [...cache.largestFiles.videos],
      documents: [...cache.largestFiles.documents],
      downloads: [...cache.largestFiles.downloads],
      overall: [...cache.largestFiles.overall],
    },
    permissionGranted: cache.loaded,
    loading,
    reload,
  };
}
