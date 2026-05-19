import { useState, useEffect } from 'react';
import { Image } from 'react-native';
import { getVideoThumbnail } from '@/modules/media-grid';

export function isVideoFile(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return ['mp4', 'mkv', 'avi', 'mov', 'webm', '3gp'].includes(ext);
}

const videoThumbCache = new Map<string, string>();
const MAX_THUMB_CACHE = 500;

function getThumbCached(uri: string): string | undefined {
  const cached = videoThumbCache.get(uri);
  if (cached) { videoThumbCache.delete(uri); videoThumbCache.set(uri, cached); return cached; }
  return undefined;
}

function setThumbCached(uri: string, thumb: string) {
  if (videoThumbCache.size >= MAX_THUMB_CACHE) {
    const firstKey = videoThumbCache.keys().next().value;
    if (firstKey) videoThumbCache.delete(firstKey);
  }
  videoThumbCache.set(uri, thumb);
}

export function VideoThumb({ uri, style }: { uri: string; style: any }) {
  const [thumb, setThumb] = useState<string | null>(getThumbCached(uri) ?? null);
  useEffect(() => {
    if (videoThumbCache.has(uri)) return;
    (async () => {
      try {
        const result = await getVideoThumbnail(uri);
        if (result) { setThumbCached(uri, result); setThumb(result); }
      } catch {}
    })();
  }, [uri]);
  if (!thumb) return null;
  return <Image source={{ uri: thumb }} style={style} resizeMode="cover" />;
}
