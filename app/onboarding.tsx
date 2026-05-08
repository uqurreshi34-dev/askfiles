import { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, NativeScrollEvent, NativeSyntheticEvent, useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';
import * as MediaLibrary from 'expo-media-library';
import * as IntentLauncher from 'expo-intent-launcher';

const SLIDES = [
  {
    icon: 'folder-open-outline' as const,
    iconColor: '#185FA5',
    iconBg: '#E6F1FB',
    title: 'Welcome to AskFiles',
    body: 'Your personal file manager. Browse, organise, and access everything on your device — simply and fast.',
  },
  {
    icon: 'shield-checkmark-outline' as const,
    iconColor: '#534AB7',
    iconBg: '#EEEDFE',
    title: 'Vault & Duplicates',
    body: 'Lock sensitive files in your private Vault. Find and remove duplicate files to free up storage space.',
  },
  {
    icon: 'lock-closed-outline' as const,
    iconColor: '#3B6D11',
    iconBg: '#EAF3DE',
    title: 'Your Privacy, Protected',
    body: 'No account needed. No ads. Your files never leave your device. The only data sent anywhere is the text of your AI search query — sent securely to Groq to generate an answer.',
  },
  {
    icon: 'search-outline' as const,
    iconColor: '#854F0B',
    iconBg: '#FEF3E2',
    title: 'AI-Powered Search',
    body: 'Ask in plain English — "show me videos from last week" or "find large PDFs". AskFiles understands you.',
  },
  {
    icon: 'folder-open-outline' as const,
    iconColor: '#185FA5',
    iconBg: '#E6F1FB',
    title: 'Access Your Files',
    body: 'AskFiles needs access to your photos, videos and files to work. Your files never leave your device.',
  },
];

export default function OnboardingScreen() {
  const { colors } = useTheme();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const slideWidth = width - insets.left - insets.right;
  const slideHeight = height - insets.top - insets.bottom;
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [requestingPermission, setRequestingPermission] = useState(false);

  function handleScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const idx = Math.round(e.nativeEvent.contentOffset.x / slideWidth);
    setCurrentIndex(idx);
  }

  function goNext() {
    if (currentIndex < SLIDES.length - 1) {
      scrollRef.current?.scrollTo({ x: (currentIndex + 1) * slideWidth, animated: true });
    }
  }

  async function requestPermissions() {
    setRequestingPermission(true);
    try {
      const { status, canAskAgain } = await MediaLibrary.requestPermissionsAsync();
      if (status === 'granted') {
        try {
          await IntentLauncher.startActivityAsync(
            'android.settings.MANAGE_APP_ALL_FILES_ACCESS_PERMISSION',
            { data: 'package:com.askfiles.mobile' }
          );
        } catch {
          try {
            await IntentLauncher.startActivityAsync(
              'android.settings.MANAGE_ALL_FILES_ACCESS_PERMISSION'
            );
          } catch {}
        }
        setPermissionGranted(true);
      } else if (!canAskAgain) {
        await IntentLauncher.startActivityAsync(
          'android.settings.APPLICATION_DETAILS_SETTINGS',
          { data: 'package:com.askfiles.mobile' }
        );
      }
    } catch {}
    setRequestingPermission(false);
  }

  async function finish() {
    await AsyncStorage.setItem('askfiles-onboarding-done', 'true');
    router.replace('/(tabs)');
  }

  const isLast = currentIndex === SLIDES.length - 1;
  const isPermissionSlide = currentIndex === SLIDES.length - 1;

  return (
    <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        scrollEventThrottle={16}
      >
        {SLIDES.map((slide, i) => (
          <View key={i} style={[styles.slide, { width: slideWidth, height: slideHeight }]}>
            <View style={[styles.iconWrap, { backgroundColor: slide.iconBg }]}>
              <Ionicons name={slide.icon} size={52} color={slide.iconColor} />
            </View>
            <Text style={[styles.title, { color: colors.textPrimary }]}>{slide.title}</Text>
            <Text style={[styles.body, { color: colors.textSecondary }]}>{slide.body}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={styles.dots}>
        {SLIDES.map((_, i) => (
          <View key={i} style={[styles.dot, { backgroundColor: colors.textDisabled }, i === currentIndex && styles.dotActive]} />
        ))}
      </View>

      <View style={styles.footer}>
        {isPermissionSlide ? (
          <View style={{ gap: 12 }}>
            {!permissionGranted ? (
              <TouchableOpacity
                style={styles.btnPrimary}
                onPress={requestPermissions}
                disabled={requestingPermission}
                activeOpacity={0.8}
              >
                {requestingPermission ? (
                  <Text style={styles.btnPrimaryText}>Requesting...</Text>
                ) : (
                  <>
                    <Ionicons name="shield-checkmark-outline" size={16} color="#fff" style={{ marginRight: 6 }} />
                    <Text style={styles.btnPrimaryText}>Grant Access</Text>
                  </>
                )}
              </TouchableOpacity>
            ) : (
              <View style={[styles.btnPrimary, { backgroundColor: '#3B6D11' }]}>
                <Ionicons name="checkmark-circle-outline" size={16} color="#fff" style={{ marginRight: 6 }} />
                <Text style={styles.btnPrimaryText}>Access Granted ✓</Text>
              </View>
            )}
            <TouchableOpacity style={[styles.btnPrimary, { backgroundColor: permissionGranted ? '#185FA5' : colors.surface }]} onPress={finish} activeOpacity={0.8}>
              <Text style={[styles.btnPrimaryText, { color: permissionGranted ? '#fff' : colors.textMuted }]}>Get Started</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.footerRow}>
            <TouchableOpacity onPress={finish} activeOpacity={0.7}>
              <Text style={[styles.skip, { color: colors.textMuted }]}>Skip</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnPrimary} onPress={goNext} activeOpacity={0.8}>
              <Text style={styles.btnPrimaryText}>Next</Text>
              <Ionicons name="arrow-forward" size={16} color="#fff" style={{ marginLeft: 6 }} />
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  slide: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36, paddingBottom: 80 },
  iconWrap: { width: 110, height: 110, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 36 },
  title: { fontSize: 26, fontWeight: '600', textAlign: 'center', letterSpacing: -0.4, marginBottom: 14 },
  body: { fontSize: 15, textAlign: 'center', lineHeight: 23 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: 24 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  dotActive: { width: 20, backgroundColor: '#185FA5', borderRadius: 3 },
  footer: { paddingHorizontal: 24, paddingBottom: 16 },
  footerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  skip: { fontSize: 14, paddingVertical: 14, paddingHorizontal: 4 },
  btnPrimary: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#185FA5', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 24 },
  btnPrimaryText: { fontSize: 15, fontWeight: '600', color: '#fff' },
});
