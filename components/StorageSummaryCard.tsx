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
  sdCard?: { name: string; used: number; total: number } | null;
}

function getStatusColor(usedPercent: number): string {
  return usedPercent < 50 ? '#2E7D32' : usedPercent < 75 ? '#F5B731' : '#D32F2F';
}

function getStatusMessage(usedPercent: number): string {
  return usedPercent < 50
    ? 'Storage is healthy'
    : usedPercent < 75
    ? 'Consider clearing some space'
    : 'Running low on space';
}

export default function StorageSummaryCard({
  usedBytes,
  totalBytes,
  freeBytes,
  note,
  showChevron,
  sdCard,
}: Props) {
  const { colors, dark } = useTheme();
  const [infoVisible, setInfoVisible] = useState(false);

  const trackColor = dark ? '#2A2A2A' : '#EFEFEF';
  const hasSd = !!sdCard;

  // Internal storage
  const intUsedPct = totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 100) : 0;
  const intStatusColor = getStatusColor(intUsedPct);

  // SD card
  const sdUsedBytes = sdCard?.used ?? 0;
  const sdTotalBytes = sdCard?.total ?? 1;
  const sdFreeBytes = Math.max(0, sdTotalBytes - sdUsedBytes);
  const sdUsedPct = sdCard ? Math.round((sdUsedBytes / sdTotalBytes) * 100) : 0;
  const sdStatusColor = getStatusColor(sdUsedPct);

  return (
    <View style={[styles.wrap, { backgroundColor: colors.surface }]}>

      <View style={styles.headerRow}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>
          {hasSd ? 'Storage' : 'Internal storage'}
        </Text>
        <TouchableOpacity
          onPress={() => setInfoVisible(true)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      {hasSd ? (
        /* ── Two donuts side by side ── */
        <View style={styles.dualRow}>

          {/* Internal */}
          <View style={styles.donutCol}>
            <Text style={[styles.donutColLabel, { color: colors.textMuted }]}>Internal</Text>
            <View style={styles.donutWrapSm}>
              <DonutView
                usedBytes={usedBytes}
                totalBytes={totalBytes}
                trackColor={trackColor}
                strokeWidth={16}
                style={styles.donutSm}
              />
              <View style={styles.donutCenter}>
                <Text style={[styles.donutUsedSm, { color: colors.textPrimary }]}>
                  {formatSize(usedBytes)}
                </Text>
                <Text style={[styles.donutLabel, { color: colors.textMuted }]}>used</Text>
              </View>
            </View>
            <View style={[styles.statusRow]}>
              <View style={[styles.statusDot, { backgroundColor: intStatusColor }]} />
              <Text style={[styles.statusTextSm, { color: intStatusColor }]} numberOfLines={1}>
                {getStatusMessage(intUsedPct)}
              </Text>
            </View>
            <View style={styles.pillColStack}>
              {[
                { label: 'Free',  value: formatSize(freeBytes) },
                { label: 'Used',  value: `${intUsedPct}%` },
                { label: 'Total', value: formatSize(totalBytes) },
              ].map(s => (
                <View key={s.label} style={[styles.pillRow, { backgroundColor: colors.background }]}>
                  <Text style={[styles.pillVal, { color: colors.textPrimary }]}>{s.value}</Text>
                  <Text style={[styles.pillLabel, { color: colors.textMuted }]}>{s.label}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Divider */}
          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {/* SD Card */}
          <View style={styles.donutCol}>
            <Text style={[styles.donutColLabel, { color: colors.textMuted }]} numberOfLines={1}>
              {sdCard!.name}
            </Text>
            <View style={styles.donutWrapSm}>
              <DonutView
                usedBytes={sdUsedBytes}
                totalBytes={sdTotalBytes}
                trackColor={trackColor}
                strokeWidth={16}
                style={styles.donutSm}
              />
              <View style={styles.donutCenter}>
                <Text style={[styles.donutUsedSm, { color: colors.textPrimary }]}>
                  {formatSize(sdUsedBytes)}
                </Text>
                <Text style={[styles.donutLabel, { color: colors.textMuted }]}>used</Text>
              </View>
            </View>
            <View style={styles.statusRow}>
              <View style={[styles.statusDot, { backgroundColor: sdStatusColor }]} />
              <Text style={[styles.statusTextSm, { color: sdStatusColor }]} numberOfLines={1}>
                {getStatusMessage(sdUsedPct)}
              </Text>
            </View>
            <View style={styles.pillColStack}>
              {[
                { label: 'Free',  value: formatSize(sdFreeBytes) },
                { label: 'Used',  value: `${sdUsedPct}%` },
                { label: 'Total', value: formatSize(sdTotalBytes) },
              ].map(s => (
                <View key={s.label} style={[styles.pillRow, { backgroundColor: colors.background }]}>
                  <Text style={[styles.pillVal, { color: colors.textPrimary }]}>{s.value}</Text>
                  <Text style={[styles.pillLabel, { color: colors.textMuted }]}>{s.label}</Text>
                </View>
              ))}
            </View>
          </View>

        </View>
      ) : (
        /* ── Single donut ── */
        <>
          <View style={styles.donutWrap}>
            <DonutView
              usedBytes={usedBytes}
              totalBytes={totalBytes}
              trackColor={trackColor}
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

          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: intStatusColor }]} />
            <Text style={[styles.statusText, { color: intStatusColor }]}>
              {getStatusMessage(intUsedPct)}
            </Text>
          </View>

          <View style={styles.pillsRow}>
            {[
              { label: 'Free',  value: formatSize(freeBytes) },
              { label: 'Used',  value: `${intUsedPct}%` },
              { label: 'Total', value: formatSize(totalBytes) },
            ].map(s => (
              <View key={s.label} style={[styles.pill, { backgroundColor: colors.background }]}>
                <Text style={[styles.pillVal, { color: colors.textPrimary }]}>{s.value}</Text>
                <Text style={[styles.pillLabel, { color: colors.textMuted }]}>{s.label}</Text>
              </View>
            ))}
          </View>
        </>
      )}

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
              {`Your device has ${formatSize(totalBytes)} of internal storage. AskFiles shows ${formatSize(usedBytes)} used across your files and apps.${hasSd ? ` Your ${sdCard!.name} has ${formatSize(sdTotalBytes)} total with ${formatSize(sdFreeBytes)} free.` : ''} Android Settings may show a slightly different figure — this is normal and is due to how the operating system calculates reserved and system space.`}
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

  // Single donut
  donutWrap: { alignItems: 'center', marginBottom: 12, position: 'relative', height: 160 },
  donut: { width: 160, height: 160 },
  donutUsed: { fontSize: 22, fontWeight: '500' },

  // Dual donuts
  dualRow: { flexDirection: 'row', alignItems: 'flex-start' },
  donutCol: { flex: 1, alignItems: 'center' },
  donutColLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 0.3, marginBottom: 8, textTransform: 'uppercase' },
  donutWrapSm: { position: 'relative', height: 120, width: 120, marginBottom: 8 },
  donutSm: { width: 120, height: 120 },
  donutUsedSm: { fontSize: 16, fontWeight: '500' },
  divider: { width: 0.5, alignSelf: 'stretch', marginHorizontal: 8, marginTop: 24 },
  pillColStack: { width: '100%', gap: 4, marginTop: 8 },
  pillRow: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusTextSm: { fontSize: 11, fontWeight: '500', flexShrink: 1 },

  // Shared
  donutCenter: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  donutLabel: { fontSize: 11, marginTop: 2 },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginBottom: 4 },
  statusDot: { width: 7, height: 7, borderRadius: 4, flexShrink: 0 },
  statusText: { fontSize: 13, fontWeight: '500' },
  pillsRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  pill: { flex: 1, borderRadius: 10, padding: 10 },
  pillVal: { fontSize: 15, fontWeight: '500' },
  pillLabel: { fontSize: 11, marginTop: 2 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center' },
  modalCard: { borderRadius: 12, padding: 16, width: 260 },
  modalText: { fontSize: 13, lineHeight: 20, textAlign: 'center' },
});
