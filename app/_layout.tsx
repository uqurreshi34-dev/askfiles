import { Stack, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import { isAppLockEnabled } from '@/hooks/usePin';

export default function RootLayout() {
  const router = useRouter();

  useEffect(() => {
    ExpoSpeechRecognitionModule.requestPermissionsAsync();
  }, []);

  useEffect(() => {
    async function checkLock() {
      const enabled = await isAppLockEnabled();
      if (enabled) {
        router.replace('/lockscreen');
      }
    }
    checkLock();
  }, []);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="lockscreen" />
      <Stack.Screen name="setpin" />
      <Stack.Screen name="vault" />
      <Stack.Screen name="duplicates" />
      <Stack.Screen name="backup" />
    </Stack>
  );
}
