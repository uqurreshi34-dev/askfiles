import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useState, useEffect } from 'react';

export const THEME_KEY = 'askfiles_theme_override';
export const LIGHT_PALETTE_KEY = 'askfiles_light_palette';
export const DARK_PALETTE_KEY = 'askfiles_dark_palette';

export type LightPalette = 'classic' | 'sage' | 'blush' | 'sky' | 'sand';
export type DarkPalette = 'classic' | 'navy' | 'brown' | 'forest';

export const LIGHT_PALETTES: { id: LightPalette; name: string; swatch: string }[] = [
  { id: 'classic', name: 'Classic', swatch: '#ffffff' },
  { id: 'sage', name: 'Sage', swatch: '#F0F4EC' },
  { id: 'blush', name: 'Blush', swatch: '#FAF0EE' },
  { id: 'sky', name: 'Sky', swatch: '#EDF3F8' },
  { id: 'sand', name: 'Sand', swatch: '#F7F2E9' },
];

export const DARK_PALETTES: { id: DarkPalette; name: string; swatch: string }[] = [
  { id: 'classic', name: 'Classic', swatch: '#111111' },
  { id: 'navy', name: 'Navy', swatch: '#0D1421' },
  { id: 'brown', name: 'Brown', swatch: '#1A120D' },
  { id: 'forest', name: 'Forest', swatch: '#0E1710' },
];

let globalDark: boolean | null = null;
let globalLightPalette: LightPalette | null = null;
let globalDarkPalette: DarkPalette | null = null;
const listeners: Array<(dark: boolean, lightPalette: LightPalette, darkPalette: DarkPalette) => void> = [];

export async function loadThemePreference(systemDark: boolean): Promise<boolean> {
  try {
    const saved = await AsyncStorage.getItem(THEME_KEY);
    if (saved === 'dark') return true;
    if (saved === 'light') return false;
    return systemDark;
  } catch {
    return systemDark;
  }
}

export async function loadLightPalettePreference(): Promise<LightPalette> {
  try {
    const saved = await AsyncStorage.getItem(LIGHT_PALETTE_KEY);
    return (saved as LightPalette) ?? 'classic';
  } catch {
    return 'classic';
  }
}

export async function loadDarkPalettePreference(): Promise<DarkPalette> {
  try {
    const saved = await AsyncStorage.getItem(DARK_PALETTE_KEY);
    return (saved as DarkPalette) ?? 'classic';
  } catch {
    return 'classic';
  }
}

export async function setThemePreference(dark: boolean): Promise<void> {
  globalDark = dark;
  await AsyncStorage.setItem(THEME_KEY, dark ? 'dark' : 'light');
  listeners.forEach(l => l(dark, globalLightPalette ?? 'classic', globalDarkPalette ?? 'classic'));
}

export async function setLightPalettePreference(palette: LightPalette): Promise<void> {
  globalLightPalette = palette;
  await AsyncStorage.setItem(LIGHT_PALETTE_KEY, palette);
  listeners.forEach(l => l(globalDark ?? false, palette, globalDarkPalette ?? 'classic'));
}

export async function setDarkPalettePreference(palette: DarkPalette): Promise<void> {
  globalDarkPalette = palette;
  await AsyncStorage.setItem(DARK_PALETTE_KEY, palette);
  listeners.forEach(l => l(globalDark ?? false, globalLightPalette ?? 'classic', palette));
}

export function useTheme() {
  const scheme = useColorScheme();
  const systemDark = scheme === 'dark';
  const [dark, setDark] = useState<boolean>(globalDark ?? systemDark);
  const [lightPalette, setLightPaletteState] = useState<LightPalette>(globalLightPalette ?? 'classic');
  const [darkPalette, setDarkPaletteState] = useState<DarkPalette>(globalDarkPalette ?? 'classic');

  useEffect(() => {
    if (globalDark === null) {
      loadThemePreference(systemDark).then(d => { globalDark = d; setDark(d); });
    }
    if (globalLightPalette === null) {
      loadLightPalettePreference().then(p => { globalLightPalette = p; setLightPaletteState(p); });
    }
    if (globalDarkPalette === null) {
      loadDarkPalettePreference().then(p => { globalDarkPalette = p; setDarkPaletteState(p); });
    }
    const listener = (d: boolean, lp: LightPalette, dp: DarkPalette) => {
      setDark(d); setLightPaletteState(lp); setDarkPaletteState(dp);
    };
    listeners.push(listener);
    return () => {
      const i = listeners.indexOf(listener);
      if (i > -1) listeners.splice(i, 1);
    };
  }, []);

  const activePalette = dark ? darkPalette : lightPalette;

  return {
    dark,
    palette: activePalette,
    toggleTheme: () => setThemePreference(!dark),
    setPalette: (p: LightPalette | DarkPalette) => {
      if (dark) setDarkPalettePreference(p as DarkPalette);
      else setLightPalettePreference(p as LightPalette);
    },
    colors: getColors(dark, activePalette),
  };
}

function getBackgroundSet(dark: boolean, palette: string) {
  const sets: Record<string, { background: string; surface: string; surfaceAlt: string; card: string; border: string; divider: string }> = {
    classicLight: { background: '#ffffff', surface: '#F1EFE8', surfaceAlt: '#FAFAF8', card: '#ffffff', border: '#F1EFE8', divider: '#E8E6DF' },
    classicDark: { background: '#111111', surface: '#1E1E1E', surfaceAlt: '#1A1A1A', card: '#1E1E1E', border: '#2A2A2A', divider: '#2A2A2A' },
    sage:  { background: '#F0F4EC', surface: '#E4EBDC', surfaceAlt: '#F7FAF3', card: '#E4EBDC', border: '#DCE5D2', divider: '#D6E0CA' },
    blush: { background: '#FAF0EE', surface: '#F3E2DE', surfaceAlt: '#FDF6F5', card: '#F3E2DE', border: '#F0DDD9', divider: '#EBD3CD' },
    sky:   { background: '#EDF3F8', surface: '#DEE9F2', surfaceAlt: '#F5F9FC', card: '#DEE9F2', border: '#D6E4EF', divider: '#CCDCEA' },
    sand:  { background: '#F7F2E9', surface: '#EFE6D4', surfaceAlt: '#FBF7EF', card: '#EFE6D4', border: '#EBE0CB', divider: '#E4D6BC' },
    navy: { background: '#0D1421', surface: '#161F30', surfaceAlt: '#131B29', card: '#161F30', border: '#232E42', divider: '#232E42' },
    brown: { background: '#1A120D', surface: '#251A13', surfaceAlt: '#1F1610', card: '#251A13', border: '#33241A', divider: '#33241A' },
    forest: { background: '#0E1710', surface: '#182319', surfaceAlt: '#131D15', card: '#182319', border: '#233024', divider: '#233024' },
  };
  if (palette === 'classic') return dark ? sets.classicDark : sets.classicLight;
  return sets[palette];
}

export function getColors(dark: boolean, palette: string = 'classic') {
  const bg = getBackgroundSet(dark, palette);
  return {
      background: bg.background,
      surface: bg.surface,
      surfaceAlt: bg.surfaceAlt,
      card: bg.card,

      textPrimary: dark ? '#F5F5F5' : '#111111',
      textSecondary: dark ? '#A0A09A' : '#5F5E5A',
      textMuted: dark ? '#6B6B65' : '#888780',
      textDisabled: dark ? '#3A3A3A' : '#D3D1C7',

      border: bg.border,
      divider: bg.divider,

      blue: '#185FA5',
      purple: '#534AB7',
      redBrown: '#993C1D',
      green: '#3B6D11',
      amber: '#854F0B',
      favRed: '#C0392B',
      deleteRed: '#E24B4A',
      trashAmber: '#E65100',
      yellow: '#BA7517',

      blueBg: dark ? '#0D2A47' : '#E6F1FB',
      purpleBg: dark ? '#1E1A4A' : '#EEEDFE',
      redBrownBg: dark ? '#3A1A0F' : '#FAECE7',
      greenBg: dark ? '#152A09' : '#EAF3DE',
      favRedBg: dark ? '#3A0F0F' : '#FEE9E9',
      trashBg: dark ? '#2A1A00' : '#FFF3E0',

      blueTint: dark ? '#0D2A47' : '#EBF3FC',
      purpleTint: dark ? '#1E1A4A' : '#D9D8F8',
      redBrownTint: dark ? '#3A1A0F' : '#F5D5CB',
      amberTint: dark ? '#3A2A09' : '#FEF3E2',

      overlay: 'rgba(0,0,0,0.5)',
      modalCard: bg.card,

      busyBg: dark ? '#0D2A47' : '#EBF3FC',
      busyText: '#185FA5',

      successGreen: dark ? '#4CAF50' : '#3B6D11',
  };
}
