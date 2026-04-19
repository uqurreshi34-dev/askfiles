import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

const PRO_FEATURES = [
  {
    icon: 'cloud-upload-outline' as const,
    title: 'Cloud Backup',
    desc: 'Auto-backup your files to Google Drive or Dropbox',
  },
  {
    icon: 'sparkles-outline' as const,
    title: 'Unlimited AI Queries',
    desc: 'Ask AI anything about your files with no daily limit',
  },
  {
    icon: 'shield-checkmark-outline' as const,
    title: 'Secure Vault',
    desc: 'Lock sensitive files behind biometric authentication',
  },
  {
    icon: 'sync-outline' as const,
    title: 'Cross-Device Sync',
    desc: 'Access your favourite folders across all your devices',
  },
  {
    icon: 'duplicate-outline' as const,
    title: 'Duplicate Finder',
    desc: 'Find and remove duplicate files to free up space',
  },
];

export default function CloudScreen() {
  function handleUpgrade() {
    // TODO: wire up RevenueCat purchase flow
    console.log('Upgrade tapped');
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.iconWrap}>
            <Ionicons name="cloud-outline" size={36} color="#185FA5" />
          </View>
          <Text style={styles.title}>AskFiles Pro</Text>
          <Text style={styles.subtitle}>
            Unlock the full power of your file manager
          </Text>
        </View>

        {/* Features list */}
        <View style={styles.featuresList}>
          {PRO_FEATURES.map((f, i) => (
            <View key={i} style={styles.featureRow}>
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

        {/* Pricing */}
        <View style={styles.pricingCard}>
          <View style={styles.pricingRow}>
            <Text style={styles.price}>£2.49</Text>
            <Text style={styles.pricePer}> / month</Text>
          </View>
          <Text style={styles.pricingNote}>or £17.99 / year — save 40%</Text>
        </View>

        {/* CTA */}
        <TouchableOpacity style={styles.upgradeBtn} onPress={handleUpgrade} activeOpacity={0.85}>
          <Text style={styles.upgradeBtnText}>Upgrade to Pro</Text>
        </TouchableOpacity>

        <Text style={styles.legalNote}>
          Payment charged to your Google Play account. Cancel anytime.
        </Text>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  scroll: { paddingHorizontal: 24, paddingBottom: 40 },

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

  pricingCard: {
    alignItems: 'center',
    paddingVertical: 20,
    marginBottom: 16,
  },
  pricingRow: { flexDirection: 'row', alignItems: 'flex-end' },
  price: { fontSize: 36, fontWeight: '700', color: '#111', letterSpacing: -1 },
  pricePer: { fontSize: 16, color: '#888780', marginBottom: 6 },
  pricingNote: { fontSize: 13, color: '#888780', marginTop: 4 },

  upgradeBtn: {
    backgroundColor: '#185FA5',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  upgradeBtnText: { fontSize: 16, fontWeight: '600', color: '#fff' },

  legalNote: { fontSize: 11, color: '#B8B6AE', textAlign: 'center', lineHeight: 16 },
});
