import { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Dimensions, ScrollView, NativeScrollEvent, NativeSyntheticEvent,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useColorScheme } from 'react-native';
import { getColors } from '@/hooks/useTheme';
import * as MediaLibrary from 'expo-media-library';
import * as IntentLauncher from 'expo-intent-launcher';


const SLIDES = [
  {
    icon: 'albums-outline' as const,
    iconColor: '#185FA5',
    iconBg: '#E6F1FB',
    title: 'Welcome to AskFiles',
    body: 'Your personal file manager. Browse, organise, and access everything on your device — simply and fast.',
  },
  {
    icon: 'mic-outline' as const,
    iconColor: '#534AB7',
    iconBg: '#EEEDFE',
    title: 'Voice Navigation',
    body: 'Tap the mic button and speak to navigate. Try "Open Images", "Open Vault", "Go to Browse" or "Find Downloads".',
  },
  {
    icon: 'lock-closed-outline' as const,
    iconColor: '#3B6D11',
    iconBg: '#EAF3DE',
    title: 'Your Privacy, Protected',
    body: 'No account needed. No ads. Your files never leave your device. AI search sends only your typed question — never file contents. Smart Search reads your documents privately on your phone — no internet, no servers, no one else can see your files.',
  },
  {
    icon: 'star-outline' as const,
    iconColor: '#854F0B',
    iconBg: '#FEF3E2',
    title: 'Unlock Pro — £2.99 Forever',
    body: 'AI-powered file search. Smart Search — find words inside your documents. Secure Vault with biometrics. Cloud backup to Google Drive, OneDrive and Dropbox. Duplicate finder. One payment, no subscription.',
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
  const scheme = useColorScheme();
  const dark = scheme === 'dark';
  const colors = getColors(dark);
  const { width, height } = useWindowDimensions();
  const PORTRAIT_WIDTH = Math.min(width, height);
  const isLandscape = width > height;
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [requestingPermission, setRequestingPermission] = useState(false);

  // When rotating back to portrait, sync scroll to current slide
  useEffect(() => {
    if (!isLandscape) {
      const t = setTimeout(() => {
        scrollRef.current?.scrollTo({ x: currentIndex * PORTRAIT_WIDTH, animated: false });
      }, 50);
      return () => clearTimeout(t);
    }
  }, [isLandscape]);

  function handleScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const idx = Math.round(e.nativeEvent.contentOffset.x / PORTRAIT_WIDTH);
    setCurrentIndex(idx);
  }

  function goNext() {
    if (currentIndex < SLIDES.length - 1) {
      const next = currentIndex + 1;
      setCurrentIndex(next);
      scrollRef.current?.scrollTo({ x: next * PORTRAIT_WIDTH, animated: true });
    }
  }

  async function requestPermissions() {
    setRequestingPermission(true);
    try {
      const { status, canAskAgain } = await MediaLibrary.requestPermissionsAsync();
      if (status === 'granted') {
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

  const isPermissionSlide = currentIndex === SLIDES.length - 1;
  const slide = SLIDES[currentIndex];

  // ── LANDSCAPE ─────────────────────────────────────────────────────────────
  if (isLandscape) {
    return (
      <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Skip — top right */}
        <TouchableOpacity onPress={finish} style={styles.lsSkip}>
          <Text style={[styles.skip, { color: colors.textMuted }]}>Skip</Text>
        </TouchableOpacity>

        {/* Centre: prev arrow | content | next arrow */}
        <View style={styles.lsBody}>
          <TouchableOpacity
            onPress={() => setCurrentIndex(i => Math.max(0, i - 1))}
            style={styles.lsArrow}
            activeOpacity={0.6}
            disabled={currentIndex === 0}
          >
            <Ionicons name="chevron-back" size={28} color={currentIndex === 0 ? colors.textDisabled : colors.textPrimary} />
          </TouchableOpacity>

          <View style={styles.lsSlide}>
            <View style={[styles.lsIconWrap, { backgroundColor: slide.iconBg }]}>
              <Ionicons name={slide.icon} size={36} color={slide.iconColor} />
            </View>
            <Text style={[styles.lsTitle, { color: colors.textPrimary }]}>{slide.title}</Text>
            <Text style={[styles.lsBodyText, { color: colors.textSecondary }]}>{slide.body}</Text>
          </View>

          <TouchableOpacity
            onPress={() => setCurrentIndex(i => Math.min(SLIDES.length - 1, i + 1))}
            style={styles.lsArrow}
            activeOpacity={0.6}
            disabled={currentIndex === SLIDES.length - 1}
          >
            <Ionicons name="chevron-forward" size={28} color={currentIndex === SLIDES.length - 1 ? colors.textDisabled : colors.textPrimary} />
          </TouchableOpacity>
        </View>

        {/* Bottom: permission buttons or page counter */}
        <View style={styles.lsFooter}>
          {isPermissionSlide ? (
            <View style={styles.lsPermissionRow}>
              {!permissionGranted ? (
                <TouchableOpacity style={styles.btnPrimary} onPress={requestPermissions} disabled={requestingPermission} activeOpacity={0.8}>
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
            <Text style={[styles.lsPageCount, { color: colors.textMuted }]}>
              {currentIndex + 1} / {SLIDES.length}
            </Text>
          )}
        </View>
      </SafeAreaView>
    );
  }

  // ── PORTRAIT (completely unchanged from original) ──────────────────────────
  return (
    <SafeAreaView edges={['top', 'bottom']} style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        scrollEventThrottle={16}
      >
        {SLIDES.map((s, i) => (
          <View key={i} style={[styles.slide, { width: PORTRAIT_WIDTH }]}>
            <View style={[styles.iconWrap, { backgroundColor: s.iconBg }]}>
              <Ionicons name={s.icon} size={52} color={s.iconColor} />
            </View>
            <Text style={[styles.title, { color: colors.textPrimary }]}>{s.title}</Text>
            <Text style={[styles.body, { color: colors.textSecondary }]}>{s.body}</Text>
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
              <TouchableOpacity style={styles.btnPrimary} onPress={requestPermissions} disabled={requestingPermission} activeOpacity={0.8}>
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

  // Portrait (unchanged)
  slide: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36, paddingBottom: 40 },
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

  // Landscape
  lsSkip: { position: 'absolute', top: 8, right: 16, zIndex: 10, padding: 8 },
  lsBody: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 },
  lsArrow: { width: 48, alignItems: 'center', justifyContent: 'center', paddingVertical: 16 },
  lsSlide: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  lsIconWrap: { width: 64, height: 64, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  lsTitle: { fontSize: 18, fontWeight: '600', textAlign: 'center', letterSpacing: -0.3, marginBottom: 8 },
  lsBodyText: { fontSize: 13, textAlign: 'center', lineHeight: 20 },
  lsFooter: { paddingHorizontal: 24, paddingBottom: 12, alignItems: 'center' },
  lsPermissionRow: { flexDirection: 'row', gap: 12, justifyContent: 'center' },
  lsPageCount: { fontSize: 13, paddingVertical: 8 },
});
