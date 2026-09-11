import { fetch } from 'expo/fetch';
import { GoogleSignin } from '@react-native-google-signin/google-signin';

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

async function getGoogleIdToken(): Promise<string> {
  if (!GOOGLE_WEB_CLIENT_ID) {
    throw new Error(
      'Google authentication is not configured for JARVIS.',
    );
  }

  try {
    let currentUser = await GoogleSignin.getCurrentUser();

    if (!currentUser) {
      await GoogleSignin.hasPlayServices();
      await GoogleSignin.signIn();
      currentUser = await GoogleSignin.getCurrentUser();
    }

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
  if (!BASE_URL) {
    throw new Error(
      'JARVIS service is not configured.',
    );
  }

  const existingChildFolders = items
    .filter(item => item.isDirectory)
    .map(item => item.name)
    .filter(Boolean);

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

  const idToken = await getGoogleIdToken();

  const response = await fetch(
    `${BASE_URL}/api/jarvis/organise/`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
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
