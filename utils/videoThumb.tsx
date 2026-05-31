import { useState, useEffect } from 'react';
import { Image } from 'react-native';
import { getVideoThumbnail } from '@/modules/media-grid';

export function isVideoFile(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return ['mp4', 'mkv', 'avi', 'mov', 'webm', '3gp'].includes(ext);
}

export function VideoThumb({ uri, style }: { uri: string; style: any }) {
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

  if (!thumb) return null;
  return <Image source={{ uri: thumb }} style={style} resizeMode="cover" />;
}
