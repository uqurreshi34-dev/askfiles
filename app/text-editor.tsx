import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator,
  Alert, BackHandler, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { readTextFile, writeTextFile, resolveContentUri, writeContentUri } from '@/modules/text-editor';
import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';
import FolderPickerModal from '@/components/FolderPickerModal';
import { getFriendlyPath } from '@/utils/files';
import { getStorageVolumes } from '@/modules/storage-stats';
import { TextEditorView } from 'text-editor';
import { useLanguage } from '@/modules/appLanguage';
import { readersText } from '@/modules/i18n/readersText';

export default function TextEditorScreen() {
  const { colors } = useTheme();
  const lang = useLanguage();
  const t = readersText(lang);
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [content, setContent] = useState('');
  const [fileName, setFileName] = useState('');
  const [filePath, setFilePath] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [saveAsVisible, setSaveAsVisible] = useState(false);
  const [contentUri, setContentUri] = useState('');

  const { incomingUri } = useLocalSearchParams<{ incomingUri?: string }>();

  useEffect(() => {
    if (!incomingUri) return;
    const uri = decodeURIComponent(incomingUri);
    setContentUri(uri);
    setLoading(true);
    resolveContentUri(uri).then(result => {
      if (result) loadFile(result.path, result.name);
      else Alert.alert(t.error, t.couldNotOpenFile);
    }).catch(() => {
      Alert.alert(t.error, t.couldNotOpenFile);
    }).finally(() => setLoading(false));
  }, [incomingUri]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (filePath) { handleBack(); return true; }
      if (router.canGoBack()) { router.back(); return true; }
      router.replace('/(tabs)');
      return true;
    });
    return () => sub.remove();
  }, [filePath, isDirty]);

  function resetState() {
    setContent('');
    setFileName('');
    setFilePath('');
    setIsDirty(false);
    setContentUri('');
  }

  function handleBack() {
    if (isDirty) {
      Alert.alert(t.unsaved, t.unsavedMsg, [
        { text: t.cancel, style: 'cancel' },
        { text: t.discard, style: 'destructive', onPress: resetState },
      ]);
    } else {
      resetState();
    }
  }

  async function loadFile(path: string, name: string) {
    setLoading(true);
    try {
      const text = await readTextFile(path);
      setContent(text);
      setFileName(name);
      setFilePath(path);
      setIsDirty(false);
    } catch (e: any) {
        if (e?.message?.includes('FILE_TOO_LARGE')) {
          Alert.alert(t.tooLarge, t.tooLargeMsg);
        } else {
          Alert.alert(t.error, t.couldNotReadFile);
        }
      }finally {
      setLoading(false);
    }
  }

  async function pickFile() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'text/plain',
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const name = asset.name ?? asset.uri.split('/').pop() ?? 'file.txt';
      const path = asset.uri.replace('file://', '');
      await loadFile(path, name);
    } catch {
      Alert.alert(t.error, t.couldNotOpenFile);
    }
  }

  async function saveFile() {
    if (!filePath) return;
    setSaving(true);
    try {
      await writeTextFile(filePath, content);
      if (contentUri) {
        await writeContentUri(contentUri, content);
      }
      setIsDirty(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert(t.error, t.couldNotSave);
    } finally {
      setSaving(false);
    }
  }

  async function saveAsFile(folderPath: string) {
    setSaving(true);
    try {
      const destPath = `${folderPath}/${fileName}`;
      await writeTextFile(destPath, content);
      setFilePath(destPath);
      setContentUri('');
      setIsDirty(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const volumes = await getStorageVolumes().catch(() => []);
      const friendlyPath = getFriendlyPath(`file://${destPath}`, volumes);
      Alert.alert(t.saved, t.savedTo(friendlyPath));
    } catch {
      Alert.alert(t.error, t.couldNotSave);
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, backgroundColor: colors.background }}>
        <TouchableOpacity
          onPress={() => { if (filePath) handleBack(); else if (router.canGoBack()) router.back(); else router.replace('/(tabs)'); }}
          style={{ width: 40, height: 40, justifyContent: 'center' }}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={{ flex: 1, fontSize: 18, fontWeight: '500', textAlign: 'center', letterSpacing: -0.5, color: colors.textPrimary }} numberOfLines={1}>
          {fileName || t.txtTitle}
        </Text>
        {filePath ? (
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {contentUri ? (
            <TouchableOpacity
              onPress={saveFile}
              disabled={saving || !isDirty}
              style={{ width: 40, height: 40, justifyContent: 'center', alignItems: 'center' }}>
              {saving
                ? <ActivityIndicator size="small" color={colors.blue} />
                : <Ionicons name="save-outline" size={22} color={isDirty ? colors.blue : colors.textMuted} />}
            </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              onPress={() => setSaveAsVisible(true)}
              style={{ width: 40, height: 40, justifyContent: 'center', alignItems: 'center' }}>
              <Ionicons name="folder-outline" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={colors.blue} />
        </View>
      ) : filePath ? (
        <TextEditorView
          style={{ flex: 1, backgroundColor: colors.background }}
          value={content}
          onTextChange={(e) => { setContent(e.nativeEvent.value); setIsDirty(true); }}
          color={colors.textPrimary}
          placeholder=""
          placeholderColor={colors.textMuted}
        />
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 24 }}>
          <View style={{ width: 88, height: 88, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 8, backgroundColor: colors.surface }}>
            <Text style={{ fontSize: 22, fontWeight: '900', color: colors.textSecondary, letterSpacing: 1 }}>.TXT</Text>
          </View>
          <Text style={{ fontSize: 22, fontWeight: '600', letterSpacing: -0.5, color: colors.textPrimary }}>{t.txtTitle}</Text>
          <Text style={{ fontSize: 14, textAlign: 'center', lineHeight: 20, color: colors.textMuted }}>
            {t.txtIntro}
          </Text>
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32, marginTop: 8, backgroundColor: colors.blue }}
            onPress={pickFile} activeOpacity={0.85}>
            <Ionicons name="document-text-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
            <Text style={{ fontSize: 15, fontWeight: '600', color: '#fff' }}>{t.txtChoose}</Text>
          </TouchableOpacity>
        </View>
      )}

      <FolderPickerModal
        visible={saveAsVisible}
        onClose={() => setSaveAsVisible(false)}
        onSave={(folderPath) => { setSaveAsVisible(false); saveAsFile(folderPath); }}
        defaultPath="/storage/emulated/0/Download"
        defaultLabel={t.download}
        defaultSubLabel={t.defaultSaveLocation}
        title={t.saveAs}
      />
    </SafeAreaView>
  );
}
