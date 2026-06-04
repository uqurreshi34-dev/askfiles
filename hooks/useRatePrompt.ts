import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'askfiles_rate_prompted';

export async function shouldShowRatePrompt(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(KEY);
    return val === null;
  } catch {
    return false;
  }
}

export async function markRatePromptShown(): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, 'true');
  } catch {}
}
