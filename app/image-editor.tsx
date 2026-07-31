import { useState, useEffect, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Image, ActivityIndicator,
  Alert, ScrollView, useWindowDimensions, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/hooks/useTheme';
import { toPath } from '@/utils/files';
import { annotateImage } from '@/modules/file-converter';
import { scanFile, openFile as openFileNative } from '@/modules/share-module';
import FolderPickerModal from '@/components/FolderPickerModal';
import * as ScreenOrientation from 'expo-screen-orientation';

type Annotation = { text: string; x: number; y: number; sizeRatio: number };

const QUICK_EMOJI = ['😀', '❤️', '🔥', '👍', '⭐', '🎉', '😂', '✅'];

// Fractions of image width — must match what native uses for font size
const SIZES = [
  { label: 'S', ratio: 0.05 },
  { label: 'M', ratio: 0.08 },
  { label: 'L', ratio: 0.12 },
];

export default function ImageEditorScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { uri, name } = useLocalSearchParams<{ uri: string; name: string }>();
  const { width: winWidth } = useWindowDimensions();

  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [pending, setPending] = useState('');
  const [sizeRatio, setSizeRatio] = useState(SIZES[1].ratio);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sizes, setSizes] = useState<Record<number, { w: number; h: number }>>({});

  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    return () => { ScreenOrientation.unlockAsync(); };
  }, []);

  // Read the real pixel dimensions once — needed so the canvas matches the
  // image's aspect ratio exactly. Without that, a tap in the letterboxed
  // area would map to a coordinate outside the image.
  useEffect(() => {
    let cancelled = false;
    Image.getSize(
      uri as string,
      (w, h) => {
        if (cancelled) return;
        setDims({ w, h });
        setLoading(false);
      },
      () => {
        if (cancelled) return;
        setLoading(false);
        Alert.alert('Unsupported image', 'Could not read this image.', [
          { text: 'OK', onPress: () => router.back() },
        ]);
      }
    );
    return () => { cancelled = true; };
  }, [uri]);

  // Canvas sized to the image's aspect ratio, so there is no dead space and
  // tap coordinates convert straight to fractions of the image.
  const canvas = useMemo(() => {
    if (!dims) return null;
    const w = winWidth;
    return { w, h: Math.round((w * dims.h) / dims.w) };
  }, [dims, winWidth]);

  function handleCanvasPress(e: any) {
    if (!canvas) return;
    const text = pending.trim();
    if (!text) {
      Alert.alert('Nothing to place', 'Type some text or pick an emoji first.');
      return;
    }
    const { locationX, locationY } = e.nativeEvent;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setAnnotations(prev => [...prev, {
      text,
      x: locationX / canvas.w,
      y: locationY / canvas.h,
      sizeRatio,
    }]);
  }

  function undo() {
    if (!annotations.length) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const lastIndex = annotations.length - 1;
    setAnnotations(prev => prev.slice(0, -1));
    setSizes(prev => {
      const next = { ...prev };
      delete next[lastIndex];
      return next;
    });
  }

  function clearAll() {
    if (!annotations.length) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setAnnotations([]);
    setSizes({});
  }

  async function handleSave(folderPath: string) {
    setPickerVisible(false);
    if (!annotations.length) return;
    setSaving(true);
    try {
      const original = (name as string) ?? 'image.jpg';
      const dot = original.lastIndexOf('.');
      const base = dot > 0 ? original.slice(0, dot) : original;
      const ext = dot > 0 ? original.slice(dot + 1) : 'jpg';
      const stamp = Date.now();
      const outputPath = `${folderPath}/${base}_edited_${stamp}.${ext}`;

      const result = await annotateImage(toPath(uri as string), outputPath, annotations);
      await scanFile(outputPath).catch(() => {});
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      const note = result.downsampled
        ? '\n\nThis image was very large, so the copy was saved at a slightly reduced size.'
        : '';
      Alert.alert('Saved', `Saved as ${base}_edited_${stamp}.${ext}${note}`, [
        { text: 'Done', onPress: () => router.back() },
        {
          text: 'Open',
          onPress: async () => {
            try {
              await openFileNative(outputPath, `image/${ext.toLowerCase() === 'jpg' ? 'jpeg' : ext.toLowerCase()}`);
            } catch {}
          },
        },
      ]);
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Could not save', e?.message ?? 'Something went wrong writing the image.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.header, { backgroundColor: colors.background }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
          {(name as string) ?? 'Edit image'}
        </Text>
        <TouchableOpacity
          onPress={() => setPickerVisible(true)}
          style={styles.headerBtn}
          disabled={!annotations.length || saving}
        >
          {saving
            ? <ActivityIndicator size="small" color={colors.blue} />
            : <Ionicons name="save-outline" size={22} color={annotations.length ? colors.blue : colors.textDisabled} />
          }
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.blue} />
        </View>
      ) : (
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {canvas && (
            <TouchableOpacity
              activeOpacity={1}
              onPress={handleCanvasPress}
              style={{ width: canvas.w, height: canvas.h, position: 'relative', overflow: 'visible' }}
            >
              <Image
                source={{ uri: uri as string }}
                style={{ width: canvas.w, height: canvas.h }}
                resizeMode="cover"
              />
              {annotations.map((a, i) => {
                const fontPx = a.sizeRatio * canvas.w;
                // Split into user-perceived characters, so ❤️ (U+2764 + U+FE0F)
                // stays one unit rather than splitting the variation selector off.
                let glyphs: string[];
                try {
                  const seg = new (Intl as any).Segmenter(undefined, { granularity: 'grapheme' });
                  glyphs = Array.from(seg.segment(a.text), (s: any) => s.segment);
                } catch {
                    glyphs = a.text.match(
                      /\p{RI}\p{RI}|\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})?)*|\P{M}\p{M}*|./gu
                    ) ?? Array.from(a.text);
                  }
                const m = sizes[i];
                return (
                  <View
                    key={i}
                    pointerEvents="none"
                    style={{
                      position: 'absolute',
                      left: a.x * canvas.w,
                      top: a.y * canvas.h,
                      flexDirection: 'row',
                      opacity: m ? 1 : 0,
                      transform: m ? [{ translateX: -m.w / 2 }, { translateY: -m.h / 2 }] : undefined,
                    }}
                    onLayout={e => {
                      const { width, height } = e.nativeEvent.layout;
                      setSizes(prev => {
                        const cur = prev[i];
                        if (cur && Math.abs(cur.w - width) < 1 && Math.abs(cur.h - height) < 1) return prev;
                        return { ...prev, [i]: { w: width, h: height } };
                      });
                    }}
                  >
                    {glyphs.map((g, j) => (
                      <Text
                        key={j}
                        style={{
                          fontSize: fontPx,
                          color: '#FFFFFF',
                          fontWeight: '600',
                          textShadowColor: '#000000',
                          textShadowOffset: { width: 0, height: 0 },
                          textShadowRadius: 4,
                        }}
                      >
                        {g}
                      </Text>
                    ))}
                  </View>
                );
              })}
            </TouchableOpacity>
          )}

          <View style={styles.controls}>
            <Text style={[styles.hint, { color: colors.textMuted }]}>
              Type below, then tap the image to place it.
            </Text>

            <TextInput
              style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary }]}
              placeholder="Text or emoji..."
              placeholderTextColor={colors.textMuted}
              value={pending}
              onChangeText={setPending}
              autoCorrect={false}
            />

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ flexGrow: 0, flexShrink: 0 }}
              contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
              keyboardShouldPersistTaps="handled"
            >
              {QUICK_EMOJI.map(em => (
                <TouchableOpacity
                  key={em}
                  onPress={() => setPending(prev => prev + em)}
                  style={[styles.emojiBtn, { backgroundColor: colors.surface }]}
                >
                  <Text style={{ fontSize: 22 }}>{em}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.row}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Size</Text>
              {SIZES.map(s => {
                const active = sizeRatio === s.ratio;
                return (
                  <TouchableOpacity
                    key={s.label}
                    onPress={() => setSizeRatio(s.ratio)}
                    style={[styles.sizeBtn, { backgroundColor: active ? colors.blue : colors.surface }]}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '600', color: active ? '#fff' : colors.textSecondary }}>
                      {s.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.row}>
              <TouchableOpacity
                onPress={undo}
                disabled={!annotations.length}
                style={[styles.actionBtn, { backgroundColor: colors.surface, opacity: annotations.length ? 1 : 0.5 }]}
              >
                <Ionicons name="arrow-undo-outline" size={18} color={colors.textSecondary} />
                <Text style={{ fontSize: 13, color: colors.textSecondary }}>Undo</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={clearAll}
                disabled={!annotations.length}
                style={[styles.actionBtn, { backgroundColor: colors.surface, opacity: annotations.length ? 1 : 0.5 }]}
              >
                <Ionicons name="trash-outline" size={18} color={colors.textSecondary} />
                <Text style={{ fontSize: 13, color: colors.textSecondary }}>Clear</Text>
              </TouchableOpacity>
              <Text style={[styles.count, { color: colors.textMuted }]}>
                {annotations.length} added
              </Text>
            </View>

            <Text style={[styles.hint, { color: colors.textMuted, marginTop: 4 }]}>
              The original is never changed — saving creates a new copy.
            </Text>
          </View>
        </ScrollView>
      )}

    <FolderPickerModal
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        onSave={handleSave}
        defaultPath="/storage/emulated/0/Pictures"
        defaultLabel="Pictures"
        defaultSubLabel="Default save location"
        title="Save edited image"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingTop: 8, paddingBottom: 10, gap: 8 },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 16, fontWeight: '500' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  controls: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 28, gap: 10 },
  hint: { fontSize: 12 },
  input: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  emojiBtn: { width: 42, height: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { fontSize: 13, marginRight: 4 },
  sizeBtn: { width: 40, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  count: { fontSize: 12, marginLeft: 'auto' },
});
