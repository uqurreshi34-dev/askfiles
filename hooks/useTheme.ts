import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useState, useEffect } from 'react';

const THEME_KEY = 'askfiles_theme_override';
let globalDark: boolean | null = null;
const listeners: Array<(dark: boolean) => void> = [];

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

export async function setThemePreference(dark: boolean): Promise<void> {
  globalDark = dark;
  await AsyncStorage.setItem(THEME_KEY, dark ? 'dark' : 'light');
  listeners.forEach(l => l(dark));
}

export function useTheme() {
  const scheme = useColorScheme();
  const systemDark = scheme === 'dark';
  const [dark, setDark] = useState<boolean>(globalDark ?? systemDark);

  useEffect(() => {
    if (globalDark === null) {
      loadThemePreference(systemDark).then(d => {
        globalDark = d;
        setDark(d);
      });
    }
    const listener = (d: boolean) => setDark(d);
    listeners.push(listener);
    return () => {
      const i = listeners.indexOf(listener);
      if (i > -1) listeners.splice(i, 1);
    };
  }, []);

  return {
    dark,
    toggleTheme: () => setThemePreference(!dark),
    colors: getColors(dark),
  };
}

export function getColors(dark: boolean) {
  return {
      // Backgrounds
      background: dark ? '#111111' : '#ffffff',
      surface: dark ? '#1E1E1E' : '#F1EFE8',
      surfaceAlt: dark ? '#1A1A1A' : '#FAFAF8',
      card: dark ? '#1E1E1E' : '#ffffff',

      // Text
      textPrimary: dark ? '#F5F5F5' : '#111111',
      textSecondary: dark ? '#A0A09A' : '#5F5E5A',
      textMuted: dark ? '#6B6B65' : '#888780',
      textDisabled: dark ? '#3A3A3A' : '#D3D1C7',

      // Borders & dividers
      border: dark ? '#2A2A2A' : '#F1EFE8',
      divider: dark ? '#2A2A2A' : '#E8E6DF',

      // Accents — same in both modes
      blue: '#185FA5',
      purple: '#534AB7',
      redBrown: '#993C1D',
      green: '#3B6D11',
      amber: '#854F0B',
      favRed: '#C0392B',
      deleteRed: '#E24B4A',
      trashAmber: '#E65100',
      yellow: '#BA7517',

      // Tinted backgrounds for category cards
      blueBg: dark ? '#0D2A47' : '#E6F1FB',
      purpleBg: dark ? '#1E1A4A' : '#EEEDFE',
      redBrownBg: dark ? '#3A1A0F' : '#FAECE7',
      greenBg: dark ? '#152A09' : '#EAF3DE',
      favRedBg: dark ? '#3A0F0F' : '#FEE9E9',
      trashBg: dark ? '#2A1A00' : '#FFF3E0',

      // Tinted icon backgrounds
      blueTint: dark ? '#0D2A47' : '#EBF3FC',
      purpleTint: dark ? '#1E1A4A' : '#D9D8F8',
      redBrownTint: dark ? '#3A1A0F' : '#F5D5CB',
      amberTint: dark ? '#3A2A09' : '#FEF3E2',

      // Sheet / modal overlay
      overlay: 'rgba(0,0,0,0.5)',
      modalCard: dark ? '#1E1E1E' : '#ffffff',

      // Busy banner
      busyBg: dark ? '#0D2A47' : '#EBF3FC',
      busyText: '#185FA5',

      successGreen: dark ? '#4CAF50' : '#3B6D11',
  };
}
