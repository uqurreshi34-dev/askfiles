import { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Dimensions, ScrollView, NativeScrollEvent, NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';

const { width } = Dimensions.get('window');

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
    icon: 'search-outline' as const,
    iconColor: '#3B6D11',
    iconBg: '#EAF3DE',
    title: 'AI-Powered Search',
    body: 'Ask in plain English — "show me videos from last week" or "find large PDFs". AskFiles understands you.',
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  function handleScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const idx = Math.round(e.nativeEvent.contentOffset.x / width);
    setCurrentIndex(idx);
  }

  function goNext() {
    if (currentIndex < SLIDES.length - 1) {
      scrollRef.current?.scrollTo({ x: (currentIndex + 1) * width, animated: true });
    }
  }

  async function finish() {
    await AsyncStorage.setItem('askfiles-onboarding-done', 'true');
    router.replace('/(tabs)');
  }

  const isLast = currentIndex === SLIDES.length - 1;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        scrollEventThrottle={16}
      >
        {SLIDES.map((slide, i) => (
          <View key={i} style={styles.slide}>
            <View style={[styles.iconWrap, { backgroundColor: slide.iconBg }]}>
              <Ionicons name={slide.icon} size={52} color={slide.iconColor} />
            </View>
            <Text style={styles.title}>{slide.title}</Text>
            <Text style={styles.body}>{slide.body}</Text>
          </View>
        ))}
      </ScrollView>

      {/* Dots */}
      <View style={styles.dots}>
        {SLIDES.map((_, i) => (
          <View
            key={i}
            style={[styles.dot, i === currentIndex && styles.dotActive]}
          />
        ))}
      </View>

      {/* Buttons */}
      <View style={styles.footer}>
        {isLast ? (
          <TouchableOpacity style={styles.btnPrimary} onPress={finish} activeOpacity={0.8}>
            <Text style={styles.btnPrimaryText}>Get Started</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.footerRow}>
            <TouchableOpacity onPress={finish} activeOpacity={0.7}>
              <Text style={styles.skip}>Skip</Text>
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
  container: { flex: 1, backgroundColor: '#fff' },
  slide: {
    width,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
    paddingBottom: 40,
  },
  iconWrap: {
    width: 110,
    height: 110,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 36,
  },
  title: {
    fontSize: 26,
    fontWeight: '600',
    color: '#111',
    textAlign: 'center',
    letterSpacing: -0.4,
    marginBottom: 14,
  },
  body: {
    fontSize: 15,
    color: '#5F5E5A',
    textAlign: 'center',
    lineHeight: 23,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 24,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#D3D1C7',
  },
  dotActive: {
    width: 20,
    backgroundColor: '#185FA5',
    borderRadius: 3,
  },
  footer: { paddingHorizontal: 24, paddingBottom: 16 },
  footerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  skip: { fontSize: 14, color: '#888780', paddingVertical: 14, paddingHorizontal: 4 },
  btnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#185FA5',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  btnPrimaryText: { fontSize: 15, fontWeight: '600', color: '#fff' },
});
