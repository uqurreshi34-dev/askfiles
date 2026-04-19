import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { usePro } from '@/hooks/usePro';

const PRO_FEATURES = [
  {
    icon: 'cloud-upload-outline' as const,
    title: 'Cloud Backup',
    desc: 'Auto-backup your files to Google Drive or Dropbox',
    route: null,
  },
  {
    icon: 'sparkles-outline' as const,
    title: 'Unlimited AI Queries',
    desc: 'Ask AI anything about your files with no daily limit',
    route: null,
  },
  {
    icon: 'shield-checkmark-outline' as const,
    title: 'Secure Vault',
    desc: 'Lock sensitive files behind biometric authentication',
    route: '/vault' as const,
  },
  {
    icon: 'sync-outline' as const,
    title: 'Cross-Device Sync',
    desc: 'Access your favourite folders across all your devices',
    route: null,
  },
  {
    icon: 'duplicate-outline' as const,
    title: 'Duplicate Finder',
    desc: 'Find and remove duplicate files to free up space',
    route: '/duplicates' as const,
  },
];

export default function CloudScreen() {
  const router = useRouter();
  const { isPro, packages, loading, purchasing, restoring, error, purchasePackage, restorePurchases } = usePro();

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator color="#185FA5" />
        </View>
      </SafeAreaView>
    );
  }

  if (isPro) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <View style={[styles.iconWrap, { backgroundColor: '#E8F5E9' }]}>
              <Ionicons name="checkmark-circle" size={40} color="#2E7D32" />
            </View>
            <Text style={styles.title}>You're on Pro 🎉</Text>
            <Text style={styles.subtitle}>All features are unlocked. Thank you for supporting AskFiles!</Text>
          </View>
          <View style={styles.featuresList}>
            {PRO_FEATURES.map((f, i) => {
              const isLast = i === PRO_FEATURES.length - 1;
              const hasRoute = !!f.route;
              return (
                <TouchableOpacity
                  key={i}
                  style={[styles.featureRow, isLast && { borderBottomWidth: 0 }]}
                  onPress={() => hasRoute && router.push(f.route as any)}
                  activeOpacity={hasRoute ? 0.7 : 1}
                >
                  <View style={styles.featureIcon}>
                    <Ionicons name={f.icon} size={20} color="#185FA5" />
                  </View>
                  <View style={styles.featureText}>
                    <Text style={styles.featureTitle}>{f.title}</Text>
                    <Text style={styles.featureDesc}>{f.desc}</Text>
                  </View>
                  {hasRoute ? (
                    <Ionicons name="chevron-forward" size={16} color="#D3D1C7" />
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
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        <View style={styles.header}>
          <View style={styles.iconWrap}>
            <Ionicons name="cloud-outline" size={36} color="#185FA5" />
          </View>
          <Text style={styles.title}>AskFiles Pro</Text>
          <Text style={styles.subtitle}>Unlock the full power of your file manager</Text>
        </View>

        <View style={styles.featuresList}>
          {PRO_FEATURES.map((f, i) => (
            <View key={i} style={[styles.featureRow, i === PRO_FEATURES.length - 1 && { borderBottomWidth: 0 }]}>
              <View style={styles.featureIcon}>
                <Ionicons name={f.icon} size={20} color="#185FA5" />
              </View>
              <View style={styles.featureText}>
                <Text style={styles.featureTitle}>{f.title}</Text>
                <Text style={styles.featureDesc}>{f.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        {error && <Text style={styles.errorText}>{error}</Text>}

        <TouchableOpacity
          style={styles.upgradeBtn}
          onPress={() => packages.monthly && purchasePackage(packages.monthly)}
          disabled={purchasing || restoring || !packages.monthly}
          activeOpacity={0.85}
        >
          {purchasing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Text style={styles.upgradeBtnText}>Monthly — £2.49 / month</Text>
              <Text style={styles.upgradeBtnSub}>Billed monthly, cancel anytime</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.upgradeBtn, styles.annualBtn]}
          onPress={() => packages.annual && purchasePackage(packages.annual)}
          disabled={purchasing || restoring || !packages.annual}
          activeOpacity={0.85}
        >
          {purchasing ? (
            <ActivityIndicator color="#185FA5" />
          ) : (
            <>
              <View style={styles.saveBadge}>
                <Text style={styles.saveBadgeText}>SAVE 40%</Text>
              </View>
              <Text style={[styles.upgradeBtnText, { color: '#185FA5' }]}>Annual — £17.99 / year</Text>
              <Text style={[styles.upgradeBtnSub, { color: '#185FA5' }]}>Best value · £1.50 / month</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={restorePurchases}
          disabled={purchasing || restoring}
          style={styles.restoreBtn}
        >
          {restoring ? (
            <ActivityIndicator color="#888780" size="small" />
          ) : (
            <Text style={styles.restoreText}>Restore purchases</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.legalNote}>
          Payment charged to your Google Play account. Cancel anytime in Play Store settings.
        </Text>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  scroll: { paddingHorizontal: 24, paddingBottom: 40 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: { alignItems: 'center', paddingTop: 32, paddingBottom: 28 },
  iconWrap: {
    width: 72, height: 72, borderRadius: 20,
    backgroundColor: '#EBF3FC',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
  },
  title: { fontSize: 24, fontWeight: '600', color: '#111', letterSpacing: -0.5 },
  subtitle: { fontSize: 14, color: '#888780', marginTop: 6, textAlign: 'center', lineHeight: 20 },

  featuresList: {
    backgroundColor: '#FAFAF8',
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  featureRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingVertical: 14,
    borderBottomWidth: 0.5, borderBottomColor: '#F1EFE8',
  },
  featureIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: '#EBF3FC',
    alignItems: 'center', justifyContent: 'center',
    marginRight: 14,
  },
  featureText: { flex: 1 },
  featureTitle: { fontSize: 14, fontWeight: '500', color: '#111', marginBottom: 2 },
  featureDesc: { fontSize: 12, color: '#888780', lineHeight: 17 },

  errorText: { fontSize: 13, color: '#E24B4A', textAlign: 'center', marginBottom: 12 },

  upgradeBtn: {
    backgroundColor: '#185FA5',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  annualBtn: {
    backgroundColor: '#EBF3FC',
    borderWidth: 1.5,
    borderColor: '#185FA5',
    position: 'relative',
  },
  saveBadge: {
    position: 'absolute',
    top: -10,
    right: 16,
    backgroundColor: '#185FA5',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  saveBadgeText: { fontSize: 10, fontWeight: '700', color: '#fff', letterSpacing: 0.5 },
  upgradeBtnText: { fontSize: 16, fontWeight: '600', color: '#fff' },
  upgradeBtnSub: { fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 3 },

  restoreBtn: { alignItems: 'center', paddingVertical: 12 },
  restoreText: { fontSize: 14, color: '#888780' },

  legalNote: { fontSize: 11, color: '#B8B6AE', textAlign: 'center', lineHeight: 16, marginTop: 8 },
});
