import { formatSize } from '@/utils/files';
import React, { useState } from 'react';
import { Modal, TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { DonutView } from '@/modules/storage-stats/src/StorageStatsView';

interface Props {
  usedBytes: number;
  totalBytes: number;
  freeBytes: number;
  note?: string;
  showChevron?: boolean;
}

export default function StorageSummaryCard({
  usedBytes,
  totalBytes,
  freeBytes,
  note,
  showChevron,
}: Props) {
  const { colors, dark } = useTheme();
  const [infoVisible, setInfoVisible] = useState(false);

  const usedPercent = totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 100) : 0;

  const statusColor = usedPercent < 50 ? '#2E7D32' : usedPercent < 75 ? '#F5B731' : '#D32F2F';
  const statusMessage = usedPercent < 50
    ? 'Storage is healthy'
    : usedPercent < 75
    ? 'Consider clearing some space'
    : 'Running low on space';

  return (
    <View style={[styles.wrap, { backgroundColor: colors.surface }]}>

      <View style={styles.headerRow}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>Internal storage</Text>
        <TouchableOpacity
          onPress={() => setInfoVisible(true)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      <View style={styles.donutWrap}>
        <DonutView
          usedBytes={usedBytes}
          totalBytes={totalBytes}
          trackColor={dark ? '#2A2A2A' : '#EFEFEF'}
          strokeWidth={20}
          style={styles.donut}
        />
        <View style={styles.donutCenter}>
          <Text style={[styles.donutUsed, { color: colors.textPrimary }]}>
            {formatSize(usedBytes)}
          </Text>
          <Text style={[styles.donutLabel, { color: colors.textMuted }]}>used</Text>
        </View>
      </View>

      {/* Status message */}
      <View style={styles.statusRow}>
        <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
        <Text style={[styles.statusText, { color: statusColor }]}>{statusMessage}</Text>
      </View>

      {/* Stat pills */}
      <View style={styles.pillRow}>
        {[
          { label: 'Free',  value: formatSize(freeBytes) },
          { label: 'Used',  value: `${usedPercent}%` },
          { label: 'Total', value: formatSize(totalBytes) },
        ].map(s => (
          <View key={s.label} style={[styles.pill, { backgroundColor: colors.background }]}>
            <Text style={[styles.pillVal, { color: colors.textPrimary }]}>{s.value}</Text>
            <Text style={[styles.pillLabel, { color: colors.textMuted }]}>{s.label}</Text>
          </View>
        ))}
      </View>

      <Modal
        visible={infoVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setInfoVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setInfoVisible(false)}
        >
          <View
            style={[styles.modalCard, { backgroundColor: colors.modalCard }]}
            onStartShouldSetResponder={() => true}
          >
            <Text style={[styles.modalText, { color: colors.textPrimary }]}>
              {`Your device has ${formatSize(totalBytes)} of storage in total. AskFiles shows ${formatSize(usedBytes)} used across your files and apps. Android Settings may show a slightly different figure — this is normal and is due to how the operating system calculates reserved and system space.`}
            </Text>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: 16, marginBottom: 20, borderRadius: 14, padding: 16 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  label: { fontSize: 13 },
  donutWrap: { alignItems: 'center', marginBottom: 12, position: 'relative', height: 160 },
  donut: { width: 160, height: 160 },
  donutCenter: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  donutUsed: { fontSize: 22, fontWeight: '500' },
  donutLabel: { fontSize: 11, marginTop: 2 },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 16 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 13, fontWeight: '500' },
  pillRow: { flexDirection: 'row', gap: 8 },
  pill: { flex: 1, borderRadius: 10, padding: 10 },
  pillVal: { fontSize: 15, fontWeight: '500' },
  pillLabel: { fontSize: 11, marginTop: 2 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center' },
  modalCard: { borderRadius: 12, padding: 16, width: 260 },
  modalText: { fontSize: 13, lineHeight: 20, textAlign: 'center' },
});
