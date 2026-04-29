import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import { useRouter } from 'expo-router';
import { verifyPin, isPinSet } from '@/hooks/usePin';

export default function LockScreen() {
  const router = useRouter();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    tryBiometric();
  }, []);

  async function tryBiometric() {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      if (!hasHardware || !isEnrolled) return; // just show PIN
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock AskFiles',
        cancelLabel: 'Use PIN',
        disableDeviceFallback: true,
      });
      if (result.success) {
        router.replace('/(tabs)');
      }
      // if cancelled/failed — PIN keypad is already showing, nothing to do
    } catch {
      // PIN keypad already showing
    }
  }

  function handleDigit(digit: string) {
    if (pin.length < 4) {
      const newPin = pin + digit;
      setPin(newPin);
      setError(null);
      if (newPin.length === 4) handleVerify(newPin);
    }
  }

  function handleDelete() {
    setPin(prev => prev.slice(0, -1));
    setError(null);
  }

  async function handleVerify(entered: string) {
    const correct = await verifyPin(entered);
    if (correct) {
      router.replace('/(tabs)');
    } else {
      setError('Incorrect PIN. Try again.');
      setPin('');
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.body}>
        <View style={styles.iconWrap}>
          <Ionicons name="lock-closed" size={36} color="#185FA5" />
        </View>
        <Text style={styles.title}>AskFiles is locked</Text>
        <Text style={styles.sub}>Enter your PIN to continue</Text>

        <View style={styles.dots}>
          {[0, 1, 2, 3].map(i => (
            <View
              key={i}
              style={[styles.dot, i < pin.length && styles.dotFilled, !!error && styles.dotError]}
            />
          ))}
        </View>

        {error && <Text style={styles.errorText}>{error}</Text>}

        <View style={styles.keypad}>
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'bio', '0', 'del'].map((key, i) => {
            if (key === 'bio') return (
              <TouchableOpacity key={i} style={styles.key} onPress={tryBiometric} activeOpacity={0.6}>
                <Ionicons name="finger-print-outline" size={24} color="#185FA5" />
              </TouchableOpacity>
            );
            if (key === 'del') return (
              <TouchableOpacity key={i} style={styles.key} onPress={handleDelete} activeOpacity={0.6}>
                <Ionicons name="backspace-outline" size={22} color="#5F5E5A" />
              </TouchableOpacity>
            );
            return (
              <TouchableOpacity key={i} style={styles.key} onPress={() => handleDigit(key)} activeOpacity={0.6}>
                <Text style={styles.keyText}>{key}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  body: { flex: 1, alignItems: 'center', paddingTop: 48, paddingHorizontal: 24 },
  iconWrap: { width: 88, height: 88, borderRadius: 24, backgroundColor: '#EBF3FC', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  title: { fontSize: 22, fontWeight: '600', color: '#111', letterSpacing: -0.4 },
  sub: { fontSize: 14, color: '#888780', textAlign: 'center', lineHeight: 20, marginBottom: 8 },
  dots: { flexDirection: 'row', gap: 16, marginTop: 32, marginBottom: 12 },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: '#D3D1C7', backgroundColor: 'transparent' },
  dotFilled: { backgroundColor: '#185FA5', borderColor: '#185FA5' },
  dotError: { borderColor: '#E24B4A' },
  errorText: { fontSize: 13, color: '#E24B4A', marginBottom: 24 },
  keypad: { flexDirection: 'row', flexWrap: 'wrap', width: 280, gap: 16, marginTop: 24 },
  key: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#F1EFE8', alignItems: 'center', justifyContent: 'center' },
  keyText: { fontSize: 24, fontWeight: '500', color: '#111' },
});
