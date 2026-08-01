import { useState, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Modal, Pressable,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView,
  useWindowDimensions, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { useTags, addTag } from '@/hooks/useTags';
import { useFileTags, addTagToFile, removeTagFromFile } from '@/hooks/useFileTags';

export interface TagPickerItem {
  name: string;
  uri: string;
}

interface Props {
  visible: boolean;
  item: TagPickerItem | null;
  onClose: () => void;
}

const ICON_CHOICES = [
  'pricetag-outline', 'folder-outline', 'star-outline', 'briefcase-outline',
  'home-outline', 'heart-outline', 'shield-outline', 'camera-outline',
];

const DEFAULT_COLOR = '#3B6D11';
const DEFAULT_ICON = 'pricetag-outline';

export default function TagPickerModal({ visible, item, onClose }: Props) {
  const { colors } = useTheme();
  const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = useWindowDimensions();
  const { tags } = useTags();
  const { fileTags } = useFileTags();

  const [showNewTag, setShowNewTag] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(DEFAULT_COLOR);
  const [newTagIcon, setNewTagIcon] = useState(DEFAULT_ICON);
  const [creatingTag, setCreatingTag] = useState(false);

  // Derived from the hook rather than held locally — a write notifies the
  // listener, which updates fileTags, which re-renders the chips. No local
  // copy to keep in sync.
  const applied = useMemo(() => {
    if (!item) return new Set<string>();
    return new Set(fileTags.find(f => f.uri === item.uri)?.tagIds ?? []);
  }, [fileTags, item]);

  function resetForm() {
    setShowNewTag(false);
    setNewTagName('');
    setNewTagColor(DEFAULT_COLOR);
    setNewTagIcon(DEFAULT_ICON);
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  async function toggleTag(tagId: string) {
    if (!item) return;
    if (applied.has(tagId)) {
      await removeTagFromFile(item.uri, tagId).catch(() => {});
    } else {
      await addTagToFile(item.uri, item.name, tagId).catch(() => {});
    }
  }

  async function handleCreate() {
    if (!newTagName.trim() || creatingTag) return;
    setCreatingTag(true);
    const name = newTagName.trim();
    const color = newTagColor;
    const icon = newTagIcon;
    const target = item;
    resetForm();
    try {
      const newTag = await addTag({ name, color, icon });
      if (target) await addTagToFile(target.uri, target.name, newTag.id);
    } catch {
    } finally {
      setCreatingTag(false);
    }
  }

  const palette = [
    colors.blue, colors.purple, colors.green, colors.amber,
    colors.redBrown, colors.deleteRed, colors.yellow, colors.favRed,
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={SCREEN_WIDTH < SCREEN_HEIGHT ? (Platform.OS === 'android' ? 'height' : 'padding') : undefined}
      >
        <Pressable style={styles.overlay} onPress={handleClose}>
          <Pressable style={[styles.modal, { backgroundColor: colors.card, maxHeight: SCREEN_HEIGHT * 0.75 }]}>
            <View style={styles.header}>
              <Text style={[styles.title, { color: colors.textPrimary }]}>Tags</Text>
              <TouchableOpacity onPress={handleClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {tags.length > 0 && (
                <View style={styles.chipRow}>
                  {tags.map(tag => {
                    const on = applied.has(tag.id);
                    return (
                      <TouchableOpacity
                        key={tag.id}
                        onPress={() => toggleTag(tag.id)}
                        style={[styles.chip, {
                          backgroundColor: on ? tag.color + '33' : colors.surface,
                          borderColor: on ? tag.color : colors.border,
                        }]}
                      >
                        <Ionicons name={tag.icon as any} size={14} color={tag.color} />
                        <Text style={{ fontSize: 13, color: on ? tag.color : colors.textSecondary, fontWeight: on ? '600' : '400' }}>
                          {tag.name}
                        </Text>
                        {on && <Ionicons name="checkmark" size={13} color={tag.color} />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {!showNewTag ? (
                <TouchableOpacity style={styles.newTagBtn} onPress={() => setShowNewTag(true)}>
                  <Ionicons name="add-circle-outline" size={20} color={colors.purple} />
                  <Text style={{ fontSize: 15, color: colors.purple }}>New Tag</Text>
                </TouchableOpacity>
              ) : (
                <View style={{ gap: 10, marginTop: 4 }}>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary }]}
                    placeholder="Tag name..."
                    placeholderTextColor={colors.textMuted}
                    value={newTagName}
                    onChangeText={setNewTagName}
                    autoFocus
                    maxLength={20}
                  />

                  <View style={styles.wrapRow}>
                    {palette.map(c => (
                      <TouchableOpacity
                        key={c}
                        onPress={() => setNewTagColor(c)}
                        style={{
                          width: 28, height: 28, borderRadius: 14,
                          backgroundColor: c,
                          borderWidth: newTagColor === c ? 3 : 0,
                          borderColor: colors.textPrimary,
                        }}
                      />
                    ))}
                  </View>

                  <View style={styles.wrapRow}>
                    {ICON_CHOICES.map(ic => (
                      <TouchableOpacity
                        key={ic}
                        onPress={() => setNewTagIcon(ic)}
                        style={{
                          width: 36, height: 36, borderRadius: 8,
                          alignItems: 'center', justifyContent: 'center',
                          backgroundColor: newTagIcon === ic ? newTagColor + '33' : colors.surface,
                          borderWidth: newTagIcon === ic ? 1.5 : 0,
                          borderColor: newTagColor,
                        }}
                      >
                        <Ionicons name={ic as any} size={18} color={newTagIcon === ic ? newTagColor : colors.textMuted} />
                      </TouchableOpacity>
                    ))}
                  </View>

                  <View style={styles.actions}>
                    <TouchableOpacity
                      style={[styles.cancelBtn, { backgroundColor: colors.surface }]}
                      onPress={resetForm}
                    >
                      <Text style={{ fontSize: 15, fontWeight: '500', color: colors.textSecondary }}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.confirmBtn, { backgroundColor: colors.blue }, (!newTagName.trim() || creatingTag) && { opacity: 0.4 }]}
                      disabled={!newTagName.trim() || creatingTag}
                      onPress={handleCreate}
                    >
                      {creatingTag
                        ? <ActivityIndicator size="small" color="#fff" />
                        : <Text style={{ fontSize: 15, fontWeight: '600', color: '#fff' }}>Create &amp; Apply</Text>
                      }
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 24,
  },
  modal: { width: '85%', maxWidth: 400, borderRadius: 16, padding: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  title: { fontSize: 17, fontWeight: '600' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1,
  },
  newTagBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  input: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  wrapRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  confirmBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
});
