import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ExerciseEntry, ExerciseSummary } from '@ct/shared';
import { distanceUnit, formatDistance, toDistance } from '@ct/shared';
import { exerciseEmoji } from '@ct/shared/food-emoji';
import { Chunk } from '@/components/Chunk';
import { InsetGroup, InsetRow } from '@/components/InsetGroup';
import { Skeleton } from '@/components/Skeleton';
import { Sparkline } from '@/components/Sparkline';
import { Stat, Stats } from '@/components/Stat';
import { api } from '@/lib/api';
import { entryRemoved } from '@/lib/removals';
import { useUnits } from '@/lib/units';
import { font, type as t, useColors } from '@/theme';
import { Glyph } from '@/components/Glyph';
import { removeAction, SwipeRow } from '@/components/SwipeRow';
import { useUndoableRemoval } from '@/hooks/useUndoableRemoval';
import { Workouts } from '@/components/exercise/Workouts';

/**
 * Exercise, split out of Progress so it gets a screen rather than a single row.
 *
 * Everything here stays on the §9 side of the line: burn is reported, never
 * netted against the target. The screen answers "have I been training?" — a
 * question about consistency — which is why active days and the per-day shape
 * lead, and the calorie total is the smallest number on the page.
 */

const WINDOWS = [14, 30, 90] as const;

export default function ExerciseScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const units = useUnits();

  const [summary, setSummary] = useState<ExerciseSummary | null>(null);
  const undoably = useUndoableRemoval();
  const [days, setDays] = useState<number>(30);
  const [error, setError] = useState<string | null>(null);

  /* The series carries a date and a number per day; the sessions that made
     that number sit in a flat list beside it. Index them once, so pointing at
     a bar can answer what the day actually was. */
  const byDate = useMemo(() => {
    const map = new Map<string, ExerciseEntry[]>();
    for (const entry of summary?.entries ?? []) {
      const day = map.get(entry.local_date);
      if (day) day.push(entry);
      else map.set(entry.local_date, [entry]);
    }
    return map;
  }, [summary]);

  const load = useCallback(async (window: number) => {
    try {
      setSummary(await api.exercise(window));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load(days);
  }, [days, load]);

  function remove(entry: ExerciseEntry) {
    const before = summary;
    setSummary((prev) =>
      prev ? { ...prev, entries: prev.entries.filter((e) => e.id !== entry.id) } : prev,
    );

    undoably(`Removed ${entry.description}`, {
      commit: () => {
        void api
          .deleteExerciseEntry(entry.id)
          // The journal is still holding the card this session was logged with.
          .then(() => entryRemoved(entry.id))
          .catch((e: Error) => setError(e.message))
          .finally(() => void load(days));
      },
      restore: () => setSummary(before),
    });
  }

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.page, { paddingTop: insets.top + 20 }]}
    >
      <View style={styles.header}>
        <Text style={[t.largeTitle, { color: colors.foreground }]}>Exercise</Text>
        <Chunk
          depth={2}
          radius={999}
          contentStyle={[
            styles.windows,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          {WINDOWS.map((w) => {
            const active = days === w;
            return (
              <Pressable
                key={w}
                onPress={() => setDays(w)}
                accessibilityRole="button"
                accessibilityLabel={`${w} days`}
                accessibilityState={{ selected: active }}
                style={[styles.window, active ? { backgroundColor: colors.primary } : null]}
              >
                <Text
                  style={[
                    styles.windowLabel,
                    { color: active ? colors.primaryForeground : colors.mutedForeground },
                  ]}
                >
                  {w}d
                </Text>
              </Pressable>
            );
          })}
        </Chunk>
      </View>

      {/* Saved workouts and the week, above the history: this is the half of
          the screen you come here to *act* on, and the history below is the
          half you come to read. */}
      <Workouts onLogged={() => void load(days)} />

      {!summary ? (
        <>
          <Skeleton style={{ height: 176, borderRadius: 24 }} />
          <Skeleton style={{ height: 128, borderRadius: 24 }} />
        </>
      ) : summary.sessions === 0 ? (
        <InsetGroup>
          <View style={styles.empty}>
            <Text style={styles.mascot}>🏃</Text>
            <Text style={[t.body, styles.centred, { color: colors.mutedForeground }]}>
              Nothing logged in the last {days} days.{'\n'}
              Tell the journal — “went for a {units === 'imperial' ? '3 mile' : '5km'} run”.
            </Text>
          </View>
        </InsetGroup>
      ) : (
        <>
          <InsetGroup title="🔁  Consistency">
            <View style={styles.pad}>
              <View style={styles.headline}>
                <Text style={[t.largeTitle, t.tnum, { color: colors.foreground }]}>
                  {summary.active_days}
                </Text>
                <Text style={[t.footnote, styles.aside, { color: colors.mutedForeground }]}>
                  active of {summary.days} days · {summary.sessions} session
                  {summary.sessions === 1 ? '' : 's'}
                </Text>
              </View>
              <Sparkline
                points={summary.series}
                accessor="value"
                stroke={colors.exercise}
                variant="bars"
                style={styles.chart}
                readout={(point) => (
                  <DayReadout
                    date={point.local_date}
                    kcal={point.value ?? 0}
                    sessions={byDate.get(point.local_date) ?? []}
                  />
                )}
              />
            </View>

            <Stats>
              <Stat first label="Burned" value={summary.total_kcal.toLocaleString()} unit="kcal" />
              <Stat
                label="Distance"
                value={
                  summary.total_distance_km === null
                    ? '—'
                    : String(toDistance(summary.total_distance_km, units))
                }
                unit={distanceUnit(units)}
              />
              <Stat
                label="Time"
                value={
                  summary.total_duration_min === null
                    ? '—'
                    : formatDuration(summary.total_duration_min)
                }
                unit=""
              />
            </Stats>
          </InsetGroup>

          <InsetGroup
            title="🏃  Sessions"
            footer={`Burn is an estimate and is never netted off your calorie target. Correct one in the journal — “that run was closer to ${units === 'imperial' ? '4.5 miles' : '7km'}”.`}
          >
            {summary.entries.map((entry, i) => (
              <SwipeRow
                key={entry.id}
                index={i}
                style={i === 0 ? null : { borderTopWidth: 2, borderTopColor: colors.border }}
                actions={[removeAction(colors, entry.description, () => remove(entry))]}
              >
                <InsetRow first>
                  <Text style={styles.rowEmoji}>{exerciseEmoji(entry.description)}</Text>
                  <View style={styles.flex}>
                    <Text numberOfLines={1} style={[t.bodySemibold, { color: colors.foreground }]}>
                      {entry.description}
                    </Text>
                    <Text style={[t.footnote, { color: colors.mutedForeground }]}>
                      {[
                        formatDate(entry.local_date),
                        entry.distance_km !== null ? formatDistance(entry.distance_km, units) : null,
                        entry.duration_min !== null ? `${Math.round(entry.duration_min)} min` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  </View>
                  <Text style={[t.figure, styles.figure, { color: colors.exerciseText }]}>
                    −{Math.round(entry.kcal_burned)}
                  </Text>
                  <Pressable
                    onPress={() => remove(entry)}
                    accessibilityRole="button"
                    accessibilityLabel={`Delete ${entry.description}`}
                    hitSlop={10}
                    style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
                  >
                    <Glyph icon="trash" color={colors.mutedForeground} />
                  </Pressable>
                </InsetRow>
              </SwipeRow>
            ))}
          </InsetGroup>
        </>
      )}

      {error && (
        <Text style={[t.footnoteSemibold, styles.centred, { color: colors.destructive }]}>
          {error}
        </Text>
      )}
    </ScrollView>
  );
}

/**
 * What one bar was.
 *
 * The number on its own is the least interesting half of a day — "260 kcal"
 * last Saturday means nothing until you remember it was the long ride — so the
 * sessions come with it. A rest day says so in words: an empty slot with no
 * caption reads as something the app lost rather than a day off.
 */
function DayReadout({
  date,
  kcal,
  sessions,
}: {
  date: string;
  kcal: number;
  sessions: ExerciseEntry[];
}) {
  const colors = useColors();
  const units = useUnits();
  const distance = sessions.reduce((sum, s) => sum + (s.distance_km ?? 0), 0);
  const minutes = sessions.reduce((sum, s) => sum + (s.duration_min ?? 0), 0);
  const detail = [
    distance > 0 ? formatDistance(distance, units) : null,
    minutes > 0 ? formatDuration(minutes) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <>
      {/* Date and figure share a line. The card is parked on top of the chart
          it is explaining, so every line it costs is a bar you cannot see. */}
      <View style={styles.readoutHead}>
        <Text style={[t.footnoteBold, { color: colors.mutedForeground }]}>{formatDate(date)}</Text>
        {sessions.length === 0 ? (
          <Text style={[t.footnoteSemibold, { color: colors.foreground }]}>Rest day</Text>
        ) : (
          <Text style={[t.footnote, t.tnum, styles.readoutFigure, { color: colors.exerciseText }]}>
            {Math.round(kcal).toLocaleString()}
            <Text style={[styles.readoutUnit, { color: colors.mutedForeground }]}>
              {` kcal${detail ? ` · ${detail}` : ''}`}
            </Text>
          </Text>
        )}
      </View>

      {sessions.length > 0 && (
        /* Three is as many as fits before the card covers the chart it is
           explaining; a fourth session is rarer than that limit is annoying. */
        <View style={styles.readoutList}>
          {sessions.slice(0, 3).map((session) => (
            <View key={session.id} style={styles.readoutItem}>
              <Text style={styles.readoutEmoji}>{exerciseEmoji(session.description)}</Text>
              <Text numberOfLines={1} style={[t.footnote, styles.flex, { color: colors.foreground }]}>
                {session.description}
              </Text>
            </View>
          ))}
          {sessions.length > 3 && (
            <Text style={[t.footnote, { color: colors.mutedForeground }]}>
              +{sessions.length - 3} more
            </Text>
          )}
        </View>
      )}
    </>
  );
}

function formatDuration(minutes: number): string {
  const whole = Math.round(minutes);
  if (whole < 60) return `${whole}m`;
  const hours = Math.floor(whole / 60);
  const rest = whole % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  page: { paddingHorizontal: 16, paddingBottom: 40, gap: 28 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  windows: { flexDirection: 'row', borderWidth: 2, borderRadius: 999, padding: 4 },
  window: {
    height: 32,
    borderRadius: 999,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  windowLabel: { fontFamily: font.bold, fontSize: 12, lineHeight: 16 },
  pad: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },
  headline: { flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' },
  aside: { flexShrink: 1 },
  chart: { marginTop: 16 },
  empty: { alignItems: 'center', paddingHorizontal: 16, paddingVertical: 48 },
  mascot: { fontSize: 40, lineHeight: 48, marginBottom: 12 },
  centred: { textAlign: 'center' },
  rowEmoji: { fontSize: 20, lineHeight: 24 },
  figure: { fontSize: 16, lineHeight: 24 },
  readoutHead: { flexDirection: 'row', alignItems: 'baseline', gap: 12 },
  readoutFigure: { marginLeft: 'auto' },
  readoutUnit: { fontFamily: font.semibold, fontSize: 12, lineHeight: 16 },
  readoutList: { marginTop: 4, gap: 2 },
  readoutItem: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  readoutEmoji: { fontSize: 12, lineHeight: 16 },
});
