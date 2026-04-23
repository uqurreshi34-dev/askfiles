import { formatBytes } from '@/utils/formatBytes';
import React, { useState } from 'react';
import { Modal, TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getMarketedStorage } from '@/utils/storage';

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
  const [infoVisible, setInfoVisible] = useState(false);
  const usedPercent = totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0;

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <View style={styles.left}>
            <Text style={styles.label}>Internal storage</Text>
            <TouchableOpacity onPress={() => setInfoVisible(true)}>
            <Ionicons name="information-circle-outline" size={14} color="#888780" />
            </TouchableOpacity>
        </View>

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
                <View style={styles.modalCard} onStartShouldSetResponder={() => true}>
                <Text style={styles.modalText}>
                Your device is sold as {getMarketedStorage(totalBytes)} GB, but usable storage is lower (~{formatBytes(totalBytes)}) due to formatting and system files.

                    {"\n\n"}
                    Android settings include apps and system data. This app shows only user files, so the used space appears lower.
                </Text>
                </View>
            </TouchableOpacity>
        </Modal>
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
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    width: 260,
  },
  modalText: {
    fontSize: 13,
    color: '#111',
    textAlign: 'center',
  },
});
