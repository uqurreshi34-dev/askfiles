import { useEffect } from 'react';
import * as WebBrowser from 'expo-web-browser';
import { View } from 'react-native';
import { useRouter } from 'expo-router';

WebBrowser.maybeCompleteAuthSession();

export default function CallbackScreen() {
  const router = useRouter();

  useEffect(() => {
    router.back();
  }, []);

  return <View />;
}
