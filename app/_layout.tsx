import { Stack, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View, Animated, Text, Easing, PanResponder, Dimensions, TouchableOpacity } from 'react-native';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { Ionicons } from '@expo/vector-icons';
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


export let isAiSearchListening = false;
export function setAiSearchListening(val: boolean) { isAiSearchListening = val; }

SplashScreen.preventAutoHideAsync();

const { width: SW, height: SH } = Dimensions.get('window');
const MIC_SIZE = 52;
const DEFAULT_X = SW - MIC_SIZE - 20;
const DEFAULT_Y = SH - 160;
const MIC_POS_KEY = 'askfiles-mic-position';

const COMMANDS = [
  { keywords: ['storage breakdown', 'storage info', 'storage stats', 'storage'], route: '/storage-breakdown' },
  { keywords: ['large files'], route: '/large-files' },
  { keywords: ['sensitive files', 'personal files', 'secret files', 'confidential files'], route: '/sensitive-files' },
  { keywords: ['duplicates', 'dupes'], route: '/duplicates' },
  { keywords: ['internal', 'free space', 'how much space'], route: '/(tabs)/' },
  { keywords: ['vault', 'locked', 'private'], route: '/vault' },
  { keywords: ['favourite', 'favorite'], route: '/favourites' },
  { keywords: ['cloud', 'pro', 'upgrade', 'premium'], route: '/(tabs)/cloud' },
  { keywords: ['photo', 'picture', 'gallery', 'screenshot', 'image'], route: '/category?category=images' },
  { keywords: ['video', 'film', 'movie', 'clip'], route: '/category?category=videos' },
  { keywords: ['pdf', 'document', 'spreadsheet', 'excel'], route: '/category?category=documents' },
  { keywords: ['download', 'apk'], route: '/category?category=downloads' },
  { keywords: ['search', 'find'], route: '/(tabs)/search' },
  { keywords: ['browse', 'folders', 'explore'], route: '/(tabs)/browse' },
  { keywords: ['home', 'start', 'main page', 'main screen'], route: '/(tabs)/' },
  { keywords: ['trash', 'bin', 'recycle bin', 'rubbish', 'delete', 'deleted', 'deletion'], route: '/trash' },
];

function parseCommand(transcript: string): string | null {
  const lower = transcript.toLowerCase();
  for (const cmd of COMMANDS) {
    if (cmd.keywords.some(k => lower.includes(k))) return cmd.route;
  }
  return null;
}

function getBannerLabel(route: string): string {
  if (route.includes('images')) return 'Images';
  if (route.includes('videos')) return 'Videos';
  if (route.includes('documents')) return 'Documents';
  if (route.includes('downloads')) return 'Downloads';
  if (route.includes('browse')) return 'Browse';
  if (route.includes('search')) return 'Search';
  if (route.includes('vault')) return 'Vault';
  if (route.includes('favourite')) return 'Favourites';
  if (route.includes('cloud')) return 'Cloud';
  if (route.includes('duplicate')) return 'Duplicates';
  if (route.includes('large')) return 'Large Files';
  if (route.includes('sensitive')) return 'Sensitive Files';
  return 'Screen';
}

const HIDDEN_ON = ['/lockscreen', '/onboarding', '/setpin'];

export default function RootLayout() {
  useFileWatcher();
  const router = useRouter();
  const { dark } = useTheme();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const [listening, setListening] = useState(false);
  const [banner, setBanner] = useState<{ text: string; success: boolean } | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const bannerAnim = useRef(new Animated.Value(0)).current;
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transcriptRef = useRef('');

  // Draggable position
  const posRef = useRef({ x: DEFAULT_X, y: DEFAULT_Y });
  const dragStart = useRef({ x: DEFAULT_X, y: DEFAULT_Y });
  const pan = useRef(new Animated.ValueXY({ x: DEFAULT_X, y: DEFAULT_Y })).current;
  const isDragging = useRef(false);

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
      { id: 'smb', title: 'Network (SMB)', icon: 'shortcut_network', params: { href: '/smb' } },
    ]);
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

  // Load saved position
  useEffect(() => {
    AsyncStorage.getItem(MIC_POS_KEY).then(val => {
      if (val) {
        const saved = JSON.parse(val);
        posRef.current = saved;
        pan.setValue(saved);
      }
    }).catch(() => {});
    AsyncStorage.getItem('askfiles-mic-tooltip-seen').then(val => {
      if (!val) setShowTooltip(true);
    }).catch(() => {});
    AsyncStorage.getItem('askfiles-onboarding-done').then(val => {
      if (val) setOnboardingChecked(true);
      // For fresh installs, mic will show after onboarding sets the key
    }).catch(() => {});
  }, []);

  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
      isDragging.current = false;
      dragStart.current = { x: posRef.current.x, y: posRef.current.y };
      // Start mic after short hold — distinguishes tap-hold from drag
      pressTimer.current = setTimeout(async () => {
        if (!isDragging.current) {
          const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
          if (!granted) {
            showBanner('Microphone access needed for voice navigation', false);
            return;
          }
          transcriptRef.current = '';
          setListening(true);
          startPulse();
          ExpoSpeechRecognitionModule.start({ lang: 'en-US', interimResults: true });
        }
      }, 300);
    },
    onPanResponderMove: (_, g) => {
      if (Math.abs(g.dx) > 6 || Math.abs(g.dy) > 6) {
        if (!isDragging.current) {
          isDragging.current = true;
          if (pressTimer.current) clearTimeout(pressTimer.current);
          // Cancel mic if we started it before drag threshold
          if (listening) {
            ExpoSpeechRecognitionModule.stop();
            setListening(false);
            stopPulse();
          }
        }
        const newX = Math.max(0, Math.min(SW - MIC_SIZE, dragStart.current.x + g.dx));
        const newY = Math.max(0, Math.min(SH - MIC_SIZE - 80, dragStart.current.y + g.dy));
        pan.setValue({ x: newX, y: newY });
        posRef.current = { x: newX, y: newY };
      }
    },
    onPanResponderRelease: () => {
      if (pressTimer.current) clearTimeout(pressTimer.current);
      if (isDragging.current) {
        isDragging.current = false;
        AsyncStorage.setItem(MIC_POS_KEY, JSON.stringify(posRef.current)).catch(() => {});
      } else {
        // It was a hold — stop mic
        ExpoSpeechRecognitionModule.stop();
      }
    },
  })).current;

  useEffect(() => {
    const enabled = isAppLockEnabled();
    if (enabled) {
      setTimeout(() => {
        router.replace('/lockscreen');
        SplashScreen.hideAsync();
      }, 0);
    } else {
      SplashScreen.hideAsync();
    }
  }, []);

  useSpeechRecognitionEvent('result', (e) => {
    const text = e.results?.[0]?.transcript ?? '';
    if (text) transcriptRef.current = text;
  });

  useSpeechRecognitionEvent('end', () => {
    setListening(false);
    stopPulse();
    if (isAiSearchListening) return;
    const transcript = transcriptRef.current;
    transcriptRef.current = '';
    if (!transcript) return;
    const route = parseCommand(transcript);
    if (route) {
      // Show banner first, navigate after banner appears
      showBanner(`Opening ${getBannerLabel(route)}...`, true, () => {
        router.push(route as any);
      });
    } else {
      showBanner(`Try: "Open Images" or "Go to Browse"`, false);
    }
  });

  useSpeechRecognitionEvent('error', () => {
    setListening(false);
    stopPulse();
    transcriptRef.current = '';
  });

  function showBanner(text: string, success: boolean, onShown?: () => void) {
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    setBanner({ text, success });
    Animated.timing(bannerAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start(() => {
      onShown?.();
    });
    bannerTimer.current = setTimeout(() => {
      Animated.timing(bannerAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setBanner(null));
    }, 2000);
  }

  function startPulse() {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.3, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
  }

  function stopPulse() {
    pulseAnim.stopAnimation();
    Animated.timing(pulseAnim, { toValue: 1, duration: 150, useNativeDriver: true }).start();
  }

  useEffect(() => {
    if (!onboardingChecked) {
      AsyncStorage.getItem('askfiles-onboarding-done').then(val => {
        if (val) setOnboardingChecked(true);
      }).catch(() => {});
    }
  }, [pathname]);

  const showMic = onboardingChecked && !!pathname && !HIDDEN_ON.some(p => pathname.startsWith(p)) && SH > SW;

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
      </Stack>

      {showMic && (
        <Animated.View
          style={{
            position: 'absolute',
            left: pan.x,
            top: pan.y,
            alignItems: 'center',
          }}
          {...panResponder.panHandlers}
        >
          {/* Banner — appears above mic, anchored to mic position */}
          {banner && (
            <Animated.View style={{
              opacity: bannerAnim,
              position: 'absolute',
              bottom: MIC_SIZE + 10,
              right: 0,
              backgroundColor: banner.success ? '#185FA5' : '#5F5E5A',
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 20,
              width: 180,
            }}>
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '500', textAlign: 'center' }}>
                {banner.text}
              </Text>
            </Animated.View>
          )}

          {/* Tooltip */}
          {showTooltip && (
            <Animated.View style={{
              position: 'absolute',
              bottom: MIC_SIZE + 10,
              right: 0,
              backgroundColor: dark ? '#fff' : '#222',
              paddingHorizontal: 12,
              paddingVertical: 10,
              borderRadius: 12,
              width: 200,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.2,
              shadowRadius: 8,
              elevation: 8,
            }}>
              <Text style={{ color: dark ? '#111' : '#fff', fontSize: 12, fontWeight: '600', marginBottom: 3 }}>
                🎤 Voice Navigation
              </Text>
              <Text style={{ color: dark ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.75)', fontSize: 11, lineHeight: 16 }}>
                Hold to navigate by voice. Drag to move.
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setShowTooltip(false);
                  AsyncStorage.setItem('askfiles-mic-tooltip-seen', 'true').catch(() => {});
                }}
                style={{ marginTop: 8, alignSelf: 'flex-end' }}
              >
                <Text style={{ color: '#185FA5', fontSize: 11, fontWeight: '600' }}>Got it</Text>
              </TouchableOpacity>
              {/* Arrow pointing down to mic */}
              <View style={{
                position: 'absolute',
                bottom: -6,
                right: 20,
                width: 12,
                height: 12,
                backgroundColor: dark ? '#fff' : '#222',
                transform: [{ rotate: '45deg' }],
              }} />
            </Animated.View>
          )}
          {/* Pulse ring */}

          <Animated.View style={{
            position: 'absolute',
            width: MIC_SIZE + 4,
            height: MIC_SIZE + 4,
            borderRadius: (MIC_SIZE + 4) / 2,
            backgroundColor: listening ? '#185FA520' : 'transparent',
            transform: [{ scale: pulseAnim }],
          }} />

          {/* Mic button */}
          <View
            style={{
              width: MIC_SIZE,
              height: MIC_SIZE,
              borderRadius: MIC_SIZE / 2,
              backgroundColor: listening ? '#185FA5' : dark ? '#222' : '#fff',
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.15,
              shadowRadius: 8,
              elevation: 6,
              borderWidth: listening ? 0 : 0.5,
              borderColor: dark ? '#333' : '#D3D1C7',
            }}
          >
            <Ionicons
              name={listening ? 'mic' : 'mic-outline'}
              size={22}
              color={listening ? '#fff' : '#185FA5'}
            />
          </View>
        </Animated.View>
      )}
    </View>
  );
}
