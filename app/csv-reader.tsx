
import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  Text, View, TouchableOpacity,
  ActivityIndicator, Alert, ScrollView, TextInput,
  FlatList, useWindowDimensions, BackHandler,
} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useTheme } from '@/hooks/useTheme';
import { parseCsv, filterCsv, evictCache, analyzeColumn, resolveContentUri, CsvData } from '@/modules/csv-reader';
import FileDetailsModal from '@/components/FileDetailsModal';
import FolderPickerModal from '@/components/FolderPickerModal';
import * as Haptics from 'expo-haptics';
import RNFS from 'react-native-fs';
import { toPath } from '@/utils/files';
import { useLocalSearchParams } from 'expo-router';

 
const MIN_COL_WIDTH = 90;
const MAX_COL_WIDTH = 220;
const ROW_HEIGHT = 40;
const HEADER_HEIGHT = 36;
 
type SortDir = 'asc' | 'desc' | null;
 
export default function CsvReaderScreen() {
  const { colors, dark } = useTheme();
  const router = useRouter();
  const { width: SCREEN_WIDTH } = useWindowDimensions();
 
  const [loading, setLoading] = useState(false);
  const [csvData, setCsvData] = useState<CsvData | null>(null);
  const [fileName, setFileName] = useState('');
 
  const [search, setSearch] = useState('');
  const [searchCol, setSearchCol] = useState<number | null>(null);
  const [sortCol, setSortCol] = useState<number | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
 
  const [selectionVersion, setSelectionVersion] = useState(0);
  const selectedRowsRef = useRef<Set<number>>(new Set());
 
  const [exportPickerVisible, setExportPickerVisible] = useState(false);
  const [colWidths, setColWidths] = useState<number[]>([]);
  const [filePath, setFilePath] = useState('');
  const [processedRows, setProcessedRows] = useState<{ row: string[]; originalIndex: number }[]>([]);
  const filterDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [analysisVisible, setAnalysisVisible] = useState(false);
  const [analysisData, setAnalysisData] = useState<{ label: string; value: string }[]>([]);
  const [analysisColName, setAnalysisColName] = useState('');

  const { incomingUri } = useLocalSearchParams<{ incomingUri?: string }>();

useEffect(() => {
  if (!incomingUri) return;
  const uri = decodeURIComponent(incomingUri);
  const name = uri.split('/').pop()?.split('%2F').pop() ?? 'file.csv';
  resolveContentUri(uri).then(path => {
    if (path) loadCsv(path, name);
  }).catch(() => {});
}, [incomingUri]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (csvData) { resetState(); return true; }
      return false;
    });
    return () => sub.remove();
  }, [csvData]);
 
  function resetState() {
    if (filePath) evictCache(filePath).catch(() => {});
    setCsvData(null);
    setFileName('');
    setFilePath('');
    setSearch('');
    setSearchCol(null);
    setSortCol(null);
    setSortDir(null);
    selectedRowsRef.current = new Set();
    setSelectionVersion(0);
    setColWidths([]);
    setProcessedRows([]);
  }
 
  function computeColWidths(headers: string[], rows: string[][]): number[] {
    return headers.map((h, i) => {
      const maxDataLen = rows.slice(0, 50).reduce((max, row) =>
        Math.max(max, (row[i] ?? '').length), 0);
      const w = Math.max(h.length, maxDataLen) * 8 + 24;
      return Math.min(MAX_COL_WIDTH, Math.max(MIN_COL_WIDTH, w));
    });
  }
 
  async function pickFile() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const name = asset.name ?? asset.uri.split('/').pop() ?? 'file.csv';
      const path = asset.uri.replace('file://', '');
      await loadCsv(path, name);
    } catch {
      Alert.alert('Error', 'Could not open file.');
    }
  }
 
  async function loadCsv(path: string, name: string) {
    setLoading(true);
    try {
      const data = await parseCsv(path);
      if (data.headers.length === 0) { Alert.alert('Empty file', 'This CSV has no data.'); return; }
      setColWidths(computeColWidths(data.headers, data.rows));
      setCsvData(data);
      setFileName(name);
      setFilePath(path);
      setProcessedRows(data.rows.map((row, i) => ({ row, originalIndex: i })));
    } catch (e: any) {
      Alert.alert('Parse failed', e?.message ?? 'Could not read this CSV.');
    } finally {
      setLoading(false);
    }
  }
 
  // Native filter with 150ms debounce
  useEffect(() => {
    if (!csvData || !filePath) return;
    selectedRowsRef.current = new Set();
    setSelectionVersion(v => v + 1);
    if (filterDebounce.current) clearTimeout(filterDebounce.current);
    filterDebounce.current = setTimeout(async () => {
      try {
        const result = await filterCsv(filePath, search, searchCol ?? -1, sortCol ?? -1, sortDir ?? 'none');
        setProcessedRows(result.rows.map((row, i) => ({ row, originalIndex: i })));
      } catch {} finally {
      }
    }, 150);
    return () => { if (filterDebounce.current) clearTimeout(filterDebounce.current); };
  }, [csvData, filePath, search, searchCol, sortCol, sortDir]);
 
  function handleHeaderPress(i: number) {
    if (sortCol === i) {
      if (sortDir === 'asc') setSortDir('desc');
      else { setSortCol(null); setSortDir(null); }
    } else { setSortCol(i); setSortDir('asc'); }
  }

  async function handleHeaderLongPress(colIndex: number) {
    if (!csvData || !filePath) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const indices = selectedRowsRef.current.size > 0
      ? [...selectedRowsRef.current]
      : [];
    const result = await analyzeColumn(filePath, colIndex, indices);
    if (!result.isNumeric) {
      Alert.alert('Not numeric', `"${csvData.headers[colIndex]}" doesn't contain numeric data.`);
      return;
    }
    const scope = indices.length > 0 ? `${indices.length} selected rows` : `${processedRows.length} visible rows`;
    setAnalysisColName(`${csvData.headers[colIndex]} — ${scope}`);
    setAnalysisData([
      { label: 'Count', value: String(result.count) },
      { label: 'Sum', value: result.sum! },
      { label: 'Average', value: result.avg! },
      { label: 'Min', value: result.min! },
      { label: 'Max', value: result.max! },
      { label: 'Std Deviation', value: result.stdDev! },
    ]);
    setAnalysisVisible(true);
  }
 
  function toggleRow(originalIndex: number) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next = new Set(selectedRowsRef.current);
    if (next.has(originalIndex)) next.delete(originalIndex); else next.add(originalIndex);
    selectedRowsRef.current = next;
    setSelectionVersion(v => v + 1);
  }
 
  function copySelectedRows() {
    if (!csvData) return;
    const rows = [...selectedRowsRef.current].map(i => csvData.rows[i]?.join(csvData.delimiter) ?? '');
    Clipboard.setString(rows.join('\n'));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert('Copied', `${rows.length} row${rows.length !== 1 ? 's' : ''} copied.`);
  }
 
  function copyCell(value: string) {
    Clipboard.setString(value);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert('Copied', `"${value.length > 40 ? value.slice(0, 40) + '…' : value}" copied.`);
  }
 
  async function exportCsv(folderPath: string) {
    if (!csvData) return;
    try {
        const rowsToExport = selectedRowsRef.current.size > 0
        ? [...selectedRowsRef.current].sort((a, b) => a - b).map(i => csvData.rows[i]?.join(csvData.delimiter) ?? '')
        : (search.trim() || sortCol !== null)
          ? processedRows.map(({ row }) => row.join(csvData.delimiter))
          : csvData.rows.map(r => r.join(csvData.delimiter));
      const content = [csvData.headers.join(csvData.delimiter), ...rowsToExport].join('\n');
      const decodedFolder = toPath(folderPath);
      const outputPath = `${decodedFolder}/${fileName.replace(/\.[^.]+$/, '')}_export_${Date.now()}.csv`;
      if (!(await RNFS.exists(decodedFolder))) await RNFS.mkdir(decodedFolder);
      await RNFS.writeFile(outputPath, content, 'utf8');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Exported', `Saved to ${folderPath.replace('/storage/emulated/0/', '').replace(/\/$/, '') || 'Internal Storage'}`);
    } catch (e: any) {
      Alert.alert('Export failed', e?.message ?? 'Could not export.');
    }
  }
 
  const totalWidth = Math.max(colWidths.reduce((a, b) => a + b, 0), SCREEN_WIDTH);
  const selectedCount = selectedRowsRef.current.size;
 
  const renderRow = useCallback(({ item, index }: { item: { row: string[]; originalIndex: number }; index: number }) => {
    const { row, originalIndex } = item;
    const isSelected = selectedRowsRef.current.has(originalIndex);
    const rowBg = isSelected
      ? (dark ? '#0D2A47' : '#E6F1FB')
      : index % 2 === 0 ? colors.background : colors.surface;
    return (
      <TouchableOpacity
        onPress={() => toggleRow(originalIndex)}
        activeOpacity={0.7}
        style={{ flexDirection: 'row', height: ROW_HEIGHT, backgroundColor: rowBg }}
      >
        {colWidths.map((w, ci) => (
          <View key={ci} style={{ width: w, height: ROW_HEIGHT, justifyContent: 'center', paddingHorizontal: 12, borderRightWidth: 1, borderRightColor: colors.divider }}>
            <Text style={{ fontSize: 13, color: colors.textPrimary }} numberOfLines={1}>{row[ci] ?? ''}</Text>
          </View>
        ))}
      </TouchableOpacity>
    );
  }, [colWidths, selectionVersion, colors, dark]);
 
  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, backgroundColor: colors.background }}>
        <TouchableOpacity onPress={() => { if (csvData) resetState(); else router.back(); }} style={{ width: 40, height: 40, justifyContent: 'center' }}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={{ flex: 1, fontSize: 20, fontWeight: '500', textAlign: 'center', letterSpacing: -0.5, color: colors.textPrimary }} numberOfLines={1}>
          {csvData ? fileName : 'CSV Reader'}
        </Text>
        {csvData ? (
          <TouchableOpacity style={{ width: 40, height: 40, justifyContent: 'center', alignItems: 'flex-end' }} onPress={() => setExportPickerVisible(true)}>
            <Ionicons name="download-outline" size={22} color={colors.blue} />
          </TouchableOpacity>
        ) : <View style={{ width: 40 }} />}
      </View>
 
      {!csvData ? (
        <ScrollView contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 16, paddingBottom: 32 }}>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 40 }}>
            <View style={{ width: 88, height: 88, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 8, backgroundColor: dark ? '#2A2200' : '#FFF8E1' }}>
              <Text style={{ fontSize: 28, fontWeight: '900', color: colors.yellow, letterSpacing: 1 }}>CSV</Text>
            </View>
            <Text style={{ fontSize: 22, fontWeight: '600', letterSpacing: -0.5, color: colors.textPrimary }}>Open a CSV file</Text>
            <Text style={{ fontSize: 14, textAlign: 'center', lineHeight: 20, color: colors.textMuted }}>
              View, search, sort and filter any CSV file. Works fully offline — your data never leaves your device.
            </Text>
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32, marginTop: 8, backgroundColor: colors.yellow }}
              onPress={pickFile} activeOpacity={0.85} disabled={loading}
            >
              {loading
                ? <ActivityIndicator size="small" color="#fff" />
                : <><Ionicons name="document-outline" size={18} color="#fff" style={{ marginRight: 8 }} /><Text style={{ fontSize: 15, fontWeight: '600', color: '#fff' }}>Choose CSV File</Text></>
              }
            </TouchableOpacity>
          </View>
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>
          {/* Search bar */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 4, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, backgroundColor: colors.surface, borderColor: colors.border }}>
            <Ionicons name="search-outline" size={16} color={colors.textMuted} style={{ marginRight: 6 }} />
            <TextInput
              style={{ flex: 1, fontSize: 14, paddingVertical: 0, color: colors.textPrimary }}
              placeholder={searchCol !== null ? `Search in "${csvData.headers[searchCol]}"…` : 'Search all columns…'}
              placeholderTextColor={colors.textMuted}
              value={search}
              onChangeText={setSearch}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Ionicons name="close-circle" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>
 
          {/* Column filter pills */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0 }} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 4, gap: 6, flexDirection: 'row', alignItems: 'center' }}>
            <TouchableOpacity
              style={{ paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20, borderWidth: 1, backgroundColor: searchCol === null ? colors.blue : colors.surface, borderColor: colors.border }}
              onPress={() => setSearchCol(null)}
            >
              <Text style={{ fontSize: 12, fontWeight: '500', color: searchCol === null ? '#fff' : colors.textMuted }}>All</Text>
            </TouchableOpacity>
            {csvData.headers.map((h, i) => (
              <TouchableOpacity
                key={i}
                style={{ paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20, borderWidth: 1, backgroundColor: searchCol === i ? colors.blue : colors.surface, borderColor: colors.border }}
                onPress={() => setSearchCol(searchCol === i ? null : i)}
              >
                <Text style={{ fontSize: 12, fontWeight: '500', color: searchCol === i ? '#fff' : colors.textMuted }} numberOfLines={1}>{h}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
 
          {/* Stats + selection bar */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: colors.divider }}>
            <Text style={{ fontSize: 11, fontWeight: '500', color: colors.textMuted }}>
              {processedRows.length} rows{search ? ' (filtered)' : ''} · {csvData.headers.length} cols
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              {selectedCount > 0 ? (
                <>
                  <Text style={{ fontSize: 11, fontWeight: '500', color: colors.blue }}>{selectedCount} selected</Text>
                  <TouchableOpacity onPress={copySelectedRows} style={{ marginLeft: 12 }}>
                    <Ionicons name="copy-outline" size={18} color={colors.blue} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { selectedRowsRef.current = new Set(); setSelectionVersion(v => v + 1); }} style={{ marginLeft: 10 }}>
                    <Ionicons name="close-outline" size={18} color={colors.textMuted} />
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    selectedRowsRef.current = new Set(processedRows.map(r => r.originalIndex));
                    setSelectionVersion(v => v + 1);
                  }}
                >
                  <Text style={{ fontSize: 11, fontWeight: '500', color: colors.blue }}>Select all</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
 
          {/* Table — single horizontal ScrollView wrapping frozen header + FlatList */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ width: totalWidth, flexDirection: 'column' }}>
            {/* Frozen header */}
            <View style={{ flexDirection: 'row', height: HEADER_HEIGHT, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.divider }}>
              {csvData.headers.map((h, i) => (
                <TouchableOpacity
                  key={i}
                  style={{ width: colWidths[i], height: HEADER_HEIGHT, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, borderRightWidth: 1, borderRightColor: colors.divider }}
                  onPress={() => handleHeaderPress(i)}
                  onLongPress={() => handleHeaderLongPress(i)}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textPrimary, letterSpacing: 0.2 }} numberOfLines={1}>{h}</Text>
                  {sortCol === i && (
                    <Ionicons name={sortDir === 'asc' ? 'chevron-up' : 'chevron-down'} size={12} color={colors.blue} style={{ marginLeft: 4 }} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
 
            {/* Data rows */}
            <FlatList
              data={processedRows}
              keyExtractor={(item) => String(item.originalIndex)}
              renderItem={renderRow}
              extraData={selectionVersion}
              getItemLayout={(_, index) => ({ length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index })}
              initialNumToRender={30}
              maxToRenderPerBatch={30}
              windowSize={15}
              removeClippedSubviews={true}
              showsVerticalScrollIndicator={true}
              ListEmptyComponent={
                <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                  <Text style={{ fontSize: 14, color: colors.textMuted }}>No results found</Text>
                </View>
              }
            />
          </ScrollView>
        </View>
      )}
       <FileDetailsModal
        visible={analysisVisible}
        name={analysisColName}
        data={analysisData}
        onClose={() => setAnalysisVisible(false)}
        title="Column Info"
      />
      <FolderPickerModal
        visible={exportPickerVisible}
        onClose={() => setExportPickerVisible(false)}
        onSave={(folderPath) => { setExportPickerVisible(false); exportCsv(folderPath); }}
        defaultPath="/storage/emulated/0/Download"
        defaultLabel="Download"
        defaultSubLabel="Default save location"
        title="Export CSV"
      />
    </SafeAreaView>
  );
}
