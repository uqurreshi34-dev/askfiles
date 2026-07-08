import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator,
  Alert, BackHandler,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { PdfView, resolveContentUri } from '@/modules/pdf-viewer';
import { useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as DocumentPicker from 'expo-document-picker';

export default function PdfViewerScreen() {
  const { colors } = useTheme();
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [fileUri, setFileUri] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);

  const { incomingUri } = useLocalSearchParams<{ incomingUri?: string }>();

  function resetState() {
    setFileUri(null);
    setFileName('');
    setCurrentPage(0);
    setPageCount(0);
  }

  useEffect(() => {
    if (!incomingUri) return;
    const uri = decodeURIComponent(incomingUri);
    setLoading(true);
    resolveContentUri(uri).then(result => {
      if (result) {
        setFileUri(result.path);
        setFileName(result.name);
        setCurrentPage(0);
        setPageCount(0);
      } else {
        Alert.alert('Error', 'Could not open PDF.');
      }
    }).catch(() => {
      Alert.alert('Error', 'Could not open PDF.');
    }).finally(() => setLoading(false));
  }, [incomingUri]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (fileUri) { resetState(); return true; }
        if (router.canGoBack()) { router.back(); return true; }
        router.replace('/(tabs)');
        return true;
      });
    return () => sub.remove();
  }, []);

  function goToPrev() {
    if (currentPage <= 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCurrentPage(p => p - 1);
  }

  function goToNext() {
    if (currentPage >= pageCount - 1) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCurrentPage(p => p + 1);
  }

  async function pickFile() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const name = asset.name ?? asset.uri.split('/').pop() ?? 'document.pdf';
      const path = asset.uri.replace('file://', '');
      setFileUri(path);
      setFileName(name);
      setCurrentPage(0);
      setPageCount(0);
    } catch {
      Alert.alert('Error', 'Could not open PDF.');
    }
  }

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, backgroundColor: colors.background }}>
      <TouchableOpacity onPress={() => { if (fileUri) resetState(); else if (router.canGoBack()) router.back(); else router.replace('/(tabs)'); }} style={{ width: 40, height: 40, justifyContent: 'center' }}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={{ flex: 1, fontSize: 18, fontWeight: '500', textAlign: 'center', letterSpacing: -0.5, color: colors.textPrimary }} numberOfLines={1}>
          {fileName || 'PDF Viewer'}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={colors.blue} />
        </View>
      ) : fileUri ? (
        <View style={{ flex: 1 }}>
          {/* PDF view */}
          <PdfView
            uri={`file://${fileUri}`}
            page={currentPage}
            onPageCount={(e: any) => setPageCount(e.nativeEvent.count)}
            style={{ flex: 1, backgroundColor: colors.surface }}
          />

          {/* Page navigation */}
          {pageCount > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, gap: 24, backgroundColor: colors.background, borderTopWidth: 1, borderTopColor: colors.divider }}>
              <TouchableOpacity onPress={goToPrev} disabled={currentPage === 0}
                style={{ width: 40, height: 40, justifyContent: 'center', alignItems: 'center' }}>
                <Ionicons name="chevron-back" size={24} color={currentPage === 0 ? colors.textMuted : colors.blue} />
              </TouchableOpacity>
              <Text style={{ fontSize: 14, color: colors.textPrimary, fontWeight: '500' }}>
                {currentPage + 1} / {pageCount}
              </Text>
              <TouchableOpacity onPress={goToNext} disabled={currentPage === pageCount - 1}
                style={{ width: 40, height: 40, justifyContent: 'center', alignItems: 'center' }}>
                <Ionicons name="chevron-forward" size={24} color={currentPage === pageCount - 1 ? colors.textMuted : colors.blue} />
              </TouchableOpacity>
            </View>
          )}
        </View>
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 24 }}>
          <View style={{ width: 88, height: 88, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 8, backgroundColor: colors.favRedBg }}>
            <Text style={{ fontSize: 28, fontWeight: '900', color: colors.favRed, letterSpacing: 1 }}>PDF</Text>
          </View>
          <Text style={{ fontSize: 22, fontWeight: '600', letterSpacing: -0.5, color: colors.textPrimary }}>Open a PDF file</Text>
          <Text style={{ fontSize: 14, textAlign: 'center', lineHeight: 20, color: colors.textMuted }}>
            View any PDF document. Works fully offline — your files never leave your device.
          </Text>
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32, marginTop: 8, backgroundColor: colors.favRed }}
            onPress={pickFile} activeOpacity={0.85} disabled={loading}
          >
            {loading
              ? <ActivityIndicator size="small" color="#fff" />
              : <><Ionicons name="document-outline" size={18} color="#fff" style={{ marginRight: 8 }} /><Text style={{ fontSize: 15, fontWeight: '600', color: '#fff' }}>Choose PDF File</Text></>
            }
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}
