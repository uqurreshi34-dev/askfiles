// Finishes a OneDrive or Dropbox sign-in even if Android closed AskFiles
// while the user was in the browser (passkey or fingerprint screens can
// do this). Before leaving the app we save the PKCE verifier; when the
// askfiles://callback link comes back, whichever screen sees it first
// (the cloud hook or the callback screen) exchanges the code once.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { exchangeCodeAsync, makeRedirectUri } from 'expo-auth-session';

export type CloudProvider = 'onedrive' | 'dropbox';

type Pending = { provider: CloudProvider; codeVerifier: string; state: string; at: number };

const PENDING_KEY = 'cloud_auth_pending';
const MAX_AGE_MS = 15 * 60 * 1000; // a sign-in left for 15 minutes is abandoned

export const redirectUri = makeRedirectUri({ scheme: 'askfiles', path: 'callback' });

export const CLOUD_AUTH = {
  onedrive: {
    clientId: process.env.EXPO_PUBLIC_ONEDRIVE_CLIENT_ID ?? '',
    discovery: {
      authorizationEndpoint: 'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize',
      tokenEndpoint: 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token',
    },
    tokenKey: 'onedrive_access_token',
    refreshKey: 'onedrive_refresh_token',
  },
  dropbox: {
    clientId: process.env.EXPO_PUBLIC_DROPBOX_CLIENT_ID ?? '',
    discovery: {
      authorizationEndpoint: 'https://www.dropbox.com/oauth2/authorize',
      tokenEndpoint: 'https://api.dropboxapi.com/oauth2/token',
    },
    tokenKey: 'dropbox_access_token',
    refreshKey: 'dropbox_refresh_token',
  },
} as const;

/** Call right before opening the sign-in page. */
export async function rememberSignIn(provider: CloudProvider, codeVerifier?: string, state?: string) {
  if (!codeVerifier || !state) return;
  const pending: Pending = { provider, codeVerifier, state, at: Date.now() };
  try { await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(pending)); } catch {}
}

const inFlight = new Map<string, Promise<CloudProvider | null>>();

/**
 * Exchanges the returned code for tokens using the saved sign-in.
 * Safe to call from several places: each code is exchanged once.
 * Returns the provider that was connected, or null.
 */
export function completeSignIn(code?: string, state?: string): Promise<CloudProvider | null> {
  if (!code || !state) return Promise.resolve(null);
  const running = inFlight.get(code);
  if (running) return running;

  const job = (async (): Promise<CloudProvider | null> => {
    let pending: Pending | null = null;
    try { pending = JSON.parse((await AsyncStorage.getItem(PENDING_KEY)) ?? 'null'); } catch {}
    // The state must match the sign-in we started, otherwise ignore the link.
    if (!pending || pending.state !== state || Date.now() - pending.at > MAX_AGE_MS) return null;
    await AsyncStorage.removeItem(PENDING_KEY).catch(() => {});

    const cfg = CLOUD_AUTH[pending.provider];
    const tokens = await exchangeCodeAsync(
      { clientId: cfg.clientId, code, redirectUri, extraParams: { code_verifier: pending.codeVerifier } },
      cfg.discovery,
    );
    await AsyncStorage.setItem(cfg.tokenKey, tokens.accessToken);
    if (tokens.refreshToken) await AsyncStorage.setItem(cfg.refreshKey, tokens.refreshToken);
    return pending.provider;
  })();

  inFlight.set(code, job);
  return job;
}
