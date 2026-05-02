import { Stack, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import { isAppLockEnabled } from '@/hooks/usePin';
import * as SplashScreen from 'expo-splash-screen';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const router = useRouter();

  useEffect(() => {
    ExpoSpeechRecognitionModule.requestPermissionsAsync();
  }, []);

  useEffect(() => {
    isAppLockEnabled().then(enabled => {
      if (enabled) router.replace('/lockscreen');
      SplashScreen.hideAsync();
    });
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
