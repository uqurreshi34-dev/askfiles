import { Platform } from 'react-native';
import { fetch } from 'expo/fetch';
import { postFile } from './jarvis-network';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import { GoogleSignin } from '@react-native-google-signin/google-signin';

const tokens = await GoogleSignin.getTokens();

if (!tokens.idToken) {
  throw new Error('Please sign in with Google to use JARVIS.');
}

const response = await fetch(`${baseUrl}/api/jarvis/audio/`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${tokens.idToken}`,
  },
  body: JSON.stringify({ text: message }),
});

let activePlayer: ReturnType<typeof createAudioPlayer> | null = null;

export function stopJarvisVoice() {
  if (!activePlayer) return;

  try {
    activePlayer.remove();
  } catch {
    // The player may already have been released by the native layer.
  }

  activePlayer = null;
}

export async function speakWithJarvis(text: string): Promise<void> {
  const message = (text || '').trim();

  if (!message) return;

  const { baseUrl, token } = config();
  let audioUri: string;
  let audioFile: File | null = null;

  if (Platform.OS === 'android') {
    const dnsIp = (process.env.EXPO_PUBLIC_JARVIS_TAILSCALE_IP || '').trim();

    if (!dnsIp) {
      throw new Error('JARVIS Tailscale IP is not configured.');
    }

    audioUri = await postFile(
      `${baseUrl}/audio`,
      token,
      JSON.stringify({ text: message }),
      new URL(baseUrl).hostname,
      dnsIp,
    );
  } else {
    const response = await fetch(`${baseUrl}/audio`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Jarvis-Token': token,
      },
      body: JSON.stringify({ text: message }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null) as unknown;
      const detail = payload && typeof payload === 'object' && typeof (payload as Record<string, unknown>).error === 'string'
        ? (payload as Record<string, unknown>).error as string
        : `JARVIS voice returned HTTP ${response.status}.`;
      throw new Error(detail);
    }

    const bytes = await response.bytes();
    audioFile = new File(Paths.cache, `jarvis-${Date.now()}.mp3`);
    audioFile.write(bytes);
    audioUri = audioFile.uri;
  }

  await setAudioModeAsync({
    playsInSilentMode: true,
    interruptionMode: 'doNotMix',
  });

  stopJarvisVoice();

  const player = createAudioPlayer(audioUri, {
    updateInterval: 100,
    keepAudioSessionActive: false,
  });

  activePlayer = player;

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const cleanupFile = audioFile ?? new File(audioUri);

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
        cleanupFile.delete();
      } catch {
        // Cache cleanup is best effort.
      }

      if (error) reject(error);
      else resolve();
    };

    const subscription = player.addListener('playbackStatusUpdate', status => {
      const statusWithError = status as typeof status & { error?: string | null };

      if (statusWithError.error) {
        finish(new Error(statusWithError.error));
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
