import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatBytes } from '@/utils/formatBytes';

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
  showChevron
}: Props) {
  const usedPercent = totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0;

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Text style={styles.label}>Internal storage</Text>
        <View style={styles.right}>
          <Text style={styles.value}>
            {formatBytes(usedBytes)} of {formatBytes(totalBytes)} used
          </Text>
          {showChevron ? (
            <Ionicons name="chevron-forward" size={14} color="#888780" />
            ) : null}
        </View>
      </View>

      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${usedPercent}%` }]} />
      </View>

      <Text style={styles.note}>
        {formatBytes(freeBytes)} available
        </Text>

        <Text style={[styles.note, { color: '#8A887F' }]}>
            {note}
        </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 16,
    marginBottom: 20,
    backgroundColor: '#F1EFE8',
    borderRadius: 10,
    padding: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  label: {
    fontSize: 13,
    color: '#5F5E5A',
  },
  value: {
    fontSize: 13,
    fontWeight: '500',
    color: '#111',
  },
  barTrack: {
    height: 4,
    backgroundColor: '#D3D1C7',
    borderRadius: 2,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    backgroundColor: '#185FA5',
  },
  note: {
    fontSize: 10,
    color: '#8A887F',
    marginTop: 6,
  },
});
