import React from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';

interface DetailRow {
  label: string;
  value: string;
}

interface Props {
  visible: boolean;
  name: string;
  data: DetailRow[];
  onClose: () => void;
  title?: string;
}

export default function FileDetailsModal({ visible, name, data, onClose, title }: Props) {
  const { colors } = useTheme();
  const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = useWindowDimensions();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: SCREEN_WIDTH > SCREEN_HEIGHT ? SCREEN_WIDTH * 0.2 : 24, paddingVertical: SCREEN_WIDTH > SCREEN_HEIGHT ? SCREEN_HEIGHT * 0.1 : 0 }}>
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={onClose} />
        <View style={{ backgroundColor: colors.card, borderRadius: 16, padding: 20, width: '100%', maxHeight: SCREEN_WIDTH > SCREEN_HEIGHT ? SCREEN_HEIGHT * 0.8 : SCREEN_HEIGHT * 0.9 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <Text style={{ fontSize: 16, fontWeight: '600', color: colors.textPrimary }}>{title ?? 'File Info'}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
          <Text style={{ fontSize: 13, color: colors.textMuted, marginBottom: 16 }} numberOfLines={2}>{name}</Text>
          <ScrollView showsVerticalScrollIndicator={false} nestedScrollEnabled={true}>
            {data.map((row, i) => (
              <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: i < data.length - 1 ? 0.5 : 0, borderBottomColor: colors.border }}>
                <Text style={{ fontSize: 13, color: colors.textMuted, flex: 1 }}>{row.label}</Text>
                <Text style={{ fontSize: 13, color: colors.textPrimary, flex: 2, textAlign: 'right' }} numberOfLines={2}>{row.value}</Text>
              </View>
            ))}
          </ScrollView>
          <TouchableOpacity
            style={{ marginTop: 16, padding: 12, borderRadius: 10, backgroundColor: colors.surface, alignItems: 'center' }}
            onPress={onClose}>
            <Text style={{ fontSize: 14, fontWeight: '500', color: colors.textSecondary }}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
