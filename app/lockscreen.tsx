import { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import { useRouter } from 'expo-router';
import { verifyPin } from '@/hooks/usePin';
import { useTheme } from '@/hooks/useTheme';
import { showBiometricPrompt } from '@/modules/storage-stats';
import { useLocalSearchParams } from 'expo-router';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';

export default function LockScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const destination = next ? decodeURIComponent(next) : '/(tabs)';
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const keyFrames = useState(() => new Map<string, { x: number; y: number; w: number; h: number }>())[0];
  const DWELL_MS = 110;      // pause this long on a key → commit it
  const PIVOT_DOT = 0.3;     // direction change sharper than this → commit

  const gestureState = useRef({
    lastKey: null as string | null,      // key under finger last frame
    committedKey: null as string | null, // last key we committed (same-key guard)
    enterTime: 0,                          // when finger entered lastKey (dwell)
    enterX: 0, enterY: 0,                  // finger pos when it entered (pivot)
    prevDX: 0, prevDY: 0,                  // travel direction last frame (pivot)
  }).current;
  
  function commitDigit(digit: string) {
    setPin(prev => {
      if (prev.length >= 4) return prev;
      const next = prev + digit;
      console.log('COMMIT', digit, '→', next);
      if (next.length === 4) handleVerify(next);
      return next;
    });
  }
  
  function resetGesture() {
    gestureState.lastKey = null;
    gestureState.committedKey = null;
    gestureState.enterTime = 0;
    gestureState.prevDX = 0;
    gestureState.prevDY = 0;
  }
  
  const panGesture = Gesture.Pan()
    .runOnJS(true)
    .onBegin((e) => {
      setPin(''); // fresh entry each gesture
      resetGesture();
      const digit = keyAt(e.x, e.y);
      if (digit) {
        commitDigit(digit);  // rule 1: first touch commits
        gestureState.committedKey = digit;
        gestureState.lastKey = digit;
        gestureState.enterTime = Date.now();
        gestureState.enterX = e.x;
        gestureState.enterY = e.y;
      }
    })
    .onUpdate((e) => {
      const digit = keyAt(e.x, e.y);
      const now = Date.now();
  
      // direction of travel this frame
      const dx = e.x - gestureState.enterX;
      const dy = e.y - gestureState.enterY;
  
      if (digit !== gestureState.lastKey) {
        // finger moved to a new key (or off all keys)
        gestureState.lastKey = digit;
        gestureState.enterTime = now;
        gestureState.enterX = e.x;
        gestureState.enterY = e.y;
        // leaving a key clears the same-key guard once we're truly off it
        if (digit !== gestureState.committedKey) {
          // pivot check: did we sharply change direction arriving here?
          const len1 = Math.hypot(gestureState.prevDX, gestureState.prevDY);
          const len2 = Math.hypot(dx, dy);
          if (digit && len1 > 4 && len2 > 4) {
            const dot = (gestureState.prevDX * dx + gestureState.prevDY * dy) / (len1 * len2);
            if (dot < PIVOT_DOT) {
              commitDigit(digit);
              gestureState.committedKey = digit;
            }
          }
        }
        gestureState.prevDX = dx;
        gestureState.prevDY = dy;
      } else if (digit && digit !== gestureState.committedKey) {
        // same key as last frame — check dwell
        if (now - gestureState.enterTime >= DWELL_MS) {
          commitDigit(digit);
          gestureState.committedKey = digit;
        }
      }
  
      // reset same-key guard when finger genuinely leaves the committed key
      if (digit !== gestureState.committedKey && digit !== null) {
        // allow re-commit of a different key; committedKey updated on commit
      }
      if (digit === null) {
        gestureState.committedKey = null; // off the pad entirely → allow next
      }
    })
    .onFinalize(() => {
      resetGesture();
    });

  async function tryBiometric() {
    try {
      const result = await showBiometricPrompt('Unlock AskFiles', 'Use your fingerprint or face to unlock');
      if (result === 'success') {
        router.replace(destination as any);
      }
    } catch {}
  }

  function handleDigit(digit: string) {
    if (pin.length < 4) {
      const newPin = pin + digit;
      setPin(newPin);
      setError(null);
      if (newPin.length === 4) handleVerify(newPin);
    }
  }

  function measureKey(digit: string, e: any) {
    const { x, y, width, height } = e.nativeEvent.layout;
    keyFrames.set(digit, { x, y, w: width, h: height });
  }

  function keyAt(x: number, y: number): string | null {
    for (const [digit, f] of keyFrames) {
      if (x >= f.x && x <= f.x + f.w && y >= f.y && y <= f.y + f.h) return digit;
    }
    return null;
  }

  function handleDelete() {
    setPin(prev => prev.slice(0, -1));
    setError(null);
  }

  async function handleForgotPin() {
    try {
      const [hasHardware, isEnrolled] = await Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
      ]);
      if (hasHardware && isEnrolled) {
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Verify identity to reset PIN',
          cancelLabel: 'Cancel',
          disableDeviceFallback: true,
        });
        if (result.success) {
          router.push({ pathname: '/setpin', params: { fromForgotPin: '1' } } as any);
        }
      } else {
        Alert.alert(
          'No biometrics available',
          'For security, go to Settings → Apps → AskFiles → Clear Data to reset. Your vault files will be preserved if you reinstall from Play Store.',
          [{ text: 'OK' }]
        );
      }
    } catch {}
  }

  async function handleVerify(entered: string) {
    const correct = await verifyPin(entered);
    if (correct) {
      router.replace(destination as any);
    } else {
      setError('Incorrect PIN. Try again.');
      setPin('');
    }
  }

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={[styles.iconWrap, { backgroundColor: colors.blueTint }]}>
          <Ionicons name="lock-closed" size={36} color={colors.blue} />
        </View>
        <Text style={[styles.title, { color: colors.textPrimary }]}>AskFiles is locked</Text>
        <Text style={[styles.sub, { color: colors.textMuted }]}>Enter your PIN to continue</Text>

        <View style={styles.dots}>
          {[0, 1, 2, 3].map(i => (
            <View key={i} style={[styles.dot, i < pin.length && styles.dotFilled, !!error && styles.dotError]} />
          ))}
        </View>

        {error && <Text style={styles.errorText}>{error}</Text>}
      <GestureDetector gesture={panGesture}>
        <View style={styles.keypad}>
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'bio', '0', 'del'].map((key, i) => {
            if (key === 'bio') return (
              <TouchableOpacity key={i} style={[styles.key, { backgroundColor: colors.surface }]} onPress={tryBiometric} activeOpacity={0.6}>
                <Ionicons name="finger-print-outline" size={24} color={colors.blue} />
              </TouchableOpacity>
            );
            if (key === 'del') return (
              <TouchableOpacity key={i} style={[styles.key, { backgroundColor: colors.surface }]} onPress={handleDelete} activeOpacity={0.6}>
                <Ionicons name="backspace-outline" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            );
            return (
              <TouchableOpacity key={i} style={[styles.key, { backgroundColor: colors.surface }]} onPress={() => handleDigit(key)} activeOpacity={0.6} onLayout={(e) => measureKey(key, e)}>
                <Text style={[styles.keyText, { color: colors.textPrimary }]}>{key}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </GestureDetector>
        <TouchableOpacity onPress={handleForgotPin} style={{ marginTop: 16, paddingVertical: 8 }}>
          <Text style={{ fontSize: 13, color: colors.textMuted, textAlign: 'center' }}>Forgot PIN?</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  body: { alignItems: 'center', paddingTop: 48, paddingHorizontal: 24, paddingBottom: 32 },
  iconWrap: { width: 88, height: 88, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  title: { fontSize: 22, fontWeight: '600', letterSpacing: -0.4 },
  sub: { fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 8 },
  dots: { flexDirection: 'row', gap: 16, marginTop: 32, marginBottom: 12 },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: '#D3D1C7', backgroundColor: 'transparent' },
  dotFilled: { backgroundColor: '#185FA5', borderColor: '#185FA5' },
  dotError: { borderColor: '#E24B4A' },
  errorText: { fontSize: 13, color: '#E24B4A', marginBottom: 24 },
  keypad: { flexDirection: 'row', flexWrap: 'wrap', width: 280, gap: 16, marginTop: 24 },
  key: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
  keyText: { fontSize: 24, fontWeight: '500' },
});
