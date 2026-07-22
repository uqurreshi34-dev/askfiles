import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { savePin, enableAppLock, deletePin, disableAppLock } from '@/hooks/usePin';
import { useTheme } from '@/hooks/useTheme';
import { useLocalSearchParams } from 'expo-router';
import { usePinPad } from '@/hooks/usePinPad';
import PinTrail from '@/components/PinTrail'
import * as ScreenOrientation from 'expo-screen-orientation';

export default function SetPinScreen() {
  const { colors } = useTheme();
  const { fromForgotPin } = useLocalSearchParams<{ fromForgotPin?: string }>();
  const router = useRouter();
  const [firstPin, setFirstPin] = useState<string | null>(null);
  const [entry, setEntry] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [padSize, setPadSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    return () => { ScreenOrientation.unlockAsync(); };
  }, []);

  // Called every time a 4-digit code is completed (by tap or swipe)
  function onComplete(code: string) {
    if (firstPin === null) {
      setFirstPin(code);
      setEntry('');
      return;                  // ← stage 1: neutral (blue), NOT green
    } else {
      if (code === firstPin) {
        void save(code);
        return true;           // stage 2 match → green
      } else {
        setError("PINs don't match. Try again.");
        setFirstPin(null);
        setEntry('');
        return false;          // mismatch → red
      }
    }
  }

  async function save(code: string) {
    if (fromForgotPin === '1') {
      await deletePin();
      await disableAppLock();
    }
    await savePin(code);
    await enableAppLock();
    Alert.alert('PIN Set', 'Your PIN has been set. App lock is now enabled.', [
      { text: 'OK', onPress: () => router.replace('/(tabs)/' as any) },
    ]);
  }

  const { keyProps, gesture, GestureDetector, pathD, pathPoints, isSwiping, outcome } = usePinPad({
    value: entry,
    setValue: setEntry,
    onComplete,
    onEdit: () => setError(null),
  });

  const stageIsConfirm = firstPin !== null;

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.background }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Set PIN</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style= {styles.body}>
        <View style={[styles.iconWrap, { backgroundColor: colors.blueTint }]}>
          <Ionicons name="keypad-outline" size={36} color={colors.blue} />
        </View>
        <Text style={[styles.prompt, { color: colors.textPrimary }]}>
          {stageIsConfirm ? 'Confirm your PIN' : 'Enter a 4-digit PIN'}
        </Text>
        <Text style={[styles.sub, { color: colors.textMuted }]}>
          {stageIsConfirm ? 'Enter the same PIN again to confirm' : 'This PIN will unlock the app and vault'}
        </Text>

        <View style={styles.dots}>
          {[0, 1, 2, 3].map(i => (
            <View key={i} style={[styles.dot, i < entry.length && styles.dotFilled, !!error && styles.dotError]} />
          ))}
        </View>

        <View style={styles.errorSlot}>
          {error && <Text style={styles.errorText}>{error}</Text>}
        </View>

        <GestureDetector gesture={gesture}>
          <View
            style={styles.keypad}
            onLayout={(e) => setPadSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
          >
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map((key, i) => {
              if (key === '') return <View key={i} style={styles.keyEmpty} />;
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
            {(isSwiping || outcome === 'fail') && padSize.w > 0 && (
              <PinTrail
                pathD={pathD}
                points={pathPoints}
                color={outcome === 'success' ? '#22C55E' : outcome === 'fail' ? '#E24B4A' : colors.blue}
                width={padSize.w}
                height={padSize.h}
              />
            )}
                      </View>
        </GestureDetector>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  title: { flex: 1, fontSize: 20, fontWeight: '500', textAlign: 'center', letterSpacing: -0.5 },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  iconWrap: { width: 80, height: 80, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  prompt: { fontSize: 20, fontWeight: '600', letterSpacing: -0.3, marginBottom: 8 },
  sub: { fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 36 },
  dots: { flexDirection: 'row', gap: 16, marginBottom: 12 },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: '#D3D1C7', backgroundColor: 'transparent' },
  dotFilled: { backgroundColor: '#185FA5', borderColor: '#185FA5' },
  dotError: { borderColor: '#E24B4A' },
  errorSlot: { height: 20, justifyContent: 'center', marginBottom: 24 },
  errorText: { fontSize: 13, color: '#E24B4A', textAlign: 'center' },
  keypad: { flexDirection: 'row', flexWrap: 'wrap', width: 280, gap: 16, position: 'relative' },
  key: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
  keyEmpty: { width: 80, height: 80 },
  keyText: { fontSize: 24, fontWeight: '500' },
});
