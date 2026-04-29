import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { savePin, enableAppLock } from '@/hooks/usePin';

export default function SetPinScreen() {
  const router = useRouter();
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [stage, setStage] = useState<'set' | 'confirm'>('set');

  function handleDigit(digit: string) {
    if (stage === 'set') {
      if (pin.length < 4) {
        const newPin = pin + digit;
        setPin(newPin);
        if (newPin.length === 4) {
          setStage('confirm');
        }
      }
    } else {
      if (confirmPin.length < 4) {
        const newConfirm = confirmPin + digit;
        setConfirmPin(newConfirm);
        if (newConfirm.length === 4) {
          handleConfirm(newConfirm);
        }
      }
    }
  }

  function handleDelete() {
    if (stage === 'set') {
      setPin(prev => prev.slice(0, -1));
    } else {
      setConfirmPin(prev => prev.slice(0, -1));
    }
  }

  async function handleConfirm(entered: string) {
    if (entered === pin) {
      await savePin(pin);
      await enableAppLock();
      Alert.alert('PIN Set', 'Your PIN has been set successfully. App lock is now enabled.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } else {
      Alert.alert('PIN Mismatch', 'PINs do not match. Please try again.', [
        { text: 'Try Again', onPress: () => { setPin(''); setConfirmPin(''); setStage('set'); } },
      ]);
    }
  }

  const currentPin = stage === 'set' ? pin : confirmPin;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#111" />
        </TouchableOpacity>
        <Text style={styles.title}>Set PIN</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.body}>
        <View style={styles.iconWrap}>
          <Ionicons name="keypad-outline" size={36} color="#185FA5" />
        </View>
        <Text style={styles.prompt}>
          {stage === 'set' ? 'Enter a 4-digit PIN' : 'Confirm your PIN'}
        </Text>
        <Text style={styles.sub}>
          {stage === 'set'
            ? 'This PIN will be used to unlock the app and vault'
            : 'Enter the same PIN again to confirm'}
        </Text>

        {/* PIN dots */}
        <View style={styles.dots}>
          {[0, 1, 2, 3].map(i => (
            <View
              key={i}
              style={[styles.dot, i < currentPin.length && styles.dotFilled]}
            />
          ))}
        </View>

        {/* Keypad */}
        <View style={styles.keypad}>
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map((key, i) => {
            if (key === '') return <View key={i} style={styles.keyEmpty} />;
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
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  title: { flex: 1, fontSize: 20, fontWeight: '500', color: '#111', textAlign: 'center', letterSpacing: -0.5 },
  body: { flex: 1, alignItems: 'center', paddingTop: 32, paddingHorizontal: 24 },
  iconWrap: { width: 80, height: 80, borderRadius: 22, backgroundColor: '#EBF3FC', alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  prompt: { fontSize: 20, fontWeight: '600', color: '#111', letterSpacing: -0.3, marginBottom: 8 },
  sub: { fontSize: 14, color: '#888780', textAlign: 'center', lineHeight: 20, marginBottom: 36 },
  dots: { flexDirection: 'row', gap: 16, marginBottom: 48 },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: '#D3D1C7', backgroundColor: 'transparent' },
  dotFilled: { backgroundColor: '#185FA5', borderColor: '#185FA5' },
  keypad: { flexDirection: 'row', flexWrap: 'wrap', width: 280, gap: 16 },
  key: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#F1EFE8', alignItems: 'center', justifyContent: 'center' },
  keyEmpty: { width: 80, height: 80 },
  keyText: { fontSize: 24, fontWeight: '500', color: '#111' },
});
