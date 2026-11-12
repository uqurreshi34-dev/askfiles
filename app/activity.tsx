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
  ActivityEntry, MAX_ENTRIES,
} from '@/modules/activityLog';
import { useLanguage } from '@/modules/appLanguage';
import { activityText } from '@/modules/i18n/activityText';

type ActivityWords = ReturnType<typeof activityText>;

/** A day heading plus the entries under it. */
type Section = { key: string; label: string; data: ActivityEntry[] };

const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  moved: 'arrow-forward-outline',
  copied: 'copy-outline',
  renamed: 'create-outline',
  restored: 'arrow-undo-outline',
  trashed: 'trash-outline',
  deleted: 'close-circle-outline',
};

function startOfDay(at: number): number {
  const d = new Date(at);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** "Today", "Yesterday", or "19 September 2026". */
function dayLabel(at: number, t: ActivityWords): string {
  const today = startOfDay(Date.now());
  const day = startOfDay(at);

  if (day === today) return t.today;
  if (day === today - 86400000) return t.yesterday;

  return new Date(at).toLocaleDateString(t.locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function timeLabel(at: number, locale: string): string {
  return new Date(at).toLocaleTimeString(locale, {
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
function toSections(entries: ActivityEntry[], t: ActivityWords): Section[] {
  const sections: Section[] = [];
  let current: Section | null = null;

  for (const entry of entries) {
    const key = String(startOfDay(entry.at));

    if (!current || current.key !== key) {
      current = { key, label: dayLabel(entry.at, t), data: [] };
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
  const t = activityText(useLanguage());

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
      t.clearTitle,
      t.clearMsg,
      [
        { text: t.cancel, style: 'cancel' },
        {
          text: t.clear,
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

  const sections = toSections(entries, t);

  return (
    <SafeAreaView
      edges={['left', 'right', 'bottom']}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <View style={[styles.header, { backgroundColor: colors.background }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>{t.title}</Text>
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
            {t.nothingYet}
          </Text>
          <Text style={[styles.emptySub, { color: colors.textMuted }]}>
            {t.emptySub}
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
            {t.countLine(entries.length, MAX_ENTRIES)}
          </Text>
        }
        renderSectionHeader={({ section }) => (
          <Text style={[styles.dayLabel, { color: colors.textMuted }]}>
            {section.label}
          </Text>
        )}
        renderItem={({ item: entry, index }) => {
          const key = entry.id ?? `${entry.at}-${index}`;
          const items = t.describeItems(entry);
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
                  {t.describeEntry(entry)}
                </Text>
                <Text style={[styles.meta, { color: colors.textMuted }]}>
                  {timeLabel(entry.at, t.locale)}
                  {entry.source ? ` · ${t.source(entry.source)}` : ''}
                  {items.length && !isOpen ? ` · ${t.tapForDetail}` : ''}
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
