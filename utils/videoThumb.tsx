import { useState, useEffect, type ReactNode } from 'react';
import { Image } from 'react-native';
import { getVideoThumbnail } from '@/modules/media-grid';

export function isVideoFile(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return ['mp4', 'mkv', 'avi', 'mov', 'webm', '3gp'].includes(ext);
}

/** placeholder shows until the first frame is ready (generated once, then cached on disk). */
export function VideoThumb({ uri, style, placeholder = null }: { uri: string; style: any; placeholder?: ReactNode }) {
  const [thumb, setThumb] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await getVideoThumbnail(uri);
        if (result && !cancelled) setThumb(result);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [uri]);

  if (!thumb) return <>{placeholder}</>;
  return <Image source={{ uri: thumb }} style={style} resizeMode="cover" />;
}
