import React, { useState, useCallback } from 'react';
import {
  StyleSheet, Text, View, SectionList, TouchableOpacity,
  ActivityIndicator, Alert, useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import {
  recentActivity, clearActivity, flushActivity,
  describeActivity, describeActivityItems,
  ActivityEntry, MAX_ENTRIES,
} from '@/modules/activityLog';

/** A day heading plus the entries under it. */
type Section = { key: string; label: string; data: ActivityEntry[] };

const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  moved: 'arrow-forward-outline',
  copied: 'copy-outline',
  renamed: 'create-outline',
  trashed: 'trash-outline',
  deleted: 'close-circle-outline',
};

function startOfDay(at: number): number {
  const d = new Date(at);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** "Today", "Yesterday", or "19 September 2026". */
function dayLabel(at: number): string {
  const today = startOfDay(Date.now());
  const day = startOfDay(at);

  if (day === today) return 'Today';
  if (day === today - 86400000) return 'Yesterday';

  return new Date(at).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function timeLabel(at: number): string {
  return new Date(at).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Entries grouped under day headings, newest first.
 *
 * One pass over an already-sorted list, so this stays linear however many
 * entries there are.
 */
function toSections(entries: ActivityEntry[]): Section[] {
  const sections: Section[] = [];
  let current: Section | null = null;

  for (const entry of entries) {
    const key = String(startOfDay(entry.at));

    if (!current || current.key !== key) {
      current = { key, label: dayLabel(entry.at), data: [] };
      sections.push(current);
    }

    current.data.push(entry);
  }

  return sections;
}

export default function ActivityScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const landscape = width > height;

  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    // Entries sit in memory for up to 300ms before being written, so flush
    // first or a move made a moment ago would be missing.
    await flushActivity();
    setEntries(await recentActivity());
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  function toggle(key: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function handleClear() {
    Alert.alert(
      'Clear activity',
      'Remove the record of what happened to your files? This does not change any files.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            await clearActivity();
            setEntries([]);
            setExpanded(new Set());
          },
        },
      ]
    );
  }

  const sections = toSections(entries);

  return (
    <SafeAreaView
      edges={['left', 'right', 'bottom']}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <View style={[styles.header, { backgroundColor: colors.background }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Activity</Text>
        {entries.length > 0 ? (
          <TouchableOpacity onPress={handleClear} style={styles.backBtn}>
           <Ionicons name="trash-outline" size={22} color={colors.deleteRed} />
          </TouchableOpacity>
        ) : (
          <View style={styles.backBtn} />
        )}
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.blue} />
        </View>
      ) : entries.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="time-outline" size={48} color={colors.textDisabled} />
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
            Nothing yet
          </Text>
          <Text style={[styles.emptySub, { color: colors.textMuted }]}>
            Files you move, delete or add to the Vault are recorded here, so you
            can find where something went.
          </Text>
        </View>
      ) : (
        <SectionList
        sections={sections}
        keyExtractor={(entry, index) => entry.id ?? `${entry.at}-${index}`}
        contentContainerStyle={[styles.list, landscape && styles.listLandscape]}
        showsVerticalScrollIndicator={false}
        stickySectionHeadersEnabled={false}
        initialNumToRender={20}
        maxToRenderPerBatch={20}
        windowSize={11}
        removeClippedSubviews
        ListHeaderComponent={
          <Text style={[styles.count, { color: colors.textMuted }]}>
            {entries.length} action{entries.length !== 1 ? 's' : ''} · last{' '}
            {MAX_ENTRIES} kept on this device
          </Text>
        }
        renderSectionHeader={({ section }) => (
          <Text style={[styles.dayLabel, { color: colors.textMuted }]}>
            {section.label}
          </Text>
        )}
        renderItem={({ item: entry, index }) => {
          const key = entry.id ?? `${entry.at}-${index}`;
          const items = describeActivityItems(entry);
          const isOpen = expanded.has(key);
          const permanent = entry.action === 'deleted';

          return (
            <TouchableOpacity
              activeOpacity={items.length ? 0.6 : 1}
              onPress={() => items.length && toggle(key)}
              style={[styles.row, { borderBottomColor: colors.surface }]}
            >
              <View
                style={[
                  styles.icon,
                  { backgroundColor: permanent ? colors.trashBg ?? colors.surface : colors.surface },
                ]}
              >
                <Ionicons
                  name={ICONS[entry.action] ?? 'ellipse-outline'}
                  size={18}
                  color={permanent ? colors.deleteRed : colors.textSecondary}
                />
              </View>

              <View style={styles.info}>
                <Text
                  style={[styles.line, { color: colors.textPrimary }]}
                  numberOfLines={isOpen ? undefined : 3}
                >
                  {describeActivity(entry)}
                </Text>
                <Text style={[styles.meta, { color: colors.textMuted }]}>
                  {timeLabel(entry.at)}
                  {entry.source ? ` · ${entry.source}` : ''}
                  {items.length && !isOpen ? ' · tap for detail' : ''}
                </Text>

                {isOpen &&
                  items.map((line, i) => (
                    <Text key={i} style={[styles.detail, { color: colors.textSecondary }]}>
                      {line}
                    </Text>
                  ))}
              </View>
            </TouchableOpacity>
          );
        }}
      />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  title: { flex: 1, fontSize: 20, fontWeight: '500', textAlign: 'center', letterSpacing: -0.5 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '600' },
  emptySub: { fontSize: 13, textAlign: 'center', lineHeight: 20 },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  // Long lines are unreadable across a wide screen, so the column is capped
  // and centred rather than stretched, matching the sheets elsewhere.
  listLandscape: { width: '70%', alignSelf: 'center' },
  count: { fontSize: 11, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  dayLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 16, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 10, borderBottomWidth: 0.5 },
  icon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  info: { flex: 1 },
  line: { fontSize: 14, fontWeight: '500', marginBottom: 2 },
  meta: { fontSize: 11 },
  detail: { fontSize: 12, lineHeight: 18, marginTop: 4, paddingLeft: 8 },
});
