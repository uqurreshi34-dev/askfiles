import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';

export default function NetworkScreen() {
  const { colors } = useTheme();
  const router = useRouter();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.background }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Network</Text>
        <View style={{ width: 40 }} />
      </View>

      <Text style={[styles.sub, { color: colors.textMuted }]}>Connect to a device on your network</Text>

      <TouchableOpacity
        activeOpacity={0.8}
        style={[styles.card, { backgroundColor: colors.blueBg }]}
        onPress={() => router.push('/smb' as any)}
      >
        <View style={styles.cardLeft}>
          <View style={[styles.cardIcon, { backgroundColor: colors.blueTint }]}>
            <Ionicons name="desktop-outline" size={22} color={colors.blue} />
          </View>
          <View>
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>SMB — Windows / NAS</Text>
            <Text style={[styles.cardSub, { color: colors.textSecondary }]}>Browse your PC or network drive over WiFi</Text>
            <Text style={[styles.cardSub, { color: colors.textSecondary }]}>Enable file sharing on your PC first</Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      </TouchableOpacity>

      <TouchableOpacity
        activeOpacity={0.8}
        style={[styles.card, { backgroundColor: colors.greenBg }]}
        onPress={() => router.push('/sftp' as any)}
      >
        <View style={styles.cardLeft}>
          <View style={[styles.cardIcon, { backgroundColor: colors.greenBg }]}>
            <Ionicons name="server-outline" size={22} color={colors.green} />
          </View>
          <View>
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>SFTP — Server / Raspberry Pi</Text>
            <Text style={[styles.cardSub, { color: colors.textSecondary }]}>Connect securely over SSH to any SFTP server</Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  title: { flex: 1, fontSize: 20, fontWeight: '500', textAlign: 'center', letterSpacing: -0.5 },
  sub: { fontSize: 13, paddingHorizontal: 16, marginBottom: 16 },
  card: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 16, marginBottom: 12, borderRadius: 12, padding: 14 },
  cardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, marginRight: 8 },
  cardIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 14, fontWeight: '600', marginBottom: 2 },
  cardSub: { fontSize: 11 },
});
