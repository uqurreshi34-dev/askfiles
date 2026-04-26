import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';

export default function RootLayout() {
  useEffect(() => {
    ExpoSpeechRecognitionModule.requestPermissionsAsync().then(r => 
      console.log('mic permission:', JSON.stringify(r))
    );
  }, []);
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="vault" />
      <Stack.Screen name="duplicates" />
      <Stack.Screen name="backup" />
    </Stack>
  );
}
