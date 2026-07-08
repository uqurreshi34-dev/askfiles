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

        if (pending?.type === 'pdf') {
          clearPendingIntent();
          router.replace(`/pdf-viewer?incomingUri=${encodeURIComponent(pending.uri)}`);
          return;
        }

        if (pending?.type === 'csv') {
          clearPendingIntent();
          router.replace(`/csv-reader?incomingUri=${encodeURIComponent(pending.uri)}`);
          return;
        }

        const rawUri = uri ? decodeURIComponent(uri) : null;
        if (!rawUri) {
          router.replace('/(tabs)');
          return;
        }

        if (type === 'pdf') {
          router.replace(`/pdf-viewer?incomingUri=${encodeURIComponent(rawUri)}`);
          return;
        }

        router.replace(`/csv-reader?incomingUri=${encodeURIComponent(rawUri)}`);
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
