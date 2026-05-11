import { useEffect, useRef } from 'react';
import {
  startWatching,
  stopWatching,
  addFileChangeListener,
  FileChangeEvent,
  startMediaStoreObserver,
  stopMediaStoreObserver,
  addMediaStoreChangeListener,
} from '@/modules/file-watcher';
import { cleanupBrokenFavourites } from '@/hooks/useFavourites';

const WATCH_DIRS = [
  '/storage/emulated/0/DCIM',
  '/storage/emulated/0/Pictures',
  '/storage/emulated/0/Downloads',
  '/storage/emulated/0/Documents',
  '/storage/emulated/0/Movies',
  '/storage/emulated/0/Music',
];

let cleanupTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleCleanup() {
  if (cleanupTimer) clearTimeout(cleanupTimer);
  cleanupTimer = setTimeout(() => {
    cleanupBrokenFavourites();
    cleanupTimer = null;
  }, 1500);
}

export function useFileWatcher() {
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    // Start FileObserver on filesystem directories
    for (const dir of WATCH_DIRS) {
      try { startWatching(dir); } catch {}
    }

    // FileObserver listener
    const fileSubscription = addFileChangeListener((event: FileChangeEvent) => {
      if (event.event === 'DELETE') scheduleCleanup();
    });

    // MediaStore observer (catches external app deletions)
    const mediaSubscription = addMediaStoreChangeListener(() => {
      scheduleCleanup();
    });

    startMediaStoreObserver().catch(() => {});

    return () => {
      fileSubscription.remove();
      mediaSubscription.remove();
      stopMediaStoreObserver().catch(() => {});
      for (const dir of WATCH_DIRS) {
        try { stopWatching(dir); } catch {}
      }
      started.current = false;
    };
  }, []);
}
