import { fetch } from 'expo/fetch';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { planLocally } from '@/modules/organisePlan';

export type JarvisFolderItem = {
  name: string;
  isDirectory: boolean;
  size: number;
};

export type JarvisFolderMove = {
  file: string;
  destination: string;
};

export type JarvisOrganisationPlan = {
  summary: string;
  moves: JarvisFolderMove[];
  create_folders: string[];
};

const BASE_URL = (process.env.EXPO_PUBLIC_JARVIS_URL || '')
  .trim()
  .replace(/\/$/, '');

const GOOGLE_WEB_CLIENT_ID =
  (process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '').trim();

GoogleSignin.configure({
  webClientId: GOOGLE_WEB_CLIENT_ID,
});

async function getGoogleTokens(): Promise<{
  idToken: string;
  accessToken: string;
}> {
  if (!GOOGLE_WEB_CLIENT_ID) {
    throw new Error(
      'Google authentication is not configured for JARVIS.',
    );
  }

  try {
    let currentUser = GoogleSignin.getCurrentUser();

    if (!currentUser) {
      await GoogleSignin.hasPlayServices();
      await GoogleSignin.signIn();
      currentUser = GoogleSignin.getCurrentUser();
    }

    if (!currentUser) {
      throw new Error(
        'Please sign in with Google to use JARVIS.',
      );
    }

    const tokens = await GoogleSignin.getTokens();

    if (!tokens.idToken || !tokens.accessToken) {
      throw new Error(
        'Please sign in with Google to use JARVIS.',
      );
    }

    return {
      idToken: tokens.idToken,
      accessToken: tokens.accessToken,
    };
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

type JarvisRequestOptions = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
};

export async function fetchWithJarvisAuth(
  url: string,
  init: JarvisRequestOptions = {},
): Promise<Response> {
  const send = async (idToken: string) => {
    const headers = new Headers(init.headers);

    headers.set('Authorization', `Bearer ${idToken}`);

    return fetch(url, {
      method: init.method,
      headers,
      body: init.body,
    });
  };

  let tokens = await getGoogleTokens();

  let response = await send(tokens.idToken);

  if (response.status !== 401) {
    return response;
  }

  // The Android Google credential may be stale.
  // Clear the cached access token and request fresh tokens.
  try {
    await GoogleSignin.clearCachedAccessToken(
      tokens.accessToken,
    );
  } catch {
    // Continue; getTokens() may still refresh successfully.
  }

  try {
    tokens = await getGoogleTokens();
  } catch {
    // If silent recovery fails, explicitly sign in again.
    await GoogleSignin.hasPlayServices();
    await GoogleSignin.signIn();
    tokens = await getGoogleTokens();
  }

  response = await send(tokens.idToken);

  if (response.status !== 401) {
    return response;
  }

  // The refreshed credential was still rejected.
  // Give the user one fresh interactive sign-in attempt.
  await GoogleSignin.hasPlayServices();
  await GoogleSignin.signIn();

  tokens = await getGoogleTokens();

  return send(tokens.idToken);
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

function validatePlan(value: unknown): JarvisOrganisationPlan {
  if (!value || typeof value !== 'object') {
    throw new Error(
      'JARVIS returned an invalid organisation plan.',
    );
  }

  const plan = value as Record<string, unknown>;

  if (
    !Array.isArray(plan.moves) ||
    !Array.isArray(plan.create_folders)
  ) {
    throw new Error(
      'JARVIS returned an incomplete organisation plan.',
    );
  }

  const moves: JarvisFolderMove[] = [];

  for (const rawMove of plan.moves) {
    if (!rawMove || typeof rawMove !== 'object') continue;

    const move = rawMove as Record<string, unknown>;

    const file =
      typeof move.file === 'string'
        ? move.file.trim()
        : '';

    const destination =
      typeof move.destination === 'string'
        ? move.destination.trim()
        : '';

    if (
      !file ||
      !destination ||
      /[\\/]/.test(destination)
    ) {
      continue;
    }

    moves.push({
      file,
      destination,
    });
  }

  const create_folders = [
    ...new Set(
      plan.create_folders
        .filter(
          (name): name is string =>
            typeof name === 'string',
        )
        .map(name => name.trim())
        .filter(
          name => !!name && !/[\\/]/.test(name),
        ),
    ),
  ];

  return {
    summary:
      typeof plan.summary === 'string'
        ? plan.summary.trim()
        : '',
    moves,
    create_folders,
  };
}

export async function organiseFolderWithJarvis(
  currentPath: string,
  items: JarvisFolderItem[],
): Promise<JarvisOrganisationPlan> {
  const existingChildFolders = items
    .filter(item => item.isDirectory)
    .map(item => item.name)
    .filter(Boolean);

  // The device first: no network, no model, no cost. The backend only ever
  // asked Claude for compact extension and name rules, so the model was
  // being paid to reproduce a lookup table. null means this folder holds
  // nothing the table recognises, which is the one case worth asking about.
  const local = planLocally(currentPath, items, existingChildFolders);

  if (local) {
    return validatePlan(local);
  }

  if (!BASE_URL) {
    throw new Error(
      'JARVIS service is not configured.',
    );
  }

  const requestBody = JSON.stringify({
    current_path: currentPath,
    current_folder:
      currentPath
        .replace(/\/$/, '')
        .split('/')
        .pop() || 'Current folder',
    existing_child_folders:
      existingChildFolders,
    items: items.map(item => ({
      name: item.name,
      isDirectory: item.isDirectory,
      size: item.size || 0,
    })),
  });

  const response = await fetchWithJarvisAuth(
    `${BASE_URL}/api/jarvis/organise/`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: requestBody,
    },
  );

  const payload =
    (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    throw new Error(
      errorFromPayload(
        payload,
        `JARVIS returned HTTP ${response.status}.`,
      ),
    );
  }

  return validatePlan(payload);
}
