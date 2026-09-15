import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Calendar, CalendarDay, Locale } from '@ct/shared';
import { formatBodyWeight, formatDay, formatMonth, formatNumber, weekdayName } from '@ct/shared';
import { Chunk } from '@/components/Chunk';
import { InsetGroup } from '@/components/InsetGroup';
import { Chevron, GlassPill, ScreenGround, ScreenHeader } from '@/components/ScreenHeader';
import { Skeleton } from '@/components/Skeleton';
import { Glossy } from '@/components/icons/Glossy';
import { Character } from '@/components/cast/Character';
import { api } from '@/lib/api';
import { haptics } from '@/lib/haptics';
import { useUnits } from '@/lib/units';
import { font, type as t, tint, useColors, useType, type Palette } from '@/theme';
import { useLocale, useT } from '@/lib/i18n';
import { messageOf } from '@/lib/errors';

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
 *
 * **Under the hour's sky, like the day it is reached from** (GLOW-UP.md). The
 * cells speak the date strip's language — a lit green day for the one chosen,
 * a dot under today — so stepping from the strip into the month reads as the
 * same row of days opening out, not as a different screen's widget. And Plum,
 * who keeps the evenings and the look back (CAST.md), sits on the month.
 */

/** Monday first, as `monthGrid` lays the days out; 0 is Sunday in `weekdayName`. */
const WEEK = [1, 2, 3, 4, 5, 6, 0];

export default function HistoryScreen() {
  const locale = useLocale();
  const tr = useT();
  const colors = useColors();
  const type = useType();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const units = useUnits();

  // Month cursor as a first-of-month ISO date, so all arithmetic is on dates
  // rather than on a Date object in some ambient timezone.
  const [month, setMonth] = useState<string | null>(null);
  const [today, setToday] = useState<string | null>(null);
  const [calendar, setCalendar] = useState<Calendar | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        // Anchor on the server's idea of today: it honours day_start_hour, so a
        // 1am snack belongs to the evening before here as everywhere else.
        const day = await api.day();
        setToday(day.local_date);
        setMonth(`${day.local_date.slice(0, 7)}-01`);
        setSelected(day.local_date);
      } catch (e) {
        setError(messageOf(e, tr));
      }
    })();
  }, []);

  const load = useCallback(async (firstOfMonth: string) => {
    try {
      setCalendar(await api.calendar(firstOfMonth, endOfMonth(firstOfMonth)));
      setError(null);
    } catch (e) {
      setError(messageOf(e, tr));
    }
  }, []);

  useEffect(() => {
    if (month) void load(month);
  }, [month, load]);

  const byDate = useMemo(
    () => new Map((calendar?.days ?? []).map((day) => [day.local_date, day])),
    [calendar],
  );

  // `narrow` is one letter in English and whatever this language's calendar
  // prints — "П" three times over in Bulgarian — never an English array.
  const weekdays = useMemo(() => WEEK.map((day) => weekdayName(day, locale, 'narrow')), [locale]);
  const cells = useMemo(() => (month ? monthGrid(month) : []), [month]);
  const selectedDay = selected ? byDate.get(selected) : undefined;
  const logged = (calendar?.days ?? []).filter((d) => d.logged);
  // A month that has not started has nothing to page forward to.
  const atLatest = Boolean(month && today && month >= `${today.slice(0, 7)}-01`);

  return (
    <ScreenGround>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.page, { paddingBottom: insets.bottom + 32 }]}
      >
        <ScreenHeader title={tr('history.title')} />

        {!calendar || !month ? (
          <Skeleton style={styles.loadingGrid} />
        ) : (
          <>
            {/* Plum sits on the month, legs over its top edge, in room the card
                keeps free above the weekday letters (CAST.md). */}
            <View style={styles.shelf}>
              <Chunk
                radius={28}
                contentStyle={[styles.card, { backgroundColor: colors.card, borderColor: colors.hairline }]}
              >
                {/* The month, on the card it pages rather than on the sky: down
                    where the sky has faded to haze, light ink on it disappeared. */}
                <View style={styles.monthBar}>
                  <Text numberOfLines={1} style={[type.title2, styles.monthLabel, { color: colors.foreground }]}>
                    {monthLabel(month, locale)}
                  </Text>
                  <GlassPill
                    label=""
                    icon={<Chevron direction="back" color={colors.foreground} />}
                    accessibilityLabel={tr('history.previousMonth')}
                    onSky={false}
                    onPress={() => {
                      haptics.selected();
                      setMonth((m) => (m ? shiftMonth(m, -1) : m));
                    }}
                  />
                  <View style={{ opacity: atLatest ? 0.35 : 1 }} pointerEvents={atLatest ? 'none' : 'auto'}>
                    <GlassPill
                      label=""
                      icon={<Chevron direction="forward" color={colors.foreground} />}
                      accessibilityLabel={tr('history.nextMonth')}
                      onSky={false}
                      onPress={() => {
                        haptics.selected();
                        setMonth((m) => (m ? shiftMonth(m, 1) : m));
                      }}
                    />
                  </View>
                </View>
                <View style={styles.week}>
                  {weekdays.map((label, i) => (
                    <Text
                      key={i}
                      style={[t.footnoteBold, styles.weekday, { color: colors.mutedForeground }]}
                    >
                      {label.toLocaleUpperCase()}
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
                        isToday={date === today}
                        future={today !== null && date > today}
                        onSelect={() => {
                          if (date === selected) return;
                          haptics.selected();
                          setSelected(date);
                        }}
                      />
                    ),
                  )}
                </View>

                <Legend />
              </Chunk>
              <View pointerEvents="box-none" style={styles.sitter}>
                <Character name="plum" mood="sit" size={SITTER} />
              </View>
            </View>

            <InsetGroup
              title={selected ? formatFullDate(selected, locale) : tr('history.day')}
              icon={<Glossy name="plate" size={18} />}
            >
              {selectedDay && selectedDay.logged ? (
                <View style={styles.detail}>
                  <View style={styles.detailHead}>
                    <Text style={[type.serifFigure, styles.detailFigure, t.tnum, { color: colors.foreground }]}>
                      {formatNumber(selectedDay.kcal, locale)}
                    </Text>
                    <Text style={[t.footnoteSemibold, { color: colors.mutedForeground }]}>
                      {tr('today.ofTargetKcal')(formatNumber(selectedDay.target_kcal, locale) || '—')}
                    </Text>
                  </View>

                  {selectedDay.target_kcal > 0 && (
                    <Capsule ratio={selectedDay.kcal / selectedDay.target_kcal} />
                  )}

                  <View style={styles.facts}>
                    <Fact
                      text={tr('history.proteinGrams')(formatNumber(selectedDay.protein_g, locale))}
                      dot={colors.protein}
                    />
                    {selectedDay.burned_kcal > 0 && (
                      <Fact
                        text={tr('journal.burned')(formatNumber(selectedDay.burned_kcal, locale))}
                        dot={colors.exercise}
                        ink={colors.exerciseText}
                      />
                    )}
                    {selectedDay.weight_kg !== null && (
                      <Fact text={formatBodyWeight(selectedDay.weight_kg, units)} dot={colors.logoRamp} />
                    )}
                  </View>

                  <Pressable
                    // `navigate`, not `push`: Today is already down the stack, and
                    // pushing would stack a second copy of it behind this one.
                    onPress={() => router.navigate({ pathname: '/today', params: { date: selected! } })}
                    accessibilityRole="button"
                    hitSlop={8}
                    style={({ pressed }) => [
                      styles.open,
                      { backgroundColor: colors.caloriesWash, opacity: pressed ? 0.6 : 1 },
                    ]}
                  >
                    <Text style={[t.footnoteBold, { color: colors.caloriesText }]}>{tr('history.openInToday')}</Text>
                  </Pressable>
                </View>
              ) : (
                <Text style={[t.body, styles.nothing, { color: colors.mutedForeground }]}>
                  {selectedDay ? tr('history.nothingThatDay') : tr('history.nothingYet')}
                </Text>
              )}
            </InsetGroup>

            <InsetGroup title={tr('history.thisMonth')} icon={<Glossy name="calendar" size={18} />}>
              <View style={styles.stats}>
                <MonthStat label={tr('history.logged')} value={`${logged.length}`} unit={tr('history.days')} first />
                <MonthStat
                  label={tr('history.avgIntake')}
                  value={
                    logged.length === 0
                      ? '—'
                      : formatNumber(
                          Math.round(logged.reduce((sum, d) => sum + d.kcal, 0) / logged.length),
                          locale,
                        )
                  }
                  unit="kcal"
                />
                <MonthStat
                  label={tr('history.onTarget')}
                  value={`${logged.filter((d) => d.target_kcal > 0 && d.kcal <= d.target_kcal).length}`}
                  unit={tr('history.days')}
                />
              </View>
            </InsetGroup>
          </>
        )}

        {error && (
          <Text style={[t.footnoteSemibold, styles.centred, { color: colors.destructive }]}>
            {error}
          </Text>
        )}
      </ScrollView>
    </ScreenGround>
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
 *
 * The chosen day is the date strip's: the green, lit from above, with the
 * figure in white. Today wears the strip's dot under its number, in whatever
 * state it is in.
 */
function DayCell({
  date,
  day,
  selected,
  isToday,
  future,
  onSelect,
}: {
  date: string;
  day: CalendarDay | undefined;
  selected: boolean;
  isToday: boolean;
  future: boolean;
  onSelect: () => void;
}) {
  const colors = useColors();
  const type = useType();
  const locale = useLocale();
  const logged = day?.logged ?? false;
  const ratio = logged && day!.target_kcal > 0 ? day!.kcal / day!.target_kcal : null;
  const fill = toneFor(colors, logged ? ratio : undefined);
  const ink = selected ? '#ffffff' : logged ? colors.foreground : colors.mutedForeground;

  const label = logged
    ? `${formatFullDate(date, locale)}, ${day!.kcal} kcal${
        day!.target_kcal > 0 ? ` of ${day!.target_kcal}` : ''
      }`
    : `${formatFullDate(date, locale)}, nothing logged`;

  return (
    <View style={styles.cell}>
      <Pressable
        onPress={onSelect}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected }}
        style={({ pressed }) => [
          styles.cellFace,
          selected
            ? {
                experimental_backgroundImage: `linear-gradient(180deg, ${colors.calories}, ${colors.caloriesDeep})`,
                boxShadow: `0px 8px 18px -8px ${colors.calories}, inset 0px 1px 0px rgba(255,255,255,0.55)`,
              }
            : fill
              ? { backgroundColor: fill, boxShadow: `inset 0px 1px 0px ${colors.glassEdge}` }
              : null,
          { opacity: pressed && !selected ? 0.7 : future && !selected ? 0.4 : 1 },
        ]}
      >
        <Text style={[type.serifFigure, t.tnum, styles.cellNumber, { color: ink }]}>
          {Number(date.slice(8))}
        </Text>
        <View style={[styles.todayDot, { backgroundColor: ink, opacity: isToday ? 0.9 : 0 }]} />
        {logged && day!.burned_kcal > 0 && (
          <View
            style={[
              styles.burnDot,
              { backgroundColor: colors.exercise, borderColor: selected ? '#ffffff' : colors.card },
            ]}
          />
        )}
      </Pressable>
    </View>
  );
}

/**
 * The fill for one day, as a wash of the page's own colours rather than a
 * swatch of its own.
 *
 * These used to be opaque OKLCH mixes precomputed against the card, faithful to
 * the web's `color-mix` — which is also what made the dark month drift olive.
 * On the lit card a wash does the same job in both themes: the green deepens as
 * the day gets closer to its target, and over target steps to ink rather than
 * to red, because a month grid is exactly where a wall of red squares would
 * read as a verdict on the person rather than on the data.
 *
 * `undefined` is nothing logged, and gets no fill at all. `null` is logged
 * against no target: neutral rather than absent — it happened, there is just
 * nothing to grade it against.
 */
function toneFor(colors: Palette, ratio: number | null | undefined): string | null {
  if (ratio === undefined) return null;
  if (ratio === null) return colors.muted;
  if (ratio > 1.05) return tint(colors.foreground, 0.16);
  if (ratio >= 0.85) return tint(colors.calories, 0.36);
  if (ratio >= 0.6) return tint(colors.calories, 0.2);
  return tint(colors.calories, 0.1);
}

function Legend() {
  const colors = useColors();
  const tr = useT();
  const swatches: Array<{ label: string; ratio: number | null }> = [
    { label: tr('history.under'), ratio: 0.5 },
    { label: tr('history.onTarget'), ratio: 0.95 },
    { label: tr('history.over'), ratio: 1.2 },
    // Logged before any target existed — see toneFor.
    { label: tr('history.noTarget'), ratio: null },
  ];

  return (
    <View style={[styles.legend, { borderTopColor: colors.hairline }]}>
      {swatches.map(({ label, ratio }) => (
        <View key={label} style={styles.legendItem}>
          <View style={[styles.swatch, { backgroundColor: toneFor(colors, ratio) ?? 'transparent' }]} />
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

/** The day against its target, as one of Today's glowing capsules. */
function Capsule({ ratio }: { ratio: number }) {
  const colors = useColors();
  const over = ratio > 1.05;
  return (
    <View style={[styles.capsule, { backgroundColor: colors.muted }]}>
      <View
        style={[
          styles.capsuleFill,
          {
            width: `${Math.round(Math.min(1, Math.max(0.04, ratio)) * 100)}%`,
            backgroundColor: over ? colors.foreground : colors.primary,
            experimental_backgroundImage: over ? undefined : colors.primaryRamp,
            boxShadow: over ? undefined : `0px 4px 10px -4px ${colors.calories}`,
          },
        ]}
      />
    </View>
  );
}

function Fact({ text, dot, ink }: { text: string; dot: string; ink?: string }) {
  const colors = useColors();
  return (
    <View style={[styles.fact, { backgroundColor: colors.muted }]}>
      <View style={[styles.factDot, { backgroundColor: dot }]} />
      <Text style={[t.footnoteSemibold, t.tnum, { color: ink ?? colors.foreground }]}>{text}</Text>
    </View>
  );
}

/** A month's figure, divided from its neighbour by a hairline rather than a rule. */
function MonthStat({ label, value, unit, first }: { label: string; value: string; unit: string; first?: boolean }) {
  const colors = useColors();
  const type = useType();
  return (
    <View style={[styles.stat, first ? null : { borderLeftWidth: 1, borderLeftColor: colors.hairline }]}>
      <Text style={[t.footnoteSemibold, styles.centred, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[type.serifFigure, t.tnum, styles.statValue, { color: colors.foreground }]}>
        {value}
        {value !== '—' && unit !== '' && (
          <Text style={[styles.statUnit, { color: colors.mutedForeground }]}> {unit}</Text>
        )}
      </Text>
    </View>
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

/** Plum's size on the month, and how far its legs hang over the card's top edge. */
const SITTER = 44;
const OVERHANG = 10;

const CELL_RADIUS = 14;
/** The gap between cells, as padding inside each seventh of the row. */
const CELL_GAP = 5;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  page: { paddingHorizontal: 16, gap: 24 },
  monthBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 6,
    marginTop: 6,
    marginBottom: 10,
  },
  monthLabel: { flex: 1 },
  loadingGrid: { height: 360, borderRadius: 28 },
  shelf: { paddingTop: SITTER - OVERHANG },
  // Over the middle of the month's name row rather than its buttons, so its
  // legs hang into padding and never over a control.
  sitter: { position: 'absolute', top: 0, right: '38%' },
  card: { borderWidth: 1, borderRadius: 28, paddingHorizontal: 10, paddingTop: 16, paddingBottom: 14 },
  week: { flexDirection: 'row', marginBottom: 2 },
  weekday: { flex: 1, textAlign: 'center', paddingVertical: 4, fontSize: 11, letterSpacing: 0.3 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  /*
   * Seven to a row without a `gap`, because a wrapping row of percentage-width
   * children plus a gap overflows by the gap on the last column. The spacing is
   * padding *inside* each seventh instead, which lands the cells in the same
   * places and lets the row add up to exactly 100%.
   */
  cell: { width: '14.2857%', aspectRatio: 0.9, padding: CELL_GAP / 2 },
  cellFace: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: CELL_RADIUS,
  },
  cellNumber: { fontSize: 16, lineHeight: 20 },
  todayDot: { width: 4, height: 4, borderRadius: 2, marginTop: 2 },
  burnDot: { position: 'absolute', top: 4, right: 4, width: 7, height: 7, borderRadius: 4, borderWidth: 1 },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    columnGap: 12,
    paddingHorizontal: 6,
    paddingTop: 12,
    marginTop: 10,
    borderTopWidth: 1,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 12, height: 12, borderRadius: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  detail: { paddingHorizontal: 16, paddingVertical: 16, gap: 12 },
  detailHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  detailFigure: { fontSize: 36, lineHeight: 42 },
  capsule: { height: 10, borderRadius: 999, overflow: 'hidden' },
  capsuleFill: { height: '100%', borderRadius: 999 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  fact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  factDot: { width: 7, height: 7, borderRadius: 4 },
  open: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, marginTop: 2 },
  nothing: { paddingHorizontal: 16, paddingVertical: 24, textAlign: 'center' },
  stats: { flexDirection: 'row' },
  stat: { flex: 1, paddingHorizontal: 10, paddingVertical: 14, alignItems: 'center', gap: 2 },
  statValue: { fontSize: 22, lineHeight: 28 },
  statUnit: { fontFamily: font.semibold, fontSize: 12, lineHeight: 16 },
  centred: { textAlign: 'center' },
});
