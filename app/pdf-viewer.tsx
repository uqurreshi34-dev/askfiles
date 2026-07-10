import React, { useEffect, useState, useCallback, useRef, useMemo} from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator,
  Alert, BackHandler, Modal, FlatList, Image,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { PdfView, resolveContentUri, renderThumbnail } from '@/modules/pdf-viewer';
import { useLocalSearchParams } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as ScreenOrientation from 'expo-screen-orientation';

const CARD_HEIGHT = 180;

// ── PageCard ─────────────────────────────────────────────────────────────────
// Renders one page card in the grid modal. Calls renderThumbnail lazily on
// mount, shows ActivityIndicator until ready. Respects app color theme.

function PageCard({
  filePath,
  pageIndex,
  currentPage,
  onPress,
  colors,
}: {
  filePath: string;
  pageIndex: number;
  currentPage: number;
  onPress: (page: number) => void;
  colors: any;
}) {
  const [base64, setBase64] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    setBase64(null);
    setLoading(true);
    renderThumbnail(filePath, pageIndex)
      .then((result: string | null) => {
        if (mounted.current) {
          console.log(`THUMB page=${pageIndex} result=${result ? 'base64 len=' + result.length : 'NULL'}`);
          setBase64(result);
          setLoading(false);
        }
      })
      .catch(() => {
        if (mounted.current) setLoading(false);
      });
    return () => { mounted.current = false; };
  }, [filePath, pageIndex]);

  const isActive = pageIndex === currentPage;

  return (
    <TouchableOpacity
      onPress={() => onPress(pageIndex)}
      activeOpacity={0.75}
      style={{
        flex: 1,
        margin: 6,
        borderRadius: 10,
        backgroundColor: colors.card,
        borderWidth: isActive ? 2 : 1,
        borderColor: isActive ? colors.favRed : colors.divider,
        overflow: 'hidden',
        height: CARD_HEIGHT,
      }}
    >
      {/* Page image */}
      <View style={{
        height: CARD_HEIGHT - 32,
        backgroundColor: '#fff',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        {loading ? (
          <ActivityIndicator size="small" color={colors.textMuted} />
        ) : base64 ? (
          <Image
            source={{ uri: `data:image/jpeg;base64,${base64}` }}
            style={{ width: '100%', height: '100%' }}
            resizeMode="contain"
          />
        ) : (
          // Fallback if render failed
          <View style={{ alignItems: 'center', justifyContent: 'center', flex: 1 }}>
            <Ionicons name="document-outline" size={28} color={colors.textMuted} />
          </View>
        )}
      </View>

      {/* Page number footer */}
      <View style={{
        height: 32,
        alignItems: 'center',
        justifyContent: 'center',
        borderTopWidth: 1,
        borderTopColor: colors.divider,
        backgroundColor: isActive ? colors.favRedBg : colors.card,
      }}>
        <Text style={{
          fontSize: 12,
          fontWeight: isActive ? '700' : '500',
          color: isActive ? colors.favRed : colors.textMuted,
        }}>
          {pageIndex + 1}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ── PdfViewerScreen ───────────────────────────────────────────────────────────

export default function PdfViewerScreen() {
  const { colors } = useTheme();
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [fileUri, setFileUri] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [targetPage, setTargetPage] = useState(0);
  const [gridVisible, setGridVisible] = useState(false);
  const [jumping, setJumping] = useState(false);

  const { incomingUri } = useLocalSearchParams<{ incomingUri?: string }>();

  function resetState() {
    setFileUri(null);
    setFileName('');
    setCurrentPage(0);
    setPageCount(0);
    setTargetPage(0);
    setGridVisible(false);
  }

  // Lock grid modal to portrait so cards are always a readable size
  useEffect(() => {
    if (gridVisible) {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    } else {
      ScreenOrientation.unlockAsync();
    }
  }, [gridVisible]);

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
        setTargetPage(0);
      } else {
        Alert.alert('Error', 'Could not open PDF.');
      }
    }).catch(() => {
      Alert.alert('Error', 'Could not open PDF.');
    }).finally(() => setLoading(false));
  }, [incomingUri]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (gridVisible) { setGridVisible(false); return true; }
      if (fileUri) { resetState(); return true; }
      if (router.canGoBack()) { router.back(); return true; }
      router.replace('/(tabs)');
      return true;
    });
    return () => sub.remove();
  }, [gridVisible, fileUri]);

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
      setTargetPage(0);
    } catch {
      Alert.alert('Error', 'Could not open PDF.');
    }
  }

  // Tapping a card: set target (triggers native goToPage via prop),
  // close modal, unlock orientation.
  const handleCardPress = useCallback((page: number) => {
    const distance = Math.abs(page - currentPage);
    setGridVisible(false);
    if (distance > 20) {
      setJumping(true);
      setTimeout(() => {
        setTargetPage(page);
        setTimeout(() => setJumping(false), 2000);
      }, 50);
    } else {
      setTimeout(() => setTargetPage(page), 50);
    }
  }, [currentPage]);

  // Build page index array once for FlatList — avoids re-creating on every render
  const pageIndices = useMemo(
    () => Array.from({ length: pageCount }, (_, i) => i),
    [pageCount]
  );

  const renderCard = useCallback(({ item }: { item: number }) => (
    <PageCard
      filePath={fileUri!}
      pageIndex={item}
      currentPage={currentPage}
      onPress={handleCardPress}
      colors={colors}
    />
  ), [fileUri, currentPage, colors, handleCardPress]);

  const keyExtractor = useCallback((item: number) => String(item), []);

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={{
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12,
        backgroundColor: colors.background,
      }}>
        <TouchableOpacity
          onPress={() => {
            if (fileUri) resetState();
            else if (router.canGoBack()) router.back();
            else router.replace('/(tabs)');
          }}
          style={{ width: 40, height: 40, justifyContent: 'center' }}
        >
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>

        <Text
          style={{ flex: 1, fontSize: 18, fontWeight: '500', textAlign: 'center', letterSpacing: -0.5, color: colors.textPrimary }}
          numberOfLines={1}
        >
          {fileName || 'PDF Viewer'}
        </Text>

        {/* Three-dot menu — only shown when a PDF is open */}
        {fileUri && pageCount > 0 ? (
          <TouchableOpacity
            onPress={() => setGridVisible(true)}
            style={{ width: 40, height: 40, justifyContent: 'center', alignItems: 'flex-end' }}
            activeOpacity={0.7}
          >
            <Ionicons name="ellipsis-vertical" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={colors.blue} />
        </View>
      ) : fileUri ? (
        <View style={{ flex: 1 }}>
          {jumping && (
            <View style={{
              position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
              justifyContent: 'center', alignItems: 'center',
              backgroundColor: 'rgba(0,0,0,0.35)', zIndex: 10,
            }}>
              <View style={{
                backgroundColor: colors.surface, borderRadius: 16,
                paddingHorizontal: 28, paddingVertical: 20,
                alignItems: 'center', gap: 12,
              }}>
                <ActivityIndicator size="large" color={colors.favRed} />
                <Text style={{ fontSize: 14, color: colors.textPrimary, fontWeight: '500' }}>
                  Jumping to page {targetPage + 1}...
                </Text>
              </View>
            </View>
          )}

          {/* PDF view — targetPage drives goToPage, onPageChange only updates counter */}
          <PdfView
            uri={`file://${fileUri}`}
            page={targetPage}
            onPageCount={(e: any) => { setPageCount(e.nativeEvent.count); }}
            onPageChange={(e: any) => {
              console.log('onPageChange fired page=', e.nativeEvent.page);
              setCurrentPage(e.nativeEvent.page);
            }}
            style={{ flex: 1, backgroundColor: colors.surface }}
          />

          {/* Page counter */}
          {pageCount > 0 && (
            <View style={{
              alignItems: 'center', justifyContent: 'center',
              paddingVertical: 10, backgroundColor: colors.background,
              borderTopWidth: 1, borderTopColor: colors.divider,
            }}>
              <Text style={{ fontSize: 13, color: colors.textMuted, fontWeight: '500' }}>
                {currentPage + 1} / {pageCount}
              </Text>
            </View>
          )}

          {/* Page grid modal */}
          <Modal
            visible={gridVisible}
            animationType="slide"
            onRequestClose={() => setGridVisible(false)}
          >
            <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
              {/* Modal header */}
              <View style={{
                flexDirection: 'row', alignItems: 'center',
                paddingHorizontal: 16, paddingVertical: 12,
                borderBottomWidth: 1, borderBottomColor: colors.divider,
              }}>
                <TouchableOpacity
                  onPress={() => setGridVisible(false)}
                  style={{ width: 40, height: 40, justifyContent: 'center' }}
                >
                  <Ionicons name="close" size={24} color={colors.textPrimary} />
                </TouchableOpacity>
                <Text style={{ flex: 1, fontSize: 17, fontWeight: '600', textAlign: 'center', color: colors.textPrimary }}>
                  Pages
                </Text>
                <Text style={{ width: 40, fontSize: 13, color: colors.textMuted, textAlign: 'right' }}>
                  {pageCount}
                </Text>
              </View>

              {/* Card grid — 3 columns, lazy renders as you scroll */}
              <FlatList
                data={pageIndices}
                renderItem={renderCard}
                keyExtractor={keyExtractor}
                numColumns={3}
                contentContainerStyle={{ padding: 6 }}
                windowSize={5}
                maxToRenderPerBatch={9}
                updateCellsBatchingPeriod={50}
                removeClippedSubviews
              />
            </SafeAreaView>
          </Modal>
        </View>
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 24 }}>
          <View style={{
            width: 88, height: 88, borderRadius: 24,
            alignItems: 'center', justifyContent: 'center',
            marginBottom: 8, backgroundColor: colors.favRedBg,
          }}>
            <Text style={{ fontSize: 28, fontWeight: '900', color: colors.favRed, letterSpacing: 1 }}>PDF</Text>
          </View>
          <Text style={{ fontSize: 22, fontWeight: '600', letterSpacing: -0.5, color: colors.textPrimary }}>
            Open a PDF file
          </Text>
          <Text style={{ fontSize: 14, textAlign: 'center', lineHeight: 20, color: colors.textMuted }}>
            View any PDF document. Works fully offline — your files never leave your device.
          </Text>
          <TouchableOpacity
            style={{
              flexDirection: 'row', alignItems: 'center', borderRadius: 14,
              paddingVertical: 14, paddingHorizontal: 32, marginTop: 8,
              backgroundColor: colors.favRed,
            }}
            onPress={pickFile} activeOpacity={0.85} disabled={loading}
          >
            {loading
              ? <ActivityIndicator size="small" color="#fff" />
              : <>
                  <Ionicons name="document-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
                  <Text style={{ fontSize: 15, fontWeight: '600', color: '#fff' }}>Choose PDF File</Text>
                </>
            }
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}
