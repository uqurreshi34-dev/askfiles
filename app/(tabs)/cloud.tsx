import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { usePro } from '@/hooks/usePro';
import { useTheme } from '@/hooks/useTheme';

const PRO_FEATURES = [
  {
    icon: 'cloud-upload-outline' as const,
    title: 'Cloud Backup',
    desc: 'Auto-backup your vault files to Google Drive',
    route: '/backup' as const,
  },
  {
    icon: 'sparkles-outline' as const,
    title: 'Unlimited AI Queries',
    desc: 'Ask AI anything about your files with no daily limit',
    route: null,
  },
  {
    icon: 'document-text-outline' as const,
    title: 'Smart Search',
    desc: 'Search inside PDFs, Word, Excel and text files — find any word across all your documents instantly',
    route: null,
  },
  {
    icon: 'shield-checkmark-outline' as const,
    title: 'Secure Vault',
    desc: 'Lock sensitive files behind biometric authentication',
    route: '/vault' as const,
  },
  {
    icon: 'duplicate-outline' as const,
    title: 'Duplicate Finder',
    desc: 'Find and remove duplicate files to free up space',
    route: '/duplicates' as const,
  },
];

export default function CloudScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { isPro, packages, loading, purchasing, restoring, error, purchasePackage, restorePurchases } = usePro();

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.blue} />
        </View>
      </SafeAreaView>
    );
  }

  if (isPro) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.topBar}>
            <TouchableOpacity onPress={() => router.push('/(tabs)')} style={styles.homeBtn}>
              <Ionicons name="home-outline" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
          <View style={styles.header}>
            <View style={[styles.iconWrap, { backgroundColor: '#E8F5E9' }]}>
              <Ionicons name="checkmark-circle" size={40} color="#2E7D32" />
            </View>
            <Text style={[styles.title, { color: colors.textPrimary }]}>You're on Pro 🎉</Text>
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>All features are unlocked. Thank you for supporting AskFiles!</Text>
          </View>
          <View style={[styles.featuresList, { backgroundColor: colors.surfaceAlt }]}>
            {PRO_FEATURES.map((f, i) => {
              const isLast = i === PRO_FEATURES.length - 1;
              const hasRoute = !!f.route;
              return (
                <TouchableOpacity
                  key={i}
                  style={[styles.featureRow, { borderBottomColor: colors.border }, isLast && { borderBottomWidth: 0 }]}
                  onPress={() => hasRoute && router.push(f.route as any)}
                  activeOpacity={hasRoute ? 0.7 : 1}
                >
                  <View style={[styles.featureIcon, { backgroundColor: colors.blueTint }]}>
                    <Ionicons name={f.icon} size={20} color={colors.blue} />
                  </View>
                  <View style={styles.featureText}>
                    <Text style={[styles.featureTitle, { color: colors.textPrimary }]}>{f.title}</Text>
                    <Text style={[styles.featureDesc, { color: colors.textMuted }]}>{f.desc}</Text>
                  </View>
                  {hasRoute ? (
                    <Ionicons name="chevron-forward" size={16} color={colors.textDisabled} />
                  ) : (
                    <Ionicons name="checkmark" size={18} color="#2E7D32" />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.push('/(tabs)')} style={styles.homeBtn}>
            <Ionicons name="home-outline" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>
        <View style={styles.header}>
          <View style={[styles.iconWrap, { backgroundColor: colors.blueTint }]}>
            <Ionicons name="cloud-outline" size={36} color={colors.blue} />
          </View>
          <Text style={[styles.title, { color: colors.textPrimary }]}>AskFiles Pro</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>Unlock the full power of your file manager</Text>
        </View>

        <View style={[styles.featuresList, { backgroundColor: colors.surfaceAlt }]}>
          {PRO_FEATURES.map((f, i) => (
            <View key={i} style={[styles.featureRow, { borderBottomColor: colors.border }, i === PRO_FEATURES.length - 1 && { borderBottomWidth: 0 }]}>
              <View style={[styles.featureIcon, { backgroundColor: colors.blueTint }]}>
                <Ionicons name={f.icon} size={20} color={colors.blue} />
              </View>
              <View style={styles.featureText}>
                <Text style={[styles.featureTitle, { color: colors.textPrimary }]}>{f.title}</Text>
                <Text style={[styles.featureDesc, { color: colors.textMuted }]}>{f.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        {error && <Text style={styles.errorText}>{error}</Text>}

        <TouchableOpacity
          style={styles.upgradeBtn}
          onPress={() => packages.lifetime && purchasePackage(packages.lifetime)}
          disabled={purchasing || restoring || !packages.lifetime}
          activeOpacity={0.85}
        >
          {purchasing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Text style={styles.upgradeBtnText}>Lifetime — £2.99</Text>
              <Text style={styles.upgradeBtnSub}>One-time payment, yours forever</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={restorePurchases} disabled={purchasing || restoring} style={styles.restoreBtn}>
          {restoring ? (
            <ActivityIndicator color={colors.textMuted} size="small" />
          ) : (
            <Text style={[styles.restoreText, { color: colors.textMuted }]}>Restore purchases</Text>
          )}
        </TouchableOpacity>

        <Text style={[styles.legalNote, { color: colors.textDisabled }]}>
          One-time payment via Google Play. No subscription, no recurring charges.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 24, paddingBottom: 40 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingTop: 8, marginBottom: -8 },
  homeBtn: { width: 40, height: 40, justifyContent: 'center' },
  header: { alignItems: 'center', paddingTop: 32, paddingBottom: 28 },
  iconWrap: { width: 72, height: 72, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  title: { fontSize: 24, fontWeight: '600', letterSpacing: -0.5 },
  subtitle: { fontSize: 14, marginTop: 6, textAlign: 'center', lineHeight: 20 },
  featuresList: { borderRadius: 16, paddingVertical: 8, paddingHorizontal: 16, marginBottom: 24 },
  featureRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 14, borderBottomWidth: 0.5 },
  featureIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  featureText: { flex: 1 },
  featureTitle: { fontSize: 14, fontWeight: '500', marginBottom: 2 },
  featureDesc: { fontSize: 12, lineHeight: 17 },
  errorText: { fontSize: 13, color: '#E24B4A', textAlign: 'center', marginBottom: 12 },
  upgradeBtn: { backgroundColor: '#185FA5', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginBottom: 12 },
  upgradeBtnText: { fontSize: 16, fontWeight: '600', color: '#fff' },
  upgradeBtnSub: { fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 3 },
  restoreBtn: { alignItems: 'center', paddingVertical: 12 },
  restoreText: { fontSize: 14 },
  legalNote: { fontSize: 11, textAlign: 'center', lineHeight: 16, marginTop: 8 },
});
