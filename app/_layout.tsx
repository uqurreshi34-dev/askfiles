import { Stack, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View, Animated, Text, Easing, Pressable, PanResponder, Dimensions } from 'react-native';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { isAppLockEnabled } from '@/hooks/usePin';
import * as SplashScreen from 'expo-splash-screen';
import { usePathname } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

SplashScreen.preventAutoHideAsync();

const { width: SW, height: SH } = Dimensions.get('window');
const MIC_SIZE = 52;
const DEFAULT_X = SW - MIC_SIZE - 20;
const DEFAULT_Y = SH - 160;
const MIC_POS_KEY = 'askfiles-mic-position';

const COMMANDS = [
  { keywords: ['home', 'main', 'start'], route: '/(tabs)/' },
  { keywords: ['image', 'photo', 'picture', 'gallery'], route: '/category?category=images' },
  { keywords: ['video', 'film', 'movie', 'clip'], route: '/category?category=videos' },
  { keywords: ['document', 'pdf', 'word', 'excel'], route: '/category?category=documents' },
  { keywords: ['download'], route: '/category?category=downloads' },
  { keywords: ['browse', 'folder', 'storage', 'files'], route: '/(tabs)/browse' },
  { keywords: ['search', 'find'], route: '/(tabs)/search' },
  { keywords: ['vault', 'secure', 'private'], route: '/vault' },
  { keywords: ['favourite', 'favorite'], route: '/favourites' },
  { keywords: ['cloud', 'pro', 'upgrade', 'premium'], route: '/(tabs)/cloud' },
  { keywords: ['duplicate', 'dupe'], route: '/duplicates' },
  { keywords: ['large', 'big', 'space'], route: '/large-files' },
  { keywords: ['sensitive', 'confidential'], route: '/sensitive-files' },
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
  const router = useRouter();
  const scheme = useColorScheme();
  const dark = scheme === 'dark';
  const pathname = usePathname();

  const [listening, setListening] = useState(false);
  const [banner, setBanner] = useState<{ text: string; success: boolean } | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const bannerAnim = useRef(new Animated.Value(0)).current;
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transcriptRef = useRef('');

  // Draggable position
  const posRef = useRef({ x: DEFAULT_X, y: DEFAULT_Y });
  const dragStart = useRef({ x: DEFAULT_X, y: DEFAULT_Y });
  const pan = useRef(new Animated.ValueXY({ x: DEFAULT_X, y: DEFAULT_Y })).current;
  const isDragging = useRef(false);

  // Load saved position
  useEffect(() => {
    AsyncStorage.getItem(MIC_POS_KEY).then(val => {
      if (val) {
        const saved = JSON.parse(val);
        posRef.current = saved;
        pan.setValue(saved);
      }
    }).catch(() => {});
  }, []);

  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
      isDragging.current = false;
      dragStart.current = { x: posRef.current.x, y: posRef.current.y };
      // Start mic after short hold — distinguishes tap-hold from drag
      pressTimer.current = setTimeout(() => {
        if (!isDragging.current) {
          transcriptRef.current = '';
          setListening(true);
          startPulse();
          ExpoSpeechRecognitionModule.start({ lang: 'en-US', interimResults: true });
        }
      }, 150);
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
    ExpoSpeechRecognitionModule.requestPermissionsAsync();
  }, []);

  useEffect(() => {
    isAppLockEnabled().then(enabled => {
      if (enabled) router.replace('/lockscreen');
      SplashScreen.hideAsync();
    });
  }, []);

  useSpeechRecognitionEvent('result', (e) => {
    const text = e.results?.[0]?.transcript ?? '';
    if (text) transcriptRef.current = text;
  });

  useSpeechRecognitionEvent('end', () => {
    setListening(false);
    stopPulse();
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

  const showMic = !HIDDEN_ON.some(p => pathname.startsWith(p));

  return (
    <View style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="lockscreen" />
        <Stack.Screen name="setpin" />
        <Stack.Screen name="vault" />
        <Stack.Screen name="duplicates" />
        <Stack.Screen name="backup" />
        <Stack.Screen name="sensitive-files" />
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
