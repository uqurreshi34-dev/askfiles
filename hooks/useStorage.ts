import { useState, useEffect, useCallback } from 'react';
import { Platform, AppState } from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import * as IntentLauncher from 'expo-intent-launcher';
import { formatSize } from '@/utils/files';
import { getStorageStats, isStorageManager } from '@/modules/storage-stats';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { queryDocuments, queryDownloads, queryImageSize, queryVideoSize, queryFolderSize, queryLargestFiles, queryNameMatchCount, queryLargestByName, queryExclusiveBreakdown } from 'media-store';
import { recordSnapshot, hasSnapshotForToday } from '@/modules/storageTrend';


/**
 * Paths that get their own bucket regardless of depth. Top-level folders
 * are picked up automatically, so this is only for things buried deeper
 * that are worth naming on their own, e.g.
 *   '/storage/emulated/0/Android/media/com.whatsapp/'
 * Most specific first -- the first match wins.
 */
const TREND_FOLDERS: string[] = [];

/**
 * Buckets smaller than this fold into other, so a phone with fifty
 * top-level folders does not carry fifty keys a day for thirty days.
 * Folding is by today's size: a folder that grows past it gets its own key
 * that day, and its absence yesterday reads as zero, which is what it was.
 */
const MIN_BUCKET_BYTES = 50 * 1024 * 1024;

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
  dcim: string;
  music: string;
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
    screenshots: { name: string; size: string; folder: string }[];
    overall: { name: string; size: string; folder: string }[];
  };
  documentExtensions: Record<string, number>;
  /**
  * The same figures as folderSizes, unformatted. storageTrend compares
  * days, and parsing "18.2 GB" back would carry 100 MB of error against
  * a 500 MB threshold.
  */
  folderBytes: Record<string, number>;
 /**
 * The trend's own figures: every file in exactly one bucket. Separate
 * from folderBytes, whose categories overlap by design.
 */
  trendBytes: Record<string, number>;
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
    dcim: '0 MB',
    music: '0 MB',
    other: '0 MB',
  },
  mediaContext: { recentImages: [], recentVideos: [], screenshotCount: 0, allDocuments: [], allDownloads: [] },
  largestFiles: {
    images: [] as { name: string; size: string; folder: string }[],
    videos: [] as { name: string; size: string; folder: string }[],
    documents: [] as { name: string; size: string; folder: string }[],
    downloads: [] as { name: string; size: string; folder: string }[],
    screenshots: [] as { name: string; size: string; folder: string }[],
    overall: [] as { name: string; size: string; folder: string }[],
  },
  documentExtensions: {},
  folderBytes: {},
  trendBytes: {},
  loaded: false,
};

let loadingPromise: Promise<void> | null = null;
let appStateHandling = false;
let onPhase1Complete: (() => void) | null = null;

export function pluralise(count: number, word: string): string {
  return `${count.toLocaleString()} ${word}${count === 1 ? '' : 's'}`;
}

async function getAllAssets(mediaType: 'photo' | 'video'): Promise<{
  count: number;
  recentNames: string[];
  screenshotCount: number;
}> {
  // First page only for recent filenames
  const first = await MediaLibrary.getAssetsAsync({ mediaType, first: 500 });
  
  const recentNames: string[] = [];
  let screenshotCount = 0;
  for (const asset of first.assets) {
    recentNames.push(asset.filename);
    if (mediaType === 'photo' && asset.filename.toLowerCase().startsWith('screenshot')) screenshotCount++;
  }

  // Get total count separately — instant, no pagination
  const countResult = await MediaLibrary.getAssetsAsync({ mediaType, first: 1 });
  const count = countResult.totalCount ?? first.assets.length;

  return { count, recentNames, screenshotCount };
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

async function loadFolderSizes(): Promise<void> {
  const [downloadsSize, docItems, dcimSize, totalImagesSize, totalVideosSize, musicSize] =
  await Promise.all([
    queryFolderSize('/storage/emulated/0/Download/'),
    queryDocuments(),
    queryFolderSize('/storage/emulated/0/DCIM/'),
    queryImageSize(),
    queryVideoSize(),
    queryFolderSize('/storage/emulated/0/Music/'),
  ]);

  const documentsSize = docItems.reduce((sum, f) => sum + (f.size ?? 0), 0);

  const knownBytes = totalImagesSize + totalVideosSize + downloadsSize + documentsSize + musicSize;
  const usedBytes = cache.storageInfo?.usedBytes ?? 0;

  cache.folderBytes = {
    pictures: totalImagesSize,
    videos: totalVideosSize,
    downloads: downloadsSize,
    documents: documentsSize,
    dcim: dcimSize,
    music: musicSize,
    other: Math.max(0, usedBytes - knownBytes),
  };

  cache.folderSizes = {
    pictures: formatSize(cache.folderBytes.pictures),
    videos: formatSize(cache.folderBytes.videos),
    downloads: formatSize(cache.folderBytes.downloads),
    documents: formatSize(cache.folderBytes.documents),
    dcim: formatSize(cache.folderBytes.dcim),
    music: formatSize(cache.folderBytes.music),
    other: formatSize(cache.folderBytes.other),
  };

  // Not awaited: the trend is a nice-to-have and must never hold up a
  // screen waiting for folder sizes.
  // The breakdown is a full MediaStore pass, so it runs only when a
  // snapshot is actually due -- once a day. Every other load stops at the
  // cheap cached check.
  void (async () => {
    if (!usedBytes || (await hasSnapshotForToday())) return;

    const exclusive = await queryExclusiveBreakdown(TREND_FOLDERS);
    const counted = Object.values(exclusive).reduce((sum, n) => sum + n, 0);

    const buckets: Record<string, number> = {};
    let folded = 0;

    for (const [key, bytes] of Object.entries(exclusive)) {
      if (key !== 'other' && bytes < MIN_BUCKET_BYTES) folded += bytes;
      else buckets[key] = bytes;
    }

    // Plus whatever MediaStore never indexed. Keeps the buckets summing to
    // usedBytes exactly, which is the check that every byte was counted once.
    buckets.other = (buckets.other ?? 0) + folded + Math.max(0, usedBytes - counted);

    cache.trendBytes = buckets;

    void recordSnapshot(usedBytes, cache.trendBytes);
  })();
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
// Start storage stats — slow on cold start, don't block
const statsPromise = getStorageStats().then(stats => {
  const total = stats.total;
  const free = stats.free;
  const used = (stats as any).used ?? (total - free);
  cache.storageInfo = {
    totalBytes: total,
    freeBytes: free,
    usedBytes: used,
    usedPercent: Math.round((used / total) * 100),
    totalReadable: formatSize(total),
    usedReadable: formatSize(used),
  };
}).catch(() => {});

cache.mediaContext = {
  recentImages: [],
  recentVideos: [],
  screenshotCount: 0,
  allDocuments: [],
  allDownloads: [],
};

await loadFolderSizes();
// App is ready — show UI now
cache.loaded = true;
onPhase1Complete?.();
onPhase1Complete = null;

statsPromise.then(() => loadFolderSizes());

  // ── PHASE 2: Slow filesystem scans — AI context, runs silently ────────────

const [imgScan, vidScan] = await Promise.all([
  getAllAssets('photo'),
  getAllAssets('video'),
]);

const [docItems, dlItems] = await Promise.all([
  queryDocuments(),
  queryDownloads(),
]);

cache.fileCounts.documents = docItems.length;
cache.fileCounts.downloads = dlItems.length;
  // Exact, device-wide: queryDocuments and queryDownloads return full
  // listings, not samples, so a per-extension tally here is a real count
  // rather than an estimate.
  const extensionCounts: Record<string, number> = {};

  for (const file of [...docItems, ...dlItems]) {
    const dot = file.name.lastIndexOf('.');
    const extension = dot > 0 ? file.name.slice(dot + 1).toLowerCase() : '';

    if (extension) {
      extensionCounts[extension] = (extensionCounts[extension] || 0) + 1;
    }
  }

  cache.documentExtensions = extensionCounts;
  cache.fileCounts.images = imgScan.count;
  cache.fileCounts.videos = vidScan.count;
  cache.mediaContext.recentImages = imgScan.recentNames;
  cache.mediaContext.recentVideos = vidScan.recentNames;
  cache.mediaContext.screenshotCount = imgScan.screenshotCount;
  // Replace the sampled figure with a real device-wide count. Falls back to
  // the sample if the query fails, which is a floor rather than a lie.
  try {
    const screenshots = await queryNameMatchCount(['screenshot'], 'image/');

    if (screenshots > 0) cache.mediaContext.screenshotCount = screenshots;
  } catch {
    // Keep imgScan.screenshotCount.
  }
  const largestScreenshots = await queryLargestByName(['screenshot'], 'image/', 5);
  const [largestImages, largestVideos, largestDocs, largestDownloads] = await Promise.all([
    queryLargestFiles('/storage/emulated/0/', 'image/', 5),
    queryLargestFiles('/storage/emulated/0/', 'video/', 5),
    queryLargestFiles('/storage/emulated/0/Documents/', 'application/', 5),
    queryLargestFiles('/storage/emulated/0/Download/', '', 5),
  ]);
  
  cache.largestFiles = {
    images: largestImages.map(f => ({ ...f, size: formatSize(f.size) })),
    videos: largestVideos.map(f => ({ ...f, size: formatSize(f.size) })),
    documents: largestDocs.map(f => ({ ...f, size: formatSize(f.size) })),
    downloads: largestDownloads.map(f => ({ ...f, size: formatSize(f.size) })),
    screenshots: largestScreenshots.map(f => ({ ...f, size: formatSize(f.size) })),
    overall: [], // derived below
  };

  cache.largestFiles.overall = [...largestImages, ...largestVideos, ...largestDocs, ...largestDownloads]
  .sort((a, b) => b.size - a.size)
  .slice(0, 5)
  .map(f => ({ ...f, size: formatSize(f.size) }));

  cache.mediaContext.allDocuments = docItems.map(d => d.name);
  cache.mediaContext.allDownloads = dlItems.map(d => d.name);
}

function getLoadingPromise(): Promise<void> {
  if (!loadingPromise) {
    loadingPromise = doLoad().catch(e => {
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
    onPhase1Complete = () => {
      setLoading(false);
      setTick(t => t + 1);
    };
    getLoadingPromise();
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active' && !cache.loaded && !appStateHandling) {
        appStateHandling = true;
     
        getLoadingPromise().then(() => {
          setLoading(false);
          setTick(t => t + 1);
          appStateHandling = false;
        });
      }
    });
    return () => sub.remove();
  }, []);


  const silentReload = useCallback(async () => {
    loadingPromise = null;
    await doLoad();
    setTick(t => t + 1);
  }, []);

  const reload = useCallback(async () => {
    cache.loaded = false;
    loadingPromise = null;
    setLoading(true);
    await doLoad();
    setLoading(false);
    setTick(t => t + 1);
  }, []);

  const refreshSizes = useCallback(async () => {
    await Promise.all([
      getStorageStats().then(stats => {
        const total = stats.total;
        const free = stats.free;
        const used = (stats as any).used ?? (total - free);
        cache.storageInfo = {
          totalBytes: total,
          freeBytes: free,
          usedBytes: used,
          usedPercent: Math.round((used / total) * 100),
          totalReadable: formatSize(total),
          usedReadable: formatSize(used),
        };
      }).catch(() => {}),
      loadFolderSizes(),
    ]);
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
      screenshots: [...cache.largestFiles.screenshots],
      overall: [...cache.largestFiles.overall],
    },
    documentExtensions: { ...cache.documentExtensions },
    folderBytes: { ...cache.folderBytes },
    permissionGranted: cache.loaded,
    loading,
    reload,
    silentReload,
    refreshSizes,
  };
}
