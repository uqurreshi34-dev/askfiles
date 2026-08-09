import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ROOT_PATH } from '@/utils/files';
import { useBookmarks } from '@/hooks/useBookmarks';

interface Props {
  count: number;
  busy: boolean;
  toolbarHeight: number;
  insetRight: number;
  insetLeft: number;
  insetBottom: number;
  screenHeight: number;
  colors: any;
  onMove: (destPath: string, mode: 'move' | 'copy') => void;
}

// Common destinations — always present so the tray is never empty.
const COMMON_DESTS = [
  { label: 'DCIM', icon: 'camera-outline', path: ROOT_PATH + 'DCIM' },
  { label: 'Docs', icon: 'document-outline', path: ROOT_PATH + 'Documents' },
  { label: 'Downloads', icon: 'download-outline', path: ROOT_PATH + 'Download' },
];

export default function MovePill({ count, busy, toolbarHeight, insetRight, insetLeft, insetBottom, screenHeight, colors, onMove }: Props) {
  const [trayOpen, setTrayOpen] = useState(false);
  const [mode, setMode] = useState<'move' | 'copy'>('move');
  const { bookmarks } = useBookmarks();

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

  // Common destinations first, then bookmarks — de-duplicated so a bookmarked
  // common folder doesn't appear twice. O(bookmarks), computed once per open.
  const commonPaths = new Set(COMMON_DESTS.map(d => d.path.replace(/\/$/, '')));
  const bookmarkChips = bookmarks
    .filter(bm => !commonPaths.has(bm.path.replace(/\/$/, '')))
    .map(bm => ({ label: bm.name, icon: 'bookmark' as const, path: bm.path, isBookmark: true }));
  const chips = [
    ...COMMON_DESTS.map(d => ({ ...d, isBookmark: false })),
    ...bookmarkChips,
  ];

  const maxChipAreaHeight = Math.max(120, screenHeight * 0.35);

  return (
    <>
      {trayOpen && (
        <>
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => setTrayOpen(false)}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)', zIndex: 25 }}
          />
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

            <ScrollView
              style={{ maxHeight: maxChipAreaHeight }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {chips.map(c => (
                  <TouchableOpacity
                    key={c.path}
                    onPress={() => moveInto(c.path)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.surface, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, maxWidth: '100%' }}
                  >
                    <Ionicons name={c.icon as any} size={14} color={c.isBookmark ? colors.blue : colors.textPrimary} />
                    <Text style={{ fontSize: 13, color: colors.textPrimary }} numberOfLines={1}>{c.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        </>
      )}

      {!trayOpen && (
        <View style={{ position: 'absolute', bottom: toolbarHeight + insetBottom, right: insetRight + 16, zIndex: 30 }}>
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
