import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { startWifiServer, stopWifiServer, newWifiPassword, WIFI_NO_NETWORK, type WifiShareInfo } from 'file-reader';
import QRCode from 'react-native-qrcode-svg';
import * as Haptics from 'expo-haptics';
import { useWindowDimensions } from 'react-native';
import { startServer, stopServer, newPassword, FTP_NO_WIFI, type FtpShareInfo } from '@/modules/ftp-server';
import { useLanguage } from '@/modules/appLanguage';
import { netText } from '@/modules/i18n/netText';

// Scanning this signs straight in, so the password never has to be typed on the PC.
function ftpLoginUrl(share: FtpShareInfo): string {
  return `ftp://${encodeURIComponent(share.username)}:${encodeURIComponent(share.password)}@${share.address}:${share.port}`;
}

export default function NetworkScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const lang = useLanguage();
  const t = netText(lang);
  const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = useWindowDimensions();
  const modalWidth = Math.min(280, SCREEN_WIDTH * 0.8);
  // Landscape: QR on the left, details on the right, so nothing runs off the
  // top or bottom. The QR shrinks only as far as the screen height needs.
  const landscape = SCREEN_WIDTH > SCREEN_HEIGHT;
  const qrSize = landscape ? Math.max(120, Math.min(180, SCREEN_HEIGHT * 0.9 - 72)) : 180;
  const qrCard = landscape
    ? { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 16, width: Math.min(560, SCREEN_WIDTH * 0.88), maxHeight: SCREEN_HEIGHT * 0.9 }
    : { alignItems: 'center' as const, width: modalWidth, maxHeight: SCREEN_HEIGHT * 0.9 };
  function qrLayout(header: React.ReactNode, qr: React.ReactNode, details: React.ReactNode) {
    if (!landscape) return <ScrollView contentContainerStyle={{ alignItems: 'center' }} showsVerticalScrollIndicator={false}>{header}{qr}{details}</ScrollView>;
    return (
      <>
        {qr}
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ alignItems: 'center', paddingTop: 8 }} persistentScrollbar>
          {header}{details}
        </ScrollView>
      </>
    );
  }

  const [wifiActive, setWifiActive] = useState(false);
  const [wifiShare, setWifiShare] = useState<WifiShareInfo | null>(null);
  const [wifiQrVisible, setWifiQrVisible] = useState(false);
  const [ftpActive, setFtpActive] = useState(false);
  const [ftpShare, setFtpShare] = useState<FtpShareInfo | null>(null);
  const [ftpQrVisible, setFtpQrVisible] = useState(false);

  useEffect(() => {
    return () => {
      stopWifiServer().catch(() => {});
      stopServer().catch(() => {});
    };
  }, []);

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.background }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>{t.title}</Text>
        <View style={{ width: 40 }} />
      </View>

      <Text style={[styles.sub, { color: colors.textMuted }]}>{t.sub}</Text>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
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
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{t.smbTitle}</Text>
            <Text style={[styles.cardSub, { color: colors.textSecondary }]}>{t.smbSub1}</Text>
            <Text style={[styles.cardSub, { color: colors.textSecondary }]}>{t.smbSub2}</Text>
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
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{t.sftpTitle}</Text>
            <Text style={[styles.cardSub, { color: colors.textSecondary }]}>{t.sftpSub}</Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      </TouchableOpacity>

      {/* WebDAV */}
      <TouchableOpacity
        activeOpacity={0.8}
        style={[styles.card, { backgroundColor: colors.purpleBg }]}
        onPress={() => router.push('/webdav' as any)}
      >
        <View style={styles.cardLeft}>
          <View style={[styles.cardIcon, { backgroundColor: colors.purpleBg }]}>
            <Ionicons name="cloud-outline" size={22} color={colors.purple} />
          </View>
          <View>
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{t.webdavTitle}</Text>
            <Text style={[styles.cardSub, { color: colors.textSecondary }]}>{t.webdavSub}</Text>
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
              const share = await startWifiServer('/storage/emulated/0/');
              setWifiShare(share);
              setWifiActive(true);
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            } catch (e: any) {
              if (e?.code === WIFI_NO_NETWORK) {
                Alert.alert(t.noWifi, t.connectWifi);
              } else {
                Alert.alert(t.error, lang === 'en' && e?.message ? e.message : t.failedServer);
              }
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
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{t.wifiTransfer}</Text>
            {wifiActive ? (
              <>
                <Text style={[styles.cardSub, { color: colors.textSecondary }]}>{t.typeInBrowser}</Text>
                <Text style={[styles.cardSub, { color: colors.green, fontWeight: '600' }]}>{wifiShare?.url}</Text>
                <Text style={[styles.cardSub, { color: colors.green, opacity: 0.7 }]}>{t.password}: <Text style={{ fontWeight: '600' }}>{wifiShare?.password}</Text> {t.orTapQr}</Text>
              </>
            ) : (
              <Text style={[styles.cardSub, { color: colors.textSecondary }]}>{t.wifiSub}</Text>
            )}
          </View>
        </View>
        {wifiActive ? (
          <TouchableOpacity
            onPress={async () => { await stopWifiServer(); setWifiActive(false); setWifiShare(null); setWifiQrVisible(false); }}
            style={{ backgroundColor: colors.deleteRed, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>{t.stop}</Text>
          </TouchableOpacity>
        ) : (
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        )}
      </TouchableOpacity>

      {/* WiFi QR Modal */}
      <Modal visible={wifiQrVisible} transparent animationType="fade" onRequestClose={() => setWifiQrVisible(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' }}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setWifiQrVisible(false)} />
          <View style={{
            backgroundColor: colors.modalCard,
            borderRadius: 16,
            padding: 16,
            paddingBottom: 24,
            overflow: 'hidden',
            ...qrCard,
          }}>
            <TouchableOpacity
              onPress={() => setWifiQrVisible(false)}
              style={{ position: 'absolute', top: 12, right: 12, zIndex: 10, padding: 4 }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </TouchableOpacity>
            {qrLayout(<>
            <Text style={{ fontSize: 17, fontWeight: '600', color: colors.textPrimary, marginBottom: 4 }}>{t.wifiTransfer}</Text>
            <Text style={{ fontSize: 12, color: colors.textMuted, marginBottom: 12 }}>{t.scanCamera}</Text>
            </>,
            <View style={{ padding: 16, backgroundColor: '#fff', borderRadius: 12 }}>
              <QRCode value={wifiShare?.loginUrl || 'http://localhost:8080'} size={qrSize} />
            </View>,
            <>
            <Text style={{ fontSize: 13, color: colors.textSecondary, textAlign: 'center', marginTop: 12, marginBottom: 4 }}>{t.orTypeBrowser}</Text>
            <Text selectable style={{ fontSize: 14, fontWeight: '600', color: colors.green, textAlign: 'center' }}>{wifiShare?.url}</Text>
            <Text style={{ fontSize: 12, color: colors.textMuted, textAlign: 'center', marginTop: 8 }}>{t.password}: <Text selectable style={{ fontWeight: '600', color: colors.textPrimary }}>{wifiShare?.password}</Text></Text>
            <TouchableOpacity
              onPress={async () => {
                try {
                  const password = await newWifiPassword();
                  setWifiShare(prev => (prev ? { ...prev, password, loginUrl: `${prev.url}/login?code=${encodeURIComponent(password)}` } : prev));
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  Alert.alert(t.passwordChanged, t.wifiPwMsg);
                } catch {
                  Alert.alert(t.error, t.couldNotChangePw);
                }
              }}
              style={{ marginTop: 12, paddingVertical: 6, paddingHorizontal: 12 }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={{ fontSize: 13, fontWeight: '600', color: colors.blue }}>{t.newPassword}</Text>
            </TouchableOpacity>
            </>)}
          </View>
        </View>
      </Modal>
      {/* FTP Server */}
      <TouchableOpacity
        activeOpacity={0.8}
        style={[styles.card, {
          backgroundColor: ftpActive ? colors.greenBg : colors.surface,
          borderWidth: ftpActive ? 0 : 0.5,
          borderColor: colors.border,
        }]}
        onPress={async () => {
          if (ftpActive) {
            setFtpQrVisible(true);
          } else {
            try {
              const share = await startServer(2121, '/storage/emulated/0/');
              setFtpShare(share);
              setFtpActive(true);
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            } catch (e: any) {
              if (e?.code === FTP_NO_WIFI) {
                Alert.alert(t.noWifi, t.connectWifi);
              } else {
                Alert.alert(t.error, lang === 'en' && e?.message ? e.message : t.failedFtp);
              }
            }
          }
        }}
      >
        <View style={styles.cardLeft}>
          <View style={[styles.cardIcon, { backgroundColor: ftpActive ? colors.greenBg : colors.surface }]}>
            <Ionicons
              name={ftpActive ? 'folder-open' : 'folder-open-outline'}
              size={22}
              color={ftpActive ? colors.green : colors.textMuted}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{t.ftpServer}</Text>
            {ftpActive ? (
              <>
                <Text style={[styles.cardSub, { color: colors.textSecondary }]}>{t.ftpTapQr}</Text>
                <Text style={[styles.cardSub, { color: colors.textSecondary }]}>FileZilla: {t.host} <Text style={{ color: colors.green, fontWeight: '600' }}>{ftpShare?.address}</Text> {t.port} {ftpShare?.port}</Text>
                <Text style={[styles.cardSub, { color: colors.green, opacity: 0.7 }]}>{t.username}: {ftpShare?.username} · {t.password}: <Text style={{ fontWeight: '600' }}>{ftpShare?.password}</Text></Text>
              </>
            ) : (
              <>
                <Text style={[styles.cardSub, { color: colors.textSecondary }]}>{t.mountDrive}</Text>
                <Text style={[styles.cardSub, { color: colors.textSecondary }]}>{t.worksWith}</Text>
              </>
            )}
          </View>
        </View>
        {ftpActive ? (
          <TouchableOpacity
            onPress={async () => {
              await stopServer();
              setFtpActive(false);
              setFtpShare(null);
              setFtpQrVisible(false);
            }}
            style={{ backgroundColor: colors.deleteRed, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>{t.stop}</Text>
          </TouchableOpacity>
        ) : (
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        )}
      </TouchableOpacity>

    {/* FTP QR Modal */}
    <Modal visible={ftpQrVisible} transparent animationType="fade" onRequestClose={() => setFtpQrVisible(false)}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' }}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setFtpQrVisible(false)} />
        <View style={{
          backgroundColor: colors.modalCard,
          borderRadius: 16,
          padding: 16,
          paddingBottom: 24,
          overflow: 'hidden',
          ...qrCard,
        }}>
          <TouchableOpacity
            onPress={() => setFtpQrVisible(false)}
            style={{ position: 'absolute', top: 12, right: 12, zIndex: 10, padding: 4 }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close" size={20} color={colors.textMuted} />
          </TouchableOpacity>
          {qrLayout(<>
          <Text style={{ fontSize: 17, fontWeight: '600', color: colors.textPrimary, marginBottom: 4 }}>{t.ftpServer}</Text>
          <Text style={{ fontSize: 12, color: colors.textMuted, marginBottom: 12 }}>{t.openIn}</Text>
          </>,
          <View style={{ padding: 16, backgroundColor: '#fff', borderRadius: 12 }}>
            <QRCode value={ftpShare ? ftpLoginUrl(ftpShare) : 'ftp://localhost:2121'} size={qrSize} />
          </View>,
          <>
          <Text style={{ fontSize: 13, color: colors.textSecondary, textAlign: 'center', marginTop: 12, marginBottom: 4 }}>FileZilla — {t.host}: <Text style={{ fontWeight: '600', color: colors.green }}>{ftpShare?.address}</Text> {t.port}: {ftpShare?.port}</Text>
          <Text style={{ fontSize: 12, color: colors.textMuted, textAlign: 'center', marginTop: 8 }}>{t.username}: {ftpShare?.username} · {t.password}: <Text style={{ fontWeight: '600', color: colors.textPrimary }}>{ftpShare?.password}</Text></Text>
          {ftpShare && (
            <>
              <Text style={{ fontSize: 12, color: colors.textMuted, textAlign: 'center', marginTop: 12 }}>{t.explorerAddr}</Text>
              <Text selectable style={{ fontSize: 12, fontWeight: '600', color: colors.green, textAlign: 'center', marginTop: 2 }}>{ftpLoginUrl(ftpShare)}</Text>
            </>
          )}
          <TouchableOpacity
            onPress={async () => {
              try {
                const password = await newPassword();
                setFtpShare(prev => (prev ? { ...prev, password } : prev));
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                Alert.alert(t.passwordChanged, t.ftpPwMsg);
              } catch {
                Alert.alert(t.error, t.couldNotChangePw);
              }
            }}
            style={{ marginTop: 12, paddingVertical: 6, paddingHorizontal: 12 }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.blue }}>{t.newPassword}</Text>
          </TouchableOpacity>
          </>)}
        </View>
      </View>
    </Modal>
    </ScrollView>
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
