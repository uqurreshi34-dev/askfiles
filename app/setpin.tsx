import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { savePin, enableAppLock, deletePin, disableAppLock } from '@/hooks/usePin';
import { useTheme } from '@/hooks/useTheme';
import { useLocalSearchParams } from 'expo-router';

export default function SetPinScreen() {
  const { colors } = useTheme();
  const { fromForgotPin } = useLocalSearchParams<{ fromForgotPin?: string }>();
  const router = useRouter();
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [stage, setStage] = useState<'set' | 'confirm'>('set');

  function handleDigit(digit: string) {
    if (stage === 'set') {
      if (pin.length < 4) {
        const newPin = pin + digit;
        setPin(newPin);
        if (newPin.length === 4) { setStage('confirm'); }
      }
    } else {
      if (confirmPin.length < 4) {
        const newConfirm = confirmPin + digit;
        setConfirmPin(newConfirm);
        if (newConfirm.length === 4) { handleConfirm(newConfirm); }
      }
    }
  }

  function handleDelete() {
    if (stage === 'set') { setPin(prev => prev.slice(0, -1)); }
    else { setConfirmPin(prev => prev.slice(0, -1)); }
  }

  async function handleConfirm(entered: string) {
    if (entered === pin) {
      if (fromForgotPin === '1') {
        await deletePin();
        await disableAppLock();
      }
      await savePin(pin);
      await enableAppLock();
      Alert.alert('PIN Set', 'Your PIN has been set successfully. App lock is now enabled.', [
        { text: 'OK', onPress: () => router.replace('/(tabs)/' as any) },
      ]);
    }
  }

  const currentPin = stage === 'set' ? pin : confirmPin;

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.background }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Set PIN</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={[styles.iconWrap, { backgroundColor: colors.blueTint }]}>
          <Ionicons name="keypad-outline" size={36} color={colors.blue} />
        </View>
        <Text style={[styles.prompt, { color: colors.textPrimary }]}>
          {stage === 'set' ? 'Enter a 4-digit PIN' : 'Confirm your PIN'}
        </Text>
        <Text style={[styles.sub, { color: colors.textMuted }]}>
          {stage === 'set'
            ? 'This PIN will be used to unlock the app and vault'
            : 'Enter the same PIN again to confirm'}
        </Text>

        <View style={styles.dots}>
          {[0, 1, 2, 3].map(i => (
            <View key={i} style={[styles.dot, i < currentPin.length && styles.dotFilled]} />
          ))}
        </View>

        <View style={styles.keypad}>
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map((key, i) => {
            if (key === '') return <View key={i} style={styles.keyEmpty} />;
            if (key === 'del') return (
              <TouchableOpacity key={i} style={[styles.key, { backgroundColor: colors.surface }]} onPress={handleDelete} activeOpacity={0.6}>
                <Ionicons name="backspace-outline" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            );
            return (
              <TouchableOpacity key={i} style={[styles.key, { backgroundColor: colors.surface }]} onPress={() => handleDigit(key)} activeOpacity={0.6}>
                <Text style={[styles.keyText, { color: colors.textPrimary }]}>{key}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        </ScrollView>
      </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  title: { flex: 1, fontSize: 20, fontWeight: '500', textAlign: 'center', letterSpacing: -0.5 },
  body: { alignItems: 'center', paddingTop: 32, paddingHorizontal: 24, paddingBottom: 32 },
  iconWrap: { width: 80, height: 80, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  prompt: { fontSize: 20, fontWeight: '600', letterSpacing: -0.3, marginBottom: 8 },
  sub: { fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 36 },
  dots: { flexDirection: 'row', gap: 16, marginBottom: 48 },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: '#D3D1C7', backgroundColor: 'transparent' },
  dotFilled: { backgroundColor: '#185FA5', borderColor: '#185FA5' },
  keypad: { flexDirection: 'row', flexWrap: 'wrap', width: 280, gap: 16 },
  key: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
  keyEmpty: { width: 80, height: 80 },
  keyText: { fontSize: 24, fontWeight: '500' },
});
