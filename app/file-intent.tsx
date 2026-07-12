import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { getPendingIntentType, clearPendingIntent } from '@/modules/pdf-viewer';

export default function FileIntentScreen() {
  const router = useRouter();
  const { uri, type } = useLocalSearchParams<{ uri?: string; type?: string }>();

  useEffect(() => {
    const handle = setImmediate(() => {
      try {
        const pending = getPendingIntentType();
        clearPendingIntent();

        if (pending?.type === 'pdf') {
          const pdfUri = pending.uri;
          router.replace('/(tabs)');
          setImmediate(() => {
            router.push(`/pdf-viewer?incomingUri=${encodeURIComponent(pdfUri)}`);
          });
          return;
        }

        if (pending?.type === 'csv') {
          const csvUri = pending.uri;
          router.replace('/(tabs)');
          setImmediate(() => {
            router.push(`/csv-reader?incomingUri=${encodeURIComponent(csvUri)}`);
          });
          return;
        }

        if (pending?.type === 'text') {
          const textUri = pending.uri;
          router.replace('/(tabs)');
          setImmediate(() => {
            router.push(`/text-editor?incomingUri=${encodeURIComponent(textUri)}`);
          });
          return;
        }

        const rawUri = uri ? decodeURIComponent(uri) : null;
        if (!rawUri) {
          router.replace('/(tabs)');
          return;
        }

        if (type === 'pdf') {
          router.replace('/(tabs)');
          setImmediate(() => {
            router.push(`/pdf-viewer?incomingUri=${encodeURIComponent(rawUri)}`);
          });
          return;
        }

        if (type === 'text') {
          router.replace('/(tabs)');
          setImmediate(() => {
            router.push(`/text-editor?incomingUri=${encodeURIComponent(rawUri)}`);
          });
          return;
        }

        router.replace('/(tabs)');
      } catch {
        router.replace('/(tabs)');
      }
    });
    return () => clearImmediate(handle);
  }, []);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator size="large" />
    </View>
  );
}
