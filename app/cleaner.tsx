import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, ActivityIndicator, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { CleanupGroupId } from '@/modules/media-store';
import { useTheme } from '@/hooks/useTheme';
import { formatSize } from '@/utils/files';
import { useLanguage } from '@/modules/appLanguage';
import { cleanerText } from '@/modules/i18n/cleanerText';
import { cleanerGroups, runCleanerScan, subscribeCleaner } from '@/modules/cleanerStore';

const GROUP_ICONS: Record<CleanupGroupId, keyof typeof Ionicons.glyphMap> = {
  whatsappVideo: 'videocam-outline',
  whatsappImages: 'image-outline',
  whatsappVoice: 'mic-outline',
  whatsappDocs: 'document-text-outline',
  telegram: 'paper-plane-outline',
  apks: 'cube-outline',
  oldDownloads: 'download-outline',
  oldScreenshots: 'phone-portrait-outline',
};

export default function CleanerScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const lang = useLanguage();
  const t = cleanerText(lang);
  const { width, height } = useWindowDimensions();
  const landscape = width > height;

  const [groups, setGroups] = useState(cleanerGroups());
  const [scanning, setScanning] = useState(false);

  const scan = useCallback(async () => {
    setScanning(true);
    try { await runCleanerScan(); } catch {} finally { setScanning(false); }
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeCleaner(() => setGroups(cleanerGroups()));
    if (!cleanerGroups()) void scan();
    return unsubscribe;
  }, [scan]);

  const total = (groups ?? []).reduce((sum, g) => sum + g.bytes, 0);
  // Group colours reuse the home palette so the screen feels part of the app.
  const tint = (i: number) => [
    { bg: colors.redBrownBg, fg: colors.redBrown }, { bg: colors.blueBg, fg: colors.blue },
    { bg: colors.purpleBg, fg: colors.purple }, { bg: colors.greenBg, fg: colors.green },
    { bg: colors.amberTint, fg: colors.amber }, { bg: colors.favRedBg, fg: colors.favRed },
  ][i % 6];
  // Two columns side by side in landscape, one in portrait.
  const cardWidth = landscape ? '49%' : '100%';

  const links: { key: string; icon: keyof typeof Ionicons.glyphMap; title: string; sub: string; route: string }[] = [
    { key: 'large', icon: 'resize-outline', title: t.largeFiles, sub: t.largeFilesSub, route: '/large-files' },
    { key: 'dupes', icon: 'copy-outline', title: t.duplicates, sub: t.duplicatesSub, route: '/duplicates' },
    { key: 'similar', icon: 'images-outline', title: t.similar, sub: t.similarSub, route: '/image-duplicates' },
  ];

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={[styles.container, { backgroundColor: colors.background }]}>
      <View key={`header-${lang}`} style={styles.header}>
        <TouchableOpacity onPress={() => !scanning && router.back()} style={styles.headerBtn} disabled={scanning}>
          <Ionicons name="arrow-back" size={24} color={scanning ? colors.textDisabled : colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }, lang === 'ar' && { letterSpacing: 0 }]}>{t.title}</Text>
        <TouchableOpacity onPress={scan} style={[styles.headerBtn, { alignItems: 'flex-end' }]} disabled={scanning} accessibilityLabel={t.rescan}>
          <Ionicons name="refresh" size={22} color={scanning ? colors.textDisabled : colors.blue} />
        </TouchableOpacity>
      </View>

      {scanning || !groups ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.amber} />
          <Text style={[styles.scanningText, { color: colors.textPrimary }]}>{t.scanning}</Text>
          <Text style={{ fontSize: 13, color: colors.textMuted }}>{t.mayTakeMoment}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.content, landscape && styles.contentLandscape]} showsVerticalScrollIndicator={false}>
          <View style={[styles.totalCard, { backgroundColor: colors.amberTint }]}>
            <Ionicons name="brush-outline" size={28} color={colors.amber} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={[styles.totalText, { color: colors.textPrimary }]} numberOfLines={2}>
                {groups.length ? t.canFree(formatSize(total)) : t.nothing}
              </Text>
              <Text style={[styles.totalSub, { color: colors.textSecondary }]}>
                {groups.length ? t.reviewHint : t.nothingSub}
              </Text>
            </View>
          </View>

          <View style={styles.grid}>
            {groups.map((g, i) => {
              const c = tint(i);
              return (
                <TouchableOpacity
                  key={g.id}
                  style={[styles.card, { width: cardWidth, backgroundColor: colors.surfaceAlt }]}
                  activeOpacity={0.7}
                  onPress={() => router.push({ pathname: '/cleaner-group' as any, params: { id: g.id } })}
                >
                  <View style={[styles.icon, { backgroundColor: c.bg }]}>
                    <Ionicons name={GROUP_ICONS[g.id]} size={20} color={c.fg} />
                  </View>
                  <View style={styles.cardInfo}>
                    <Text style={[styles.cardTitle, { color: colors.textPrimary }]} numberOfLines={2}>{t.groups[g.id]}</Text>
                    <Text style={[styles.cardMeta, { color: colors.textMuted }]} numberOfLines={1}>
                      {t.files(g.count)} · {formatSize(g.bytes)}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.textDisabled} />
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>{t.moreWays}</Text>
          <View style={styles.grid}>
            {links.map(l => (
              <TouchableOpacity
                key={l.key}
                style={[styles.card, { width: cardWidth, backgroundColor: colors.surfaceAlt }]}
                activeOpacity={0.7}
                onPress={() => router.push(l.route as any)}
              >
                <View style={[styles.icon, { backgroundColor: colors.surface }]}>
                  <Ionicons name={l.icon} size={20} color={colors.textSecondary} />
                </View>
                <View style={styles.cardInfo}>
                  <Text style={[styles.cardTitle, { color: colors.textPrimary }]} numberOfLines={2}>{l.title}</Text>
                  <Text style={[styles.cardMeta, { color: colors.textMuted }]} numberOfLines={1}>{l.sub}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textDisabled} />
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  headerBtn: { width: 40, height: 40, justifyContent: 'center' },
  title: { flex: 1, fontSize: 20, fontWeight: '500', textAlign: 'center', letterSpacing: -0.5 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 32 },
  scanningText: { fontSize: 16, fontWeight: '500', marginTop: 16 },
  content: { paddingHorizontal: 16, paddingBottom: 32 },
  // Long rows are hard to read across a wide screen, so the column is capped and centred.
  contentLandscape: { width: '85%', alignSelf: 'center' },
  totalCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, padding: 16, marginBottom: 16 },
  totalText: { fontSize: 18, fontWeight: '700', textAlign: 'left' },
  totalSub: { fontSize: 12, marginTop: 4, lineHeight: 17, textAlign: 'left' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  card: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, padding: 12, marginBottom: 8 },
  icon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  cardInfo: { flex: 1, marginRight: 8 },
  cardTitle: { fontSize: 14, fontWeight: '600', textAlign: 'left' },
  cardMeta: { fontSize: 12, marginTop: 2, textAlign: 'left' },
  sectionLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 0.5, marginTop: 16, marginBottom: 8, textAlign: 'left' },
});
