import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Polyline } from 'react-native-svg';
import type { Calendar, CalendarDay, Locale } from '@ct/shared';
import { formatBodyWeight, formatDay, formatMonth } from '@ct/shared';
import { Chunk } from '@/components/Chunk';
import { InsetGroup } from '@/components/InsetGroup';
import { Skeleton } from '@/components/Skeleton';
import { Stat, Stats } from '@/components/Stat';
import { api } from '@/lib/api';
import { useUnits } from '@/lib/units';
import { font, type as t, useColors, useTheme, type Scheme } from '@/theme';
import { useLocale, useT } from '@/lib/i18n';

/**
 * A month at a time, as a grid.
 *
 * This is the time-travel surface for the whole app: the Today screen used to
 * step one day at a time, which made "how did last month go?" a dozen taps and
 * gave no sense of shape. A grid answers both at once — the pattern is visible
 * without reading a single number, and any day is one tap away.
 *
 * The web pairs every cell with a hover card. That is dropped here rather than
 * translated, because it answers a question a finger cannot ask: a mouse can
 * inspect a day without choosing it, and a touch cannot. Tapping already
 * selects, and the card below the grid says everything the hover card said —
 * so on a phone the hover card would only be a slower way to reach the panel
 * that is already open.
 */

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export default function HistoryScreen() {
  const locale = useLocale();
  const tr = useT();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const units = useUnits();

  // Month cursor as a first-of-month ISO date, so all arithmetic is on dates
  // rather than on a Date object in some ambient timezone.
  const [month, setMonth] = useState<string | null>(null);
  const [calendar, setCalendar] = useState<Calendar | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        // Anchor on the server's idea of today: it honours day_start_hour, so a
        // 1am snack belongs to the evening before here as everywhere else.
        const today = await api.day();
        setMonth(`${today.local_date.slice(0, 7)}-01`);
        setSelected(today.local_date);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, []);

  const load = useCallback(async (firstOfMonth: string) => {
    try {
      setCalendar(await api.calendar(firstOfMonth, endOfMonth(firstOfMonth)));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (month) void load(month);
  }, [month, load]);

  const byDate = useMemo(
    () => new Map((calendar?.days ?? []).map((day) => [day.local_date, day])),
    [calendar],
  );

  const cells = useMemo(() => (month ? monthGrid(month) : []), [month]);
  const selectedDay = selected ? byDate.get(selected) : undefined;
  const logged = (calendar?.days ?? []).filter((d) => d.logged);

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 32 }}
    >
      <View style={styles.topBar}>
        <Chevron direction="back" label={tr('history.back')} onPress={() => router.back()} />
        <Text style={[t.largeTitle, styles.heading, { color: colors.foreground }]}>{tr('history.title')}</Text>
      </View>

      <View style={styles.monthBar}>
        <Chevron
          direction="back"
          label={tr('history.previousMonth')}
          onPress={() => setMonth((m) => (m ? shiftMonth(m, -1) : m))}
        />
        <Text style={[t.body, styles.monthLabel, { color: colors.foreground }]}>
          {month ? monthLabel(month, locale) : ''}
        </Text>
        <Chevron
          direction="forward"
          label={tr('history.nextMonth')}
          onPress={() => setMonth((m) => (m ? shiftMonth(m, 1) : m))}
        />
      </View>

      {!calendar || !month ? (
        <View style={styles.page}>
          <Skeleton style={styles.loadingGrid} />
        </View>
      ) : (
        <View style={styles.page}>
          <Chunk
            contentStyle={[
              styles.card,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View style={styles.week}>
              {WEEKDAYS.map((label, i) => (
                <Text
                  key={i}
                  style={[t.footnoteBold, styles.weekday, { color: colors.mutedForeground }]}
                >
                  {label}
                </Text>
              ))}
            </View>

            <View style={styles.grid}>
              {cells.map((date, i) =>
                date === null ? (
                  <View key={`pad-${i}`} style={styles.cell} />
                ) : (
                  <DayCell
                    key={date}
                    date={date}
                    day={byDate.get(date)}
                    selected={date === selected}
                    onSelect={() => setSelected(date)}
                  />
                ),
              )}
            </View>

            <Legend />
          </Chunk>

          <InsetGroup title={selected ? formatFullDate(selected, locale) : tr('history.day')}>
            {selectedDay && selectedDay.logged ? (
              <View style={styles.detail}>
                <View style={styles.detailHead}>
                  <Text style={[t.largeTitle, t.tnum, { color: colors.foreground }]}>
                    {selectedDay.kcal.toLocaleString()}
                  </Text>
                  <Text style={[t.footnote, { color: colors.mutedForeground }]}>
                    of {selectedDay.target_kcal.toLocaleString() || '—'} kcal
                  </Text>
                </View>

                <View style={styles.facts}>
                  <Text style={[t.footnoteSemibold, t.tnum, { color: colors.mutedForeground }]}>
                    {selectedDay.protein_g}g protein
                  </Text>
                  {selectedDay.burned_kcal > 0 && (
                    <Text style={[t.footnoteSemibold, t.tnum, { color: colors.exerciseText }]}>
                      −{selectedDay.burned_kcal} burned
                    </Text>
                  )}
                  {selectedDay.weight_kg !== null && (
                    <Text style={[t.footnoteSemibold, t.tnum, { color: colors.mutedForeground }]}>
                      {formatBodyWeight(selectedDay.weight_kg, units)}
                    </Text>
                  )}
                </View>

                <Pressable
                  // `navigate`, not `push`: Today is already down the stack, and
                  // pushing would stack a second copy of it behind this one.
                  onPress={() => router.navigate({ pathname: '/today', params: { date: selected! } })}
                  accessibilityRole="button"
                  hitSlop={8}
                  style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
                >
                  <Text style={[t.bodyBold, { color: colors.caloriesText }]}>{tr('history.openInToday')}</Text>
                </Pressable>
              </View>
            ) : (
              <Text style={[t.body, styles.nothing, { color: colors.mutedForeground }]}>
                Nothing logged{selectedDay ? ' that day' : ' yet'}.
              </Text>
            )}
          </InsetGroup>

          <InsetGroup title={`📆  ${tr('history.thisMonth')}`}>
            <Stats>
              <Stat label={tr('history.logged')} value={`${logged.length}`} unit={tr('history.days')} first />
              <Stat
                label={tr('history.avgIntake')}
                value={
                  logged.length === 0
                    ? '—'
                    : Math.round(
                        logged.reduce((sum, d) => sum + d.kcal, 0) / logged.length,
                      ).toLocaleString()
                }
                unit="kcal"
              />
              <Stat
                label={tr('history.onTarget')}
                value={`${
                  logged.filter((d) => d.target_kcal > 0 && d.kcal <= d.target_kcal).length
                }`}
                unit={tr('history.days')}
              />
            </Stats>
          </InsetGroup>

          {error && (
            <Text style={[t.footnoteSemibold, styles.centred, { color: colors.destructive }]}>
              {error}
            </Text>
          )}
        </View>
      )}
    </ScrollView>
  );
}

/**
 * One cell.
 *
 * The fill says how the day went at a glance. An unlogged day gets none,
 * because an empty day and a day at zero calories are different facts and
 * colouring them the same would make a forgotten week look like a starved one.
 *
 * A logged day whose target is unknown still gets a fill — a neutral one. The
 * grid's first job is "did I log?", and that answer does not depend on having
 * a target to judge the day against.
 */
function DayCell({
  date,
  day,
  selected,
  onSelect,
}: {
  date: string;
  day: CalendarDay | undefined;
  selected: boolean;
  onSelect: () => void;
}) {
  const colors = useColors();
  const locale = useLocale();
  const { scheme } = useTheme();
  const logged = day?.logged ?? false;
  const ratio = logged && day!.target_kcal > 0 ? day!.kcal / day!.target_kcal : null;
  const tone = toneFor(scheme, logged ? ratio : undefined);

  const label = logged
    ? `${formatFullDate(date, locale)}, ${day!.kcal} kcal${
        day!.target_kcal > 0 ? ` of ${day!.target_kcal}` : ''
      }`
    : `${formatFullDate(date, locale)}, nothing logged`;

  return (
    <View style={styles.cell}>
      <Chunk
        // Only a logged day is an object; a blank one is a hole in the month.
        depth={logged ? 2 : 0}
        radius={CELL_RADIUS}
        color={logged ? colors.chunk : 'transparent'}
        style={styles.flex}
        /*
         * The height has to be handed down both levels. The cell is a fixed
         * square and the face fills it, but `Chunk`'s inner surface is a plain
         * View: without a flex of its own it sizes to its content, and a child
         * asking for `flex: 1` inside a container of undefined height collapses
         * to nothing — which left every square showing only its own ledge, with
         * the date invisible inside a face zero pixels tall.
         */
        contentStyle={styles.flex}
      >
        <Pressable
          onPress={onSelect}
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityState={{ selected }}
          style={[
            styles.cellFace,
            { backgroundColor: tone.background },
            selected ? { borderWidth: 2, borderColor: colors.foreground } : null,
          ]}
        >
          <Text style={[t.tnum, styles.cellNumber, { color: tone.text(colors) }]}>
            {Number(date.slice(8))}
          </Text>
          {logged && day!.burned_kcal > 0 && (
            <View style={[styles.burnDot, { backgroundColor: colors.exercise }]} />
          )}
        </Pressable>
      </Chunk>
    </View>
  );
}

/**
 * The fill for one day.
 *
 * On the web these are `color-mix(in oklch, …)` against `--card`, computed by
 * the browser. React Native has no `color-mix`, so each step is precomputed
 * here — converted to OKLCH, mixed on the polar axis the way CSS Color 4
 * specifies, and converted back. They are the exact colours the web renders,
 * which is why the dark scale drifts toward olive: dark's card is a warm brown
 * with real chroma, so mixing a green into it moves the hue as well as the
 * lightness. That is the web's behaviour, faithfully, not a substitution.
 */
const TONES: Record<Scheme, { under: string; mid: string; onTarget: string; over: string; noTarget: string }> = {
  light: {
    under: '#e9f7ed',
    mid: '#cbecd5',
    onTarget: '#96d9ac',
    over: '#c5c1be',
    noTarget: '#eae9e8',
  },
  dark: {
    under: '#3a2c1e',
    mid: '#554321',
    onTarget: '#73752c',
    over: '#544c47',
    noTarget: '#342d28',
  },
};

type Tone = { background: string; text: (c: ReturnType<typeof useColors>) => string };

function toneFor(scheme: Scheme, ratio: number | null | undefined): Tone {
  const tones = TONES[scheme];
  // undefined — nothing logged. Left blank on purpose.
  if (ratio === undefined) return { background: 'transparent', text: (c) => c.mutedForeground };
  // null — logged, but against no target we can hold it to. Neutral rather
  // than absent: it happened, we just have nothing to grade it against.
  if (ratio === null) return { background: tones.noTarget, text: (c) => c.foreground };
  // Over target is the one state that steps outside the scale — but it steps
  // to ink rather than to red. A month grid is exactly where a wall of red
  // squares would read as a verdict on the person rather than on the data.
  if (ratio > 1.05) return { background: tones.over, text: (c) => c.foreground };
  if (ratio >= 0.85) return { background: tones.onTarget, text: (c) => c.foreground };
  if (ratio >= 0.6) return { background: tones.mid, text: (c) => c.foreground };
  return { background: tones.under, text: (c) => c.foreground };
}

function Legend() {
  const colors = useColors();
  const tr = useT();
  const { scheme } = useTheme();
  const swatches: Array<{ label: string; ratio: number | null }> = [
    { label: tr('history.under'), ratio: 0.5 },
    { label: tr('history.onTarget'), ratio: 0.95 },
    { label: tr('history.over'), ratio: 1.2 },
    // Logged before any target existed — see toneFor.
    { label: tr('history.noTarget'), ratio: null },
  ];

  return (
    <View style={styles.legend}>
      {swatches.map(({ label, ratio }) => (
        <View key={label} style={styles.legendItem}>
          <View
            style={[styles.swatch, { backgroundColor: toneFor(scheme, ratio).background }]}
          />
          <Text style={[t.footnoteSemibold, { color: colors.mutedForeground }]}>{label}</Text>
        </View>
      ))}
      <View style={styles.legendItem}>
        <View style={[styles.legendDot, { backgroundColor: colors.exercise }]} />
        <Text style={[t.footnoteSemibold, { color: colors.mutedForeground }]}>{tr('today.exercise')}</Text>
      </View>
    </View>
  );
}

function Chevron({
  direction,
  label,
  onPress,
}: {
  direction: 'back' | 'forward';
  label: string;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={({ pressed }) => [styles.chevron, { opacity: pressed ? 0.5 : 1 }]}
    >
      <Svg width={20} height={20} viewBox="0 0 24 24">
        <Polyline
          points={direction === 'back' ? '15 18 9 12 15 6' : '9 18 15 12 9 6'}
          stroke={colors.mutedForeground}
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </Svg>
    </Pressable>
  );
}

// ---- Date arithmetic -------------------------------------------------------
// All of it on UTC Dates built from ISO parts, so a month never shifts by one
// under a timezone offset.

function shiftMonth(firstOfMonth: string, delta: number): string {
  const [y, m] = firstOfMonth.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1 + delta, 1)).toISOString().slice(0, 10);
}

function endOfMonth(firstOfMonth: string): string {
  const [y, m] = firstOfMonth.split('-').map(Number);
  return new Date(Date.UTC(y!, m!, 0)).toISOString().slice(0, 10);
}

/** The month's cells, Monday-first, padded with nulls before the 1st. */
function monthGrid(firstOfMonth: string): Array<string | null> {
  const [y, m] = firstOfMonth.split('-').map(Number);
  const first = new Date(Date.UTC(y!, m! - 1, 1));
  const days = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  // getUTCDay is Sunday-first; the grid is Monday-first.
  const lead = (first.getUTCDay() + 6) % 7;

  return [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: days }, (_, i) =>
      new Date(Date.UTC(y!, m! - 1, i + 1)).toISOString().slice(0, 10),
    ),
  ];
}

const monthLabel = (firstOfMonth: string, locale: Locale) =>
  formatMonth(firstOfMonth, locale, true);

const formatFullDate = (isoDate: string, locale: Locale) => formatDay(isoDate, locale);

const CELL_RADIUS = 16;
/** `gap-1.5` between cells, as a share of the row each cell has to give up. */
const CELL_GAP = 6;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8 },
  heading: { flex: 1 },
  monthBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 8,
    paddingBottom: 4,
  },
  monthLabel: { minWidth: 144, textAlign: 'center' },
  chevron: { padding: 10 },
  page: { paddingHorizontal: 16, paddingTop: 16, gap: 24 },
  loadingGrid: { height: 320, borderRadius: 24 },
  card: { borderWidth: 2, borderRadius: 24, padding: 12 },
  week: { flexDirection: 'row', marginBottom: 4 },
  weekday: { flex: 1, textAlign: 'center', paddingVertical: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  /*
   * Seven to a row without a `gap`, because a wrapping row of percentage-width
   * children plus a gap overflows by the gap on the last column. The spacing is
   * padding *inside* each seventh instead, which lands the cells in the same
   * places and lets the row add up to exactly 100%.
   */
  cell: { width: '14.2857%', aspectRatio: 1, padding: CELL_GAP / 2 },
  cellFace: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: CELL_RADIUS,
  },
  cellNumber: { fontFamily: font.bold, fontSize: 13, lineHeight: 16 },
  burnDot: { position: 'absolute', bottom: 4, width: 6, height: 6, borderRadius: 3 },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    columnGap: 12,
    paddingHorizontal: 4,
    marginTop: 14,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 10, height: 10, borderRadius: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  detail: { paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  detailHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, columnGap: 12 },
  nothing: { paddingHorizontal: 16, paddingVertical: 24, textAlign: 'center' },
  centred: { textAlign: 'center' },
});
