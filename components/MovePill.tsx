import React, { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ROOT_PATH } from '@/utils/files';

interface Props {
  count: number;
  busy: boolean;
  toolbarHeight: number;
  insetRight: number;
  insetLeft: number;
  insetBottom: number;
  colors: any;
  onBrowse: (mode: 'move' | 'copy') => void;
  onMove: (destPath: string, mode: 'move' | 'copy') => void;
}

const TRAY_DESTS = [
  { key: 'dcim', label: 'DCIM', icon: 'camera-outline', path: ROOT_PATH + 'DCIM' },
  { key: 'docs', label: 'Docs', icon: 'document-outline', path: ROOT_PATH + 'Documents' },
  { key: 'downloads', label: 'Downloads', icon: 'download-outline', path: ROOT_PATH + 'Download' },
];

export default function MovePill({ count, busy, toolbarHeight, insetRight, insetLeft, insetBottom, colors, onBrowse, onMove }: Props) {
  const [trayOpen, setTrayOpen] = useState(false);
  const [mode, setMode] = useState<'move' | 'copy'>('move');

  const openTray = () => {
    if (count === 0) return;
    setMode('move');
    setTrayOpen(true);
  };

  const moveInto = (destPath: string) => {
    setTrayOpen(false);
    onMove(destPath, mode);
  };

  if (count === 0 || busy) return null;

  return (
    <>
      {trayOpen && (
        <>
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => setTrayOpen(false)}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)', zIndex: 25 }}
          />
          {/* Floating card: bounded by safe-area inset + a base 16px margin so it
              never touches the screen edge (insets can be 0 even in landscape) and
              never runs under a cutout. Anchored flush above the measured toolbar,
              so it sits cleanly in both orientations. */}
          <View style={{ position: 'absolute', left: insetLeft + 16, right: insetRight + 16, bottom: toolbarHeight + insetBottom, zIndex: 26, backgroundColor: colors.background, borderRadius: 16, borderWidth: 0.5, borderColor: colors.border, padding: 16, marginBottom: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <Text style={{ fontSize: 13, color: colors.textSecondary }}>
                {mode === 'move' ? 'Move' : 'Copy'} {count} item{count !== 1 ? 's' : ''} into…
              </Text>
              <View style={{ flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 14, padding: 2 }}>
                <TouchableOpacity
                  onPress={() => setMode('move')}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 5, backgroundColor: mode === 'move' ? colors.blue : 'transparent' }}
                >
                  <Ionicons name="arrow-redo-outline" size={14} color={mode === 'move' ? '#fff' : colors.textSecondary} />
                  <Text style={{ fontSize: 12, color: mode === 'move' ? '#fff' : colors.textSecondary }}>Move</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setMode('copy')}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 5, backgroundColor: mode === 'copy' ? colors.blue : 'transparent' }}
                >
                  <Ionicons name="copy-outline" size={14} color={mode === 'copy' ? '#fff' : colors.textSecondary} />
                  <Text style={{ fontSize: 12, color: mode === 'copy' ? '#fff' : colors.textSecondary }}>Copy</Text>
                </TouchableOpacity>
              </View>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {TRAY_DESTS.map(d => (
                <TouchableOpacity
                  key={d.key}
                  onPress={() => moveInto(d.path)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.surface, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10 }}
                >
                  <Ionicons name={d.icon as any} size={16} color={colors.textPrimary} />
                  <Text style={{ fontSize: 13, color: colors.textPrimary }}>{d.label}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                onPress={() => { setTrayOpen(false); onBrowse(mode); }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.surface, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10 }}
              >
                <Ionicons name="folder-outline" size={16} color={colors.blue} />
                <Text style={{ fontSize: 13, color: colors.blue }}>Browse…</Text>
              </TouchableOpacity>
            </View>
          </View>
        </>
      )}

      {!trayOpen && (
        <View style={{ position: 'absolute', bottom: toolbarHeight + 60, right: insetRight + 16, zIndex: 30 }}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={openTray}
            style={{ minWidth: 52, height: 52, paddingHorizontal: 14, borderRadius: 26, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 6 }}
          >
            <Ionicons name="documents-outline" size={18} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>{count}</Text>
          </TouchableOpacity>
        </View>
      )}
    </>
  );
}
