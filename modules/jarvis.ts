import { Platform } from 'react-native';
import { fetch } from 'expo/fetch';
import { postJson } from './jarvis-network';

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

function config() {
  const baseUrl = (process.env.EXPO_PUBLIC_JARVIS_URL || '').trim().replace(/\/$/, '');
  const token = (process.env.EXPO_PUBLIC_JARVIS_TOKEN || '').trim();

  if (!baseUrl || !token) {
    throw new Error(
      'JARVIS bridge is not configured. Set EXPO_PUBLIC_JARVIS_URL and EXPO_PUBLIC_JARVIS_TOKEN in the AskFiles debug environment.'
    );
  }

  return { baseUrl, token };
}

function validatePlan(value: unknown): JarvisOrganisationPlan {
  if (!value || typeof value !== 'object') {
    throw new Error('JARVIS returned an invalid organisation plan.');
  }

  const plan = value as Record<string, unknown>;

  if (!Array.isArray(plan.moves) || !Array.isArray(plan.create_folders)) {
    throw new Error('JARVIS returned an incomplete organisation plan.');
  }

  const moves: JarvisFolderMove[] = [];

  for (const rawMove of plan.moves) {
    if (!rawMove || typeof rawMove !== 'object') continue;
    const move = rawMove as Record<string, unknown>;
    const file = typeof move.file === 'string' ? move.file.trim() : '';
    const destination = typeof move.destination === 'string' ? move.destination.trim() : '';

    if (!file || !destination || /[\\/]/.test(destination)) continue;
    moves.push({ file, destination });
  }

  const create_folders = plan.create_folders
    .filter((name): name is string => typeof name === 'string')
    .map(name => name.trim())
    .filter(name => !!name && !/[\\/]/.test(name));

  return {
    summary: typeof plan.summary === 'string' ? plan.summary.trim() : '',
    moves,
    create_folders: [...new Set(create_folders)],
  };
}

function errorFromPayload(value: unknown, fallback: string): string {
  if (!value || typeof value !== 'object') return fallback;

  const error = (value as Record<string, unknown>).error;
  return typeof error === 'string' && error.trim() ? error : fallback;
}

export async function organiseFolderWithJarvis(
  currentPath: string,
  items: JarvisFolderItem[],
): Promise<JarvisOrganisationPlan> {
  const { baseUrl, token } = config();

  const existingChildFolders = items
    .filter(item => item.isDirectory)
    .map(item => item.name)
    .filter(Boolean);

  const requestBody = JSON.stringify({
    current_path: currentPath,
    current_folder: currentPath.replace(/\/$/, '').split('/').pop() || 'Current folder',
    existing_child_folders: existingChildFolders,
    items: items.map(item => ({
      name: item.name,
      isDirectory: item.isDirectory,
      size: item.size || 0,
    })),
  });

  let payload: unknown;

  if (Platform.OS === 'android') {
    const dnsIp = (process.env.EXPO_PUBLIC_JARVIS_TAILSCALE_IP || '').trim();

    if (!dnsIp) {
      throw new Error('JARVIS Tailscale IP is not configured.');
    }

    const responseText = await postJson(
      `${baseUrl}/askfiles/organise`,
      token,
      requestBody,
      new URL(baseUrl).hostname,
      dnsIp,
    );

    try {
      payload = JSON.parse(responseText) as unknown;
    } catch {
      throw new Error('JARVIS returned an invalid organisation response.');
    }
  } else {
    const response = await fetch(`${baseUrl}/askfiles/organise`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Jarvis-Token': token,
      },
      body: requestBody,
    });

    payload = await response.json().catch(() => null) as unknown;

    if (!response.ok) {
      throw new Error(
        errorFromPayload(payload, `JARVIS bridge returned HTTP ${response.status}.`),
      );
    }
  }

  return validatePlan(payload);
}
