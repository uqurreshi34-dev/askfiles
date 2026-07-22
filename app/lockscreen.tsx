import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { verifyPin } from '@/hooks/usePin';
import { useTheme } from '@/hooks/useTheme';
import { showBiometricPrompt } from '@/modules/storage-stats';
import { usePinPad } from '@/hooks/usePinPad';

export default function LockScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const destination = next ? decodeURIComponent(next) : '/(tabs)';
  const [entry, setEntry] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function onComplete(code: string) {
    const correct = await verifyPin(code);
    if (correct) {
      router.replace(destination as any);
    } else {
      setError('Incorrect PIN. Try again.');
      setEntry('');
    }
  }

  const { keyProps, gesture, GestureDetector } = usePinPad({
    value: entry,
    setValue: setEntry,
    onComplete,
    onEdit: () => setError(null),
  });

  async function tryBiometric() {
    try {
      const result = await showBiometricPrompt('Unlock AskFiles', 'Use your fingerprint or face to unlock');
      if (result === 'success') {
        router.replace(destination as any);
      }
    } catch {}
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
            <View key={i} style={[styles.dot, i < entry.length && styles.dotFilled, !!error && styles.dotError]} />
          ))}
        </View>

        <View style={styles.errorSlot}>
          {error && <Text style={styles.errorText}>{error}</Text>}
        </View>

        <GestureDetector gesture={gesture}>
          <View style={styles.keypad}>
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'bio', '0', 'del'].map((key, i) => {
              if (key === 'bio') return (
                <TouchableOpacity key={i} style={[styles.key, { backgroundColor: colors.surface }]} onPress={tryBiometric} activeOpacity={0.6}>
                  <Ionicons name="finger-print-outline" size={24} color={colors.blue} />
                </TouchableOpacity>
              );
              if (key === 'del') return (
                <TouchableOpacity key={i} style={[styles.key, { backgroundColor: colors.surface }]} onPress={keyProps.onDelete} activeOpacity={0.6}>
                  <Ionicons name="backspace-outline" size={22} color={colors.textSecondary} />
                </TouchableOpacity>
              );
              return (
                <TouchableOpacity key={i} style={[styles.key, { backgroundColor: colors.surface }]} onPress={() => keyProps.onTap(key)} onLayout={(e) => keyProps.onMeasure(key, e)} activeOpacity={0.6}>
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
  errorSlot: { height: 20, justifyContent: 'center', marginBottom: 24 },
  errorText: { fontSize: 13, color: '#E24B4A', textAlign: 'center' },
  keypad: { flexDirection: 'row', flexWrap: 'wrap', width: 280, gap: 16, marginTop: 24 },
  key: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
  keyText: { fontSize: 24, fontWeight: '500' },
});
