import { fetch } from 'expo/fetch';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { File, Paths } from 'expo-file-system';

function config() {
  const baseUrl = (process.env.EXPO_PUBLIC_JARVIS_URL || '').trim().replace(/\/$/, '');
  const token = (process.env.EXPO_PUBLIC_JARVIS_TOKEN || '').trim();

  if (!baseUrl || !token) {
    throw new Error('JARVIS bridge is not configured.');
  }

  return { baseUrl, token };
}

let activePlayer: ReturnType<typeof createAudioPlayer> | null = null;

export async function speakWithJarvis(text: string): Promise<void> {
  const message = (text || '').trim();

  if (!message) return;

  const { baseUrl, token } = config();

  const response = await fetch(`${baseUrl}/audio`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Jarvis-Token': token,
    },
    body: JSON.stringify({ text: message }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const detail = payload && typeof payload.error === 'string'
      ? payload.error
      : `JARVIS voice returned HTTP ${response.status}.`;
    throw new Error(detail);
  }

  const bytes = await response.bytes();
  const file = new File(Paths.cache, `jarvis-${Date.now()}.mp3`);
  file.write(bytes);

  await setAudioModeAsync({
    playsInSilentMode: true,
    interruptionMode: 'doNotMix',
  });

  if (activePlayer) {
    try {
      activePlayer.remove();
    } catch {
      // The previous player may already have been released by the native layer.
    }
    activePlayer = null;
  }

  const player = createAudioPlayer(file.uri, {
    updateInterval: 100,
    keepAudioSessionActive: false,
  });

  activePlayer = player;

  await new Promise<void>((resolve, reject) => {
    let settled = false;

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      subscription.remove();

      if (activePlayer === player) {
        activePlayer = null;
      }

      try {
        player.remove();
      } catch {
        // Already released.
      }

      try {
        file.delete();
      } catch {
        // Cache cleanup is best effort.
      }

      if (error) reject(error);
      else resolve();
    };

    const subscription = player.addListener('playbackStatusUpdate', status => {
      if (status.error) {
        finish(new Error(status.error));
      } else if (status.didJustFinish) {
        finish();
      }
    });

    try {
      player.play();
    } catch (error) {
      finish(error instanceof Error ? error : new Error(String(error)));
    }
  });
}
