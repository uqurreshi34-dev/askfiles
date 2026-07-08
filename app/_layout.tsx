import { Stack, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View, Animated, Easing } from 'react-native';
import { isAppLockEnabled } from '@/hooks/usePin';
import * as SplashScreen from 'expo-splash-screen';
import { usePathname } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFileWatcher } from '@/hooks/useFileWatcher';
import { isCloudSyncing, addCloudSyncListener } from '@/hooks/useCloudSync';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';
import * as QuickActions from 'expo-quick-actions';
import { useQuickActionRouting } from 'expo-quick-actions/router';
import * as ExpoInAppUpdates from 'expo-in-app-updates';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useFileWatcher();
  const router = useRouter();
  const { dark } = useTheme();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  //cloud backup in progress
  const syncPulse = useRef(new Animated.Value(1)).current;
  const [cloudSyncing, setCloudSyncing] = useState(isCloudSyncing());

  useQuickActionRouting();

  useEffect(() => {
    const { setBackgroundColorAsync } = require('expo-system-ui');
    setBackgroundColorAsync(dark ? '#111111' : '#ffffff');
  }, [dark]);

  useEffect(() => {
    QuickActions.setItems([
      { id: 'smb', title: 'SMB — Windows / NAS', icon: 'shortcut_network', params: { href: '/smb' } },
      { id: 'sftp', title: 'SFTP — Server / NAS', icon: 'shortcut_sftp', params: { href: '/sftp' } },
    ]);
  }, []);

  useEffect(() => {
    if (__DEV__) return;
    const checkUpdate = async () => {
      try {
        const result = await ExpoInAppUpdates.checkForUpdate();
        if (result.updateAvailable) {
          await ExpoInAppUpdates.startUpdate();
        }
      } catch {}
    };
    checkUpdate();
  }, []);

  useEffect(() => {
    const unsub = addCloudSyncListener(() => {
      setCloudSyncing(isCloudSyncing());
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (cloudSyncing) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(syncPulse, { toValue: 0.3, duration: 600, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
          Animated.timing(syncPulse, { toValue: 1, duration: 600, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        ])
      ).start();
    } else {
      syncPulse.stopAnimation();
      syncPulse.setValue(1);
    }
  }, [cloudSyncing]);


  useEffect(() => {
    const enabled = isAppLockEnabled();
    if (enabled) {
      setTimeout(() => {
        const lastAction = QuickActions.initial;
        const dest = lastAction?.params?.href;
        router.replace(dest ? `/lockscreen?next=${encodeURIComponent(dest)}` : '/lockscreen');
        SplashScreen.hideAsync();
      }, 0);
    } else {
      SplashScreen.hideAsync();
    }
  }, []);


  useEffect(() => {
    if (!onboardingChecked) {
      AsyncStorage.getItem('askfiles-onboarding-done').then(val => {
        if (val) setOnboardingChecked(true);
      }).catch(() => {});
    }
  }, [pathname]);

  return (
    <View style={{ flex: 1, paddingTop: insets.top }}>
      {cloudSyncing && (
        <Animated.View style={{
          position: 'absolute',
          top: insets.top,
          left: insets.left,
          right: insets.right,
          height: 3,
          zIndex: 9999,
          backgroundColor: '#185FA5',
          opacity: syncPulse,
        }} />
      )}
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="lockscreen" />
        <Stack.Screen name="setpin" />
        <Stack.Screen name="vault" />
        <Stack.Screen name="duplicates" />
        <Stack.Screen name="backup" />
        <Stack.Screen name="sensitive-files" />
        <Stack.Screen name="trash" />
        <Stack.Screen name="csv-reader" options={{ animation: 'none'}} />
        <Stack.Screen name="pdf-viewer" options={{ animation: 'none' }}/>
        <Stack.Screen name="text-editor" options={{ animation: 'none' }} />
        <Stack.Screen name="file-intent" options={{ animation: 'none' }} />
      </Stack>
    </View>
  );
}
