import React, { useEffect, useState } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity, Image,
  ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '@/hooks/useTheme';
import { convertImage } from '@/modules/file-converter';
import { scanFile, openFile as openFileNative } from '@/modules/share-module';
import { shouldShowRatePrompt, markRatePromptShown } from '@/hooks/useRatePrompt';
import * as Haptics from 'expo-haptics';
import FolderPickerModal from '@/components/FolderPickerModal';
import { BackHandler } from 'react-native';

type OutFormat = 'JPG' | 'PNG' | 'WEBP';

const OUTPUT_FORMATS: { label: string; value: OutFormat; desc: string }[] = [
  { label: 'JPG', value: 'JPG', desc: 'Smaller size, best for photos' },
  { label: 'PNG', value: 'PNG', desc: 'Lossless, supports transparency' },
  { label: 'WEBP', value: 'WEBP', desc: 'Modern, small and high quality' },
];

export default function FileConverterScreen() {
  const { colors } = useTheme();
  const router = useRouter();

  const [sourceUri, setSourceUri] = useState<string | null>(null);
  const [sourceName, setSourceName] = useState<string>('');
  const [sourceExt, setSourceExt] = useState<string>('');
  const [converting, setConverting] = useState<OutFormat | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pendingFormat, setPendingFormat] = useState<OutFormat | null>(null);

  function toPath(uri: string): string {
    try { return decodeURIComponent(uri.replace('file://', '')); }
    catch { return uri.replace('file://', ''); }
  }

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (converting) return true; // block back during conversion
      if (sourceUri) {
        setSourceUri(null);
        setSourceName('');
        setSourceExt('');
        return true; // handled — don't exit screen
      }
      return false; // let system handle — exits screen
    });
    return () => sub.remove();
  }, [sourceUri, converting]);

  async function pickImage() {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 1,
        allowsEditing: false,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setSourceUri(asset.uri);
      setSourceName(asset.fileName ?? asset.uri.split('/').pop() ?? 'image');
      const ext = (asset.fileName ?? asset.uri.split('/').pop() ?? '').split('.').pop()?.toLowerCase() ?? '';
      setSourceExt(ext);
    } catch (e: any) {
      Alert.alert('Error', 'Could not pick image.');
    }
  }

  async function saveConverted(format: OutFormat, folderPath: string) {
    if (!sourceUri) return;
    setConverting(format);
    try {
  
      const baseName = sourceName.replace(/\.[^.]+$/, '').replace(/%20/g, ' ');
      const ext = format.toLowerCase();
      const stamp = Date.now();
      const outputPath = `${folderPath}/${baseName}_${stamp}.${ext}`;
  
      await convertImage(toPath(sourceUri), outputPath, format, 90);
      await scanFile(outputPath).catch(() => {});
  
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const folderName = folderPath.split('/').pop() ?? 'folder';
      Alert.alert(
        'Converted',
        `Saved to ${folderName}`,
        [
          { text: 'Open', onPress: async () => { try { await openFileNative(outputPath, `image/${ext === 'jpg' ? 'jpeg' : ext}`); } catch {} } },
          { text: 'Done', style: 'cancel' },
        ]
      );
  
      const show = await shouldShowRatePrompt();
      if (show) { await markRatePromptShown(); }
      setSourceUri(null);
      setSourceName('');
    } catch (e: any) {
      Alert.alert('Conversion failed', e?.message ?? 'Could not convert this image.');
    } finally {
        setConverting(null);
      }
  }

  async function handleConvert(format: OutFormat) {
    if (!sourceUri || converting) return;
    setPendingFormat(format);
    Alert.alert(
      'Save as',
      `Convert to ${format}`,
      [
        { text: 'Save to Pictures', onPress: () => saveConverted(format, '/storage/emulated/0/Pictures') },
        { text: 'Choose location', onPress: () => setPickerVisible(true) },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  }

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.background }]}>
        <TouchableOpacity onPress={() => { if (converting) return; if (sourceUri) { setSourceUri(null); setSourceName(''); setSourceExt(''); } else { router.back(); } }} style={styles.backBtn} disabled={converting !== null}>
          <Ionicons name="arrow-back" size={24} color={converting ? colors.textDisabled : colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>File Converter</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {!sourceUri ? (
          <View style={styles.centered}>
            <View style={[styles.startIcon, { backgroundColor: colors.favRedBg }]}>
              <Ionicons name="swap-horizontal-outline" size={40} color={colors.favRed} />
            </View>
            <Text style={[styles.startTitle, { color: colors.textPrimary }]}>Convert an image</Text>
            <Text style={[styles.startSub, { color: colors.textMuted }]}>
              Change HEIC, WEBP, PNG or JPG into another format. Works fully offline — your image never leaves your device.
            </Text>
            <TouchableOpacity style={[styles.pickBtn, { backgroundColor: colors.favRed }]} onPress={pickImage} activeOpacity={0.85}>
              <Ionicons name="image-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.pickBtnText}>Choose Image</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View>
            <View style={[styles.preview, { backgroundColor: colors.surface }]}>
              <Image source={{ uri: sourceUri }} style={styles.previewImage} resizeMode="contain" />
            </View>
            <Text style={[styles.sourceName, { color: colors.textPrimary }]} numberOfLines={1}>{sourceName}</Text>
            <TouchableOpacity onPress={pickImage} disabled={converting !== null} style={{ alignSelf: 'center', marginBottom: 24 }}>
              <Text style={{ color: colors.favRed, fontSize: 13, fontWeight: '500' }}>Choose a different image</Text>
            </TouchableOpacity>

            <Text style={[styles.convertLabel, { color: colors.textMuted }]}>Convert to</Text>
            {OUTPUT_FORMATS.filter(fmt => {
              const src = sourceExt;
              if (fmt.value === 'JPG' && (src === 'jpg' || src === 'jpeg')) return false;
              if (fmt.value === 'PNG' && src === 'png') return false;
              if (fmt.value === 'WEBP' && src === 'webp') return false;
              return true;
            }).map(fmt => (
              <TouchableOpacity
                key={fmt.value}
                style={[styles.formatRow, { backgroundColor: colors.surface }]}
                onPress={() => handleConvert(fmt.value)}
                disabled={converting !== null}
                activeOpacity={0.7}
              >
                <View style={[styles.formatBadge, { backgroundColor: colors.favRedBg }]}>
                  <Text style={[styles.formatBadgeText, { color: colors.favRed }]}>{fmt.label}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.formatTitle, { color: colors.textPrimary }]}>Convert to {fmt.label}</Text>
                  <Text style={[styles.formatDesc, { color: colors.textMuted }]}>{fmt.desc}</Text>
                </View>
                {converting === fmt.value
                  ? <ActivityIndicator size="small" color={colors.favRed} />
                  : <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                }
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
      <FolderPickerModal
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        onSave={(folderPath) => {
          setPickerVisible(false);
          if (pendingFormat) saveConverted(pendingFormat, folderPath);
        }}
        defaultPath="/storage/emulated/0/Pictures"
        defaultLabel="Pictures"
        defaultSubLabel="Default save location"
        title="Save converted image"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  title: { flex: 1, fontSize: 20, fontWeight: '500', textAlign: 'center', letterSpacing: -0.5 },
  scrollContent: { flexGrow: 1, paddingHorizontal: 16, paddingBottom: 32 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 40 },
  startIcon: { width: 88, height: 88, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  startTitle: { fontSize: 22, fontWeight: '600', letterSpacing: -0.5 },
  startSub: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  pickBtn: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32, marginTop: 8 },
  pickBtnText: { fontSize: 15, fontWeight: '600', color: '#fff' },
  preview: { borderRadius: 16, height: 240, alignItems: 'center', justifyContent: 'center', marginTop: 8, marginBottom: 12, overflow: 'hidden' },
  previewImage: { width: '100%', height: '100%' },
  sourceName: { fontSize: 14, fontWeight: '500', textAlign: 'center', marginBottom: 4 },
  convertLabel: { fontSize: 11, fontWeight: '500', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 12 },
  formatRow: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 12, padding: 14, marginBottom: 12 },
  formatBadge: { width: 48, height: 48, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  formatBadgeText: { fontSize: 13, fontWeight: '700' },
  formatTitle: { fontSize: 14, fontWeight: '600', marginBottom: 2 },
  formatDesc: { fontSize: 11 },
});
