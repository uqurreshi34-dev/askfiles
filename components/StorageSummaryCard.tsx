import { formatBytes } from '@/utils/formatBytes';
import React, { useState } from 'react';
import { Modal, TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';

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
  const { colors } = useTheme();
  const [infoVisible, setInfoVisible] = useState(false);

  return (
    <View style={[styles.wrap, { backgroundColor: colors.surface }]}>
      <View style={styles.row}>
        <View style={styles.left}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Internal storage</Text>
          <TouchableOpacity onPress={() => setInfoVisible(true)}>
            <Ionicons name="information-circle-outline" size={14} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
        <View style={styles.right}>
          <Text style={[styles.value, { color: colors.textPrimary }]}>
            {formatBytes(usedBytes)} of {formatBytes(totalBytes)} used
          </Text>
          {showChevron ? (
            <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
          ) : null}
        </View>
      </View>

      <Text style={[styles.note, { color: colors.textMuted }]}>
        {formatBytes(freeBytes)} available
      </Text>

      <Text style={[styles.note, { color: colors.successGreen }]}>
        {note}
      </Text>

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
          <View style={[styles.modalCard, { backgroundColor: colors.modalCard }]} onStartShouldSetResponder={() => true}>
            <Text style={[styles.modalText, { color: colors.textPrimary }]}>
            {`Your device has ${formatBytes(totalBytes)} of storage in total. AskFiles shows ${formatBytes(usedBytes)} used by your personal files — photos, videos, documents and downloads. Android may show a higher figure for used storage because it also includes Android and system files, which AskFiles cannot access.`}
            </Text>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: 16, marginBottom: 20, borderRadius: 10, padding: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  left: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  right: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  label: { fontSize: 13 },
  value: { fontSize: 13, fontWeight: '500' },
  barTrack: { height: 4, borderRadius: 2, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: '#185FA5' },
  note: { fontSize: 10, marginTop: 6 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center' },
  modalCard: { borderRadius: 12, padding: 16, width: 260 },
  modalText: { fontSize: 13, textAlign: 'center' },
});
