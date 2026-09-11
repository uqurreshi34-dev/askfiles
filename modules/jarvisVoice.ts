import { fetch } from 'expo/fetch';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import {
  createAudioPlayer,
  setAudioModeAsync,
} from 'expo-audio';
import { File, Paths } from 'expo-file-system';

const BASE_URL = (process.env.EXPO_PUBLIC_JARVIS_URL || '')
  .trim()
  .replace(/\/$/, '');

const GOOGLE_WEB_CLIENT_ID =
  (process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '').trim();

GoogleSignin.configure({
  webClientId: GOOGLE_WEB_CLIENT_ID,
});

let activePlayer:
  ReturnType<typeof createAudioPlayer> | null = null;

async function getIdToken(): Promise<string> {
  if (!GOOGLE_WEB_CLIENT_ID) {
    throw new Error(
      'Google authentication is not configured for JARVIS.',
    );
  }

  try {
    const currentUser =
      await GoogleSignin.getCurrentUser();

    if (!currentUser) {
      throw new Error(
        'Please sign in with Google to use JARVIS.',
      );
    }

    const tokens = await GoogleSignin.getTokens();

    if (!tokens.idToken) {
      throw new Error(
        'Please sign in with Google to use JARVIS.',
      );
    }

    return tokens.idToken;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('Please sign in')
    ) {
      throw error;
    }

    throw new Error(
      'Please sign in with Google to use JARVIS.',
    );
  }
}

function errorFromPayload(
  value: unknown,
  fallback: string,
): string {
  if (!value || typeof value !== 'object') {
    return fallback;
  }

  const error =
    (value as Record<string, unknown>).error;

  return typeof error === 'string' && error.trim()
    ? error
    : fallback;
}

export function stopJarvisVoice() {
  if (!activePlayer) return;

  try {
    activePlayer.remove();
  } catch {
    // Player may already have been released.
  }

  activePlayer = null;
}

export async function speakWithJarvis(
  text: string,
): Promise<void> {
  const message = (text || '').trim();

  if (!message) return;

  if (!BASE_URL) {
    throw new Error(
      'JARVIS service is not configured.',
    );
  }

  const idToken = await getIdToken();

  const response = await fetch(
    `${BASE_URL}/api/jarvis/audio/`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        text: message,
      }),
    },
  );

  if (!response.ok) {
    const payload =
      (await response.json().catch(() => null)) as unknown;

    throw new Error(
      errorFromPayload(
        payload,
        `JARVIS voice returned HTTP ${response.status}.`,
      ),
    );
  }

  const bytes = await response.bytes();

  if (!bytes || bytes.length === 0) {
    throw new Error('JARVIS returned no audio.');
  }

  const audioFile = new File(
    Paths.cache,
    `jarvis-${Date.now()}.mp3`,
  );

  audioFile.write(bytes);

  await setAudioModeAsync({
    playsInSilentMode: true,
    interruptionMode: 'doNotMix',
  });

  stopJarvisVoice();

  const player = createAudioPlayer(
    audioFile.uri,
    {
      updateInterval: 100,
      keepAudioSessionActive: false,
    },
  );

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
        audioFile.delete();
      } catch {
        // Cache cleanup is best effort.
      }

      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };

    const subscription =
      player.addListener(
        'playbackStatusUpdate',
        status => {
          const statusWithError =
            status as typeof status & {
              error?: string | null;
            };

          if (statusWithError.error) {
            finish(
              new Error(
                statusWithError.error,
              ),
            );
          } else if (status.didJustFinish) {
            finish();
          }
        },
      );

    try {
      player.play();
    } catch (error) {
      finish(
        error instanceof Error
          ? error
          : new Error(String(error)),
      );
    }
  });
}
