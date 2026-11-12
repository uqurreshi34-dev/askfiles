import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { SafeAreaView } from 'react-native-safe-area-context';
import { completeSignIn } from '@/modules/cloudAuth';

WebBrowser.maybeCompleteAuthSession();

export default function CallbackScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const params = useLocalSearchParams();

  const code = typeof params.code === 'string' ? params.code : undefined;
  const state = typeof params.state === 'string' ? params.state : undefined;
  const [status, setStatus] = useState<'working' | 'done' | 'failed'>(code && !params.error ? 'working' : 'failed');
  const success = status === 'done';

  // If Android closed AskFiles during sign-in, this screen is the only one
  // that sees the returned code, so finish the sign-in here and go back.
  useEffect(() => {
    if (status !== 'working') return;
    let alive = true;
    completeSignIn(code, state)
      .then(provider => {
        if (!alive) return;
        if (provider) router.dismissTo('/backup');
        else setStatus('failed');
      })
      .catch(() => { if (alive) setStatus('failed'); });
    return () => { alive = false; };
  }, []);

  return (
    <SafeAreaView edges={['left', 'right']} style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 }}>
        <TouchableOpacity
          onPress={() => router.canGoBack() ? router.back() : router.push('/backup')}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
        >
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          <Text style={{ fontSize: 16, color: colors.textPrimary, fontWeight: '500' }}>
            Back to Cloud Backup
          </Text>
        </TouchableOpacity>
      </View>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 32 }}>
        {status === 'working' ? <ActivityIndicator size="large" color={colors.blue} /> : <Ionicons
          name={success ? 'checkmark-circle-outline' : 'close-circle-outline'}
          size={48}
          color={success ? colors.blue : colors.textMuted}
        />}
        <Text style={{ fontSize: 18, fontWeight: '600', color: colors.textPrimary, textAlign: 'center' }}>
          {status === 'working' ? 'Connecting…' : success ? 'Connected successfully' : 'Sign in cancelled'}
        </Text>
        <Text style={{ fontSize: 14, color: colors.textMuted, textAlign: 'center'}}>
          {success
            ? 'Tap the back button above to return to Cloud Backup'
            : 'Tap the back button above to go back'}
        </Text>
      </View>
    </SafeAreaView>
  );
}
