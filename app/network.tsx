import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { startWifiServer, stopWifiServer } from 'file-reader';
import QRCode from 'react-native-qrcode-svg';
import * as Haptics from 'expo-haptics';
import { useWindowDimensions } from 'react-native';

export default function NetworkScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const modalWidth = Math.min(280, SCREEN_WIDTH * 0.8);

  const [wifiActive, setWifiActive] = useState(false);
  const [wifiUrl, setWifiUrl] = useState('');
  const [wifiQrVisible, setWifiQrVisible] = useState(false);

  useEffect(() => {
    return () => { stopWifiServer().catch(() => {}); };
  }, []);

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.background }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Network</Text>
        <View style={{ width: 40 }} />
      </View>

      <Text style={[styles.sub, { color: colors.textMuted }]}>Connect to a device on your network</Text>

      {/* SMB */}
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

      {/* SFTP */}
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

      {/* WiFi Transfer */}
      <TouchableOpacity
        activeOpacity={0.8}
        style={[styles.card, {
          backgroundColor: wifiActive ? colors.greenBg : colors.surface,
          borderWidth: wifiActive ? 0 : 0.5,
          borderColor: colors.border,
        }]}
        onPress={async () => {
          if (wifiActive) {
            setWifiQrVisible(true);
          } else {
            try {
              const url = await startWifiServer('/storage/emulated/0/');
              setWifiUrl(url);
              setWifiActive(true);
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            } catch (e: any) {
              Alert.alert('Error', e?.message ?? 'Failed to start server');
            }
          }
        }}
      >
        <View style={styles.cardLeft}>
          <View style={[styles.cardIcon, { backgroundColor: wifiActive ? colors.greenBg : colors.surface }]}>
            <Ionicons
              name={wifiActive ? 'wifi' : 'wifi-outline'}
              size={22}
              color={wifiActive ? colors.green : colors.textMuted}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>WiFi Transfer</Text>
            {wifiActive ? (
              <>
                <Text style={[styles.cardSub, { color: colors.textSecondary }]}>Type this in your PC browser:</Text>
                <Text style={[styles.cardSub, { color: colors.green, fontWeight: '600' }]}>{wifiUrl}</Text>
                <Text style={[styles.cardSub, { color: colors.green, opacity: 0.7 }]}>or tap to show QR code</Text>
              </>
            ) : (
              <Text style={[styles.cardSub, { color: colors.textSecondary }]}>Browse & transfer files from your PC browser</Text>
            )}
          </View>
        </View>
        {wifiActive ? (
          <TouchableOpacity
            onPress={async () => { await stopWifiServer(); setWifiActive(false); setWifiUrl(''); setWifiQrVisible(false); }}
            style={{ backgroundColor: colors.deleteRed, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>Stop</Text>
          </TouchableOpacity>
        ) : (
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        )}
      </TouchableOpacity>

      {/* WiFi QR Modal */}
      <Modal visible={wifiQrVisible} transparent animationType="fade" onRequestClose={() => setWifiQrVisible(false)}>
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' }}
          activeOpacity={1}
          onPress={() => setWifiQrVisible(false)}
        >
          <View style={{
            backgroundColor: colors.modalCard,
            borderRadius: 16,
            padding: 16,
            paddingBottom: 24,
            alignItems: 'center',
            width: modalWidth,
            overflow: 'hidden',
          }} onStartShouldSetResponder={() => true}>
            <TouchableOpacity
              onPress={() => setWifiQrVisible(false)}
              style={{ position: 'absolute', top: 12, right: 12, zIndex: 10, padding: 4 }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </TouchableOpacity>
            <Text style={{ fontSize: 17, fontWeight: '600', color: colors.textPrimary, marginBottom: 4 }}>WiFi Transfer</Text>
            <Text style={{ fontSize: 12, color: colors.textMuted, marginBottom: 12 }}>Scan with your PC camera</Text>
            <View style={{ padding: 16, backgroundColor: '#fff', borderRadius: 12 }}>
              <QRCode value={wifiUrl || 'http://localhost:8080'} size={180} />
            </View>
            <Text style={{ fontSize: 13, color: colors.textSecondary, textAlign: 'center', marginTop: 12, marginBottom: 4 }}>Or type in your PC browser:</Text>
            <Text style={{ fontSize: 14, fontWeight: '600', color: colors.green, textAlign: 'center' }}>{wifiUrl}</Text>
          </View>
        </TouchableOpacity>
      </Modal>
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
