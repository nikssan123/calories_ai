import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { type as t, useColors, useType, withAlpha } from '@/theme';

/**
 * The birthday wheel, drawn rather than delegated — for Android.
 *
 * iOS keeps `DateTimePicker display="spinner"`, which renders inline, in the
 * system's own type, and looks like it belongs in the screen. Android has no
 * inline mode at all: the same component is always a dialog, so the walk had to
 * put a card on the page whose only job was to open one, and what opened was a
 * Material dialog in Material's colours, chrome and buttons — a different app
 * arriving over the top of this one, on the question before the screen that
 * already loses the most people.
 *
 * So Android gets this instead: three snapping columns on the page, in the
 * app's ink and the app's spacing, sitting where the iOS spinner sits. Nothing
 * opens, nothing has to be dismissed, and the answer is visible while it is
 * being given.
 *
 * ---- The parts that are not obvious ---------------------------------------
 *
 * **The column order is the reader's, not this file's.** `Intl.DateTimeFormat`
 * is asked how it would lay a date out in their language and the columns are
 * built in that order, so a Bulgarian reader gets day-month-year and an
 * American month-day-year, which is what both of them would get from the OS.
 *
 * **The month is a name, never a number.** A three-wide row of digits is a
 * puzzle about which column is which; the month names make the order legible
 * without a single label.
 *
 * **Snapping is the interaction.** `snapToInterval` at one row means the wheel
 * cannot come to rest between two values, so there is no "which one is it"
 * state to read or to report — the offset divided by the row height is the
 * answer, always a whole number.
 */

/** One row, and how many are on screen. Odd, so there is a middle. */
const ROW = 40;
const VISIBLE = 5;
const PAD = ((VISIBLE - 1) / 2) * ROW;

type Part = 'day' | 'month' | 'year';

export function DateWheel({
  value,
  min,
  max,
  locale,
  onChange,
  label,
}: {
  /** `YYYY-MM-DD`, or null for nothing picked yet. */
  value: string | null;
  min: Date;
  max: Date;
  locale: string;
  onChange: (next: string) => void;
  /** Read out for the whole control; the columns name themselves. */
  label: string;
}) {
  const colors = useColors();

  /*
   * What the wheels are showing. Seeded from `value`, or from a date in the
   * middle of the allowed range when there is none — the epoch would be a
   * hundred and twenty spins away from anybody's birthday.
   */
  const initial = useMemo(() => {
    if (value) {
      const [y, m, d] = value.split('-').map(Number);
      if (y && m && d) return { year: y, month: m - 1, day: d };
    }
    return { year: 1995, month: 0, day: 1 };
  }, [value]);

  const [year, setYear] = useState(initial.year);
  const [month, setMonth] = useState(initial.month);
  const [day, setDay] = useState(initial.day);

  /*
   * Whether a wheel has actually been moved.
   *
   * Without it this control answers its own question: it mounts showing a date,
   * reports it, and Continue goes live on a birthday nobody chose — which is a
   * worse trade here than on the height boxes two screens later, because age
   * moves the burn calculation and 1 January 1995 is not a median, it is a
   * placeholder. iOS's spinner behaves exactly this way (it shows a date and
   * leaves `birthDate` null until it is touched), and the two platforms have to
   * agree about when a question counts as answered.
   *
   * A date already on the draft counts as touched: it was answered on an
   * earlier pass, and coming back through Back must not un-answer it.
   */
  const [touched, setTouched] = useState(value !== null);

  const years = useMemo(() => {
    const first = min.getFullYear();
    const last = max.getFullYear();
    return Array.from({ length: last - first + 1 }, (_, i) => first + i);
  }, [min, max]);

  const months = useMemo(() => {
    const format = new Intl.DateTimeFormat(locale, { month: 'long' });
    // The twelfth of each month, so no zone can roll the name onto its
    // neighbour, and a fixed non-leap year because only the name is read.
    return Array.from({ length: 12 }, (_, m) => format.format(new Date(2001, m, 12)));
  }, [locale]);

  /* February is 28 or 29 and nothing else in here knows that but the calendar. */
  const daysInMonth = useMemo(() => new Date(year, month + 1, 0).getDate(), [year, month]);
  const days = useMemo(
    () => Array.from({ length: daysInMonth }, (_, i) => String(i + 1)),
    [daysInMonth],
  );

  /*
   * A day that no longer exists is pulled back to the last one that does — 31
   * January, then February. Done here rather than in the column so the wheel
   * and the answer can never disagree about it.
   */
  useEffect(() => {
    if (day > daysInMonth) setDay(daysInMonth);
  }, [day, daysInMonth]);

  /* Report only a date inside the bounds, only real ones, and only once asked. */
  useEffect(() => {
    if (!touched) return;
    const picked = new Date(year, month, Math.min(day, daysInMonth));
    if (picked < min || picked > max) return;
    onChange(
      `${picked.getFullYear()}-${String(picked.getMonth() + 1).padStart(2, '0')}-${String(
        picked.getDate(),
      ).padStart(2, '0')}`,
    );
  }, [touched, year, month, day, daysInMonth, min, max, onChange]);

  /*
   * How this reader's language writes a date. `formatToParts` answers with the
   * literals in it too — the slashes and spaces — which are dropped; what is
   * left is the three fields in their order.
   */
  const order = useMemo<Part[]>(() => {
    try {
      const parts = new Intl.DateTimeFormat(locale, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
        .formatToParts(new Date(2001, 0, 12))
        .map((p) => p.type)
        .filter((type): type is Part => type === 'day' || type === 'month' || type === 'year');
      return parts.length === 3 ? parts : ['day', 'month', 'year'];
    } catch {
      return ['day', 'month', 'year'];
    }
  }, [locale]);

  /** Every column reports through here, so this is the one place that learns it. */
  const moved = useCallback(
    (set: (index: number) => void) => (index: number) => {
      setTouched(true);
      set(index);
    },
    [],
  );

  const columns: Record<Part, { values: string[]; index: number; set: (i: number) => void; flex: number }> = {
    day: { values: days, index: Math.min(day, daysInMonth) - 1, set: moved((i) => setDay(i + 1)), flex: 2 },
    month: { values: months, index: month, set: moved(setMonth), flex: 4 },
    year: {
      values: years.map(String),
      index: years.indexOf(year),
      set: moved((i) => setYear(years[i]!)),
      flex: 3,
    },
  };

  return (
    <View accessibilityLabel={label} style={styles.wrap}>
      {/* The band the answer sits in, behind the columns and across all of
          them: one object saying "this row is the one", rather than three. */}
      <View
        pointerEvents="none"
        style={[
          styles.band,
          { top: PAD, height: ROW, backgroundColor: withAlpha(colors.mutedForeground, 0.12) },
        ]}
      />
      {order.map((part) => {
        const column = columns[part];
        return (
          <Column
            key={part}
            values={column.values}
            index={column.index}
            onIndex={column.set}
            flex={column.flex}
            align={part === 'day' ? 'flex-end' : part === 'year' ? 'flex-start' : 'center'}
          />
        );
      })}
    </View>
  );
}

function Column({
  values,
  index,
  onIndex,
  flex,
  align,
}: {
  values: string[];
  index: number;
  onIndex: (next: number) => void;
  flex: number;
  align: 'flex-start' | 'center' | 'flex-end';
}) {
  const colors = useColors();
  const type = useType();
  const ref = useRef<ScrollView>(null);
  /*
   * The row this column has settled on, as far as the *view* is concerned.
   *
   * Kept beside the prop rather than derived from it because the two move at
   * different times: a scroll changes this first and the prop a render later,
   * and an effect that scrolled whenever they differed would fight the finger
   * that is still on the glass.
   */
  const settled = useRef(index);
  /** Whether the first, un-animated scroll into position has happened yet. */
  const placed = useRef(false);

  useEffect(() => {
    if (settled.current === index) return;
    settled.current = index;
    ref.current?.scrollTo({ y: index * ROW, animated: true });
  }, [index]);

  /*
   * The opening position is scrolled to on layout rather than declared with
   * `contentOffset`.
   *
   * `contentOffset` is an iOS prop that React Native polyfills on Android by
   * scrolling after mount, and the polyfill re-applies as the view settles —
   * which on a column narrow enough to lay out a frame later than its
   * neighbours means a drag can be undone by a scroll the component asked for
   * before the finger arrived. Doing it once, here, from a flag that cannot be
   * set twice, is the same opening position and nothing afterwards.
   */
  const place = useCallback(() => {
    if (placed.current) return;
    placed.current = true;
    ref.current?.scrollTo({ y: settled.current * ROW, animated: false });
  }, []);

  const rest = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const landed = Math.round(event.nativeEvent.contentOffset.y / ROW);
      const clamped = Math.max(0, Math.min(values.length - 1, landed));
      if (clamped === settled.current) return;
      settled.current = clamped;
      onIndex(clamped);
    },
    [onIndex, values.length],
  );

  return (
    <ScrollView
      ref={ref}
      style={{ flex, height: ROW * VISIBLE }}
      contentContainerStyle={{ paddingVertical: PAD }}
      onContentSizeChange={place}
      showsVerticalScrollIndicator={false}
      /*
       * Without this the wheel cannot be spun at all, and it is the one prop
       * that says so. The step this sits on is itself a vertical ScrollView, and
       * Android hands a vertical drag to the outer scroller unless the inner one
       * has opted in — so every swipe went to the page (which had nothing to
       * scroll) and the columns sat still while tapping a row still worked. It
       * is an Android-only prop and inert on iOS, which never had the problem.
       */
      nestedScrollEnabled
      snapToInterval={ROW}
      decelerationRate="fast"
      /* Both, because only one of them fires: a flick ends in momentum, a slow
         drag released at rest ends in neither, and Android reports the two
         differently from iOS. `settled` makes the duplicate harmless. */
      onMomentumScrollEnd={rest}
      onScrollEndDrag={rest}
    >
      {values.map((text, i) => {
        const away = Math.abs(i - index);
        return (
          <Pressable
            key={text}
            onPress={() => onIndex(i)}
            accessibilityRole="button"
            accessibilityLabel={text}
            style={[styles.row, { justifyContent: align }]}
          >
            <Text
              numberOfLines={1}
              style={[
                away === 0 ? type.serifTitle : t.body,
                {
                  color:
                    away === 0
                      ? colors.foreground
                      : withAlpha(colors.mutedForeground, away === 1 ? 0.75 : 0.4),
                },
              ]}
            >
              {text}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12 },
  band: { position: 'absolute', left: 0, right: 0, borderRadius: 12 },
  row: { height: ROW, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6 },
});
