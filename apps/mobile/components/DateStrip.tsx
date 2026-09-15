import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Locale } from '@ct/shared';
import { haptics } from '@/lib/haptics';
import { useLocale, useT } from '@/lib/i18n';
import { font, useTheme, useType } from '@/theme';

/**
 * The days, as a strip you can run a thumb along.
 *
 * It replaces the arrows either side of the date. Those still exist on the
 * compact bar and the swipe still works, but a row of days does something the
 * arrows could not: it shows the week before you step into it, and any day in
 * it is one tap rather than a tap per day (GLOW-UP.md, "nothing lost").
 *
 * Three weeks, ending at today, scrolled to the chosen day on arrival — which
 * is the end, most of the time — and further back than that is what the
 * calendar behind the date is for. A day already chosen from the calendar that
 * is older than the strip widens it, so the strip never shows a selection it
 * cannot draw.
 *
 * Tomorrow is not in it. There is no future to log against, and the arrow that
 * refused to step past today is now simply the edge of the row.
 */
const SPAN = 21;
const CELL = 46;
const GAP = 8;
const INSET = 18;

/**
 * Memoised, because it sits in the header of the busiest screen in the app and
 * every fetch, sync and keystroke on Today would otherwise redraw all of it.
 */
export const DateStrip = memo(function DateStrip({
  today,
  selected,
  onSelect,
  onSky,
}: {
  /** The account's today, as `YYYY-MM-DD`. */
  today: string;
  selected: string;
  onSelect: (isoDate: string) => void;
  /** The sky above is dark enough that resting labels need light ink. */
  onSky: 'light' | 'dark';
}) {
  const locale = useLocale();
  const tr = useT();
  const type = useType();
  const { colors } = useTheme();
  const scroll = useRef<ScrollView>(null);

  /*
   * The day just tapped, marked straight away rather than when Today has
   * redrawn around it — which is a whole screen's render later, and was the
   * gap that made a tap feel like it had not landed. Only while `selected` is
   * still what it was when tapped; the moment it moves, it is the truth again.
   * And not for ever: a change that never lands (a swipe that overruled it)
   * must not leave the wrong day marked.
   */
  const [tapped, setTapped] = useState<{ iso: string; over: string } | null>(null);
  const chosen = tapped && tapped.over === selected ? tapped.iso : selected;
  useEffect(() => {
    if (!tapped) return;
    const expire = setTimeout(() => setTapped(null), 1500);
    return () => clearTimeout(expire);
  }, [tapped]);

  const back = Math.max(SPAN - 1, daysBetween(selected, today) + 3);
  const days = useMemo(
    () => Array.from({ length: back + 1 }, (_, i) => shift(today, i - back)),
    [today, back],
  );
  /*
   * The words, worked out once per row rather than per render. Two formatted
   * dates a cell over three weeks was forty-two trips through `Intl` every time
   * the selection moved, and on Android that alone was most of the wait
   * between tapping a day and seeing it chosen.
   */
  const labels = useMemo(
    () =>
      days.map((iso) => ({
        iso,
        weekday: formatter(locale, 'weekday').format(noon(iso)),
        long: formatter(locale, 'long').format(noon(iso)),
      })),
    [days, locale],
  );

  /*
   * Where the row is and how wide the window onto it is, kept off React state:
   * they are read only to decide whether to scroll, never to draw.
   */
  const offset = useRef(0);
  const viewport = useRef(0);
  const contentWidth = useRef(0);

  /**
   * Brings the chosen day into view, centred where the row allows — which for
   * today is flush against the end. Left alone when it is already comfortably
   * in view, unless `always`.
   *
   * This used to be a `scrollToEnd` on every content-size change, and that
   * fires for more than the row widening; a thumb that had run back through
   * the week to pick a Tuesday had the row thrown back to today under it.
   */
  const reveal = (animated: boolean, always: boolean) => {
    const width = viewport.current;
    const index = days.indexOf(selected);
    if (!width || !contentWidth.current || index < 0) return;
    const left = INSET + index * (CELL + GAP);
    if (!always && left >= offset.current + INSET && left + CELL <= offset.current + width - INSET) return;
    const end = Math.max(0, contentWidth.current - width);
    const x = Math.min(end, Math.max(0, left + CELL / 2 - width / 2));
    offset.current = x;
    scroll.current?.scrollTo({ x, animated });
  };

  /*
   * A day chosen somewhere else — the swipe, the arrows, "back to today" — that
   * has left the part of the row on screen. A tap on the row is always in view
   * already, so it moves nothing.
   */
  useEffect(() => {
    reveal(true, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);


  const ink = onSky === 'dark' ? colors.skyInk : colors.foreground;

  return (
    <ScrollView
      ref={scroll}
      horizontal
      showsHorizontalScrollIndicator={false}
      /* Room above and below for the chosen day's glow, which a horizontal
         scroller would otherwise clip flat at its own edges. */
      style={styles.scroller}
      contentContainerStyle={styles.row}
      scrollEventThrottle={32}
      onScroll={(event) => {
        offset.current = event.nativeEvent.contentOffset.x;
      }}
      onLayout={(event) => {
        const first = viewport.current === 0;
        viewport.current = event.nativeEvent.layout.width;
        if (first) reveal(false, true);
      }}
      /*
       * Placed once the row is measured, and again only if its width really
       * changed — on arrival, and when a day from the calendar widens it — and
       * without animation: arriving on Today should find the strip already at
       * today, not watch it travel there. A timer after mount fired before the
       * row was measured and left it parked three weeks back.
       */
      onContentSizeChange={(width) => {
        if (width === contentWidth.current) return;
        contentWidth.current = width;
        reveal(false, true);
      }}
    >
      {labels.map(({ iso, weekday, long }) => {
        const on = iso === chosen;
        const isToday = iso === today;
        return (
          <Pressable
            key={iso}
            onPress={() => {
              if (on) return;
              haptics.selected();
              setTapped({ iso, over: selected });
              onSelect(iso);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={isToday ? tr('today.title') : long}
            style={({ pressed }) => [
              styles.day,
              on
                ? {
                    experimental_backgroundImage: `linear-gradient(180deg, ${colors.calories}, ${colors.caloriesDeep})`,
                    boxShadow: `0px 10px 22px -10px ${colors.calories}, inset 0px 1px 0px rgba(255,255,255,0.55)`,
                  }
                : {
                    backgroundColor: onSky === 'dark' ? 'rgba(255,255,255,0.10)' : colors.glass,
                    boxShadow: `inset 0px 1px 0px ${colors.glassEdge}`,
                  },
              { opacity: pressed && !on ? 0.7 : 1 },
            ]}
          >
            <Text
              style={[
                styles.weekday,
                { color: on ? '#ffffff' : ink, opacity: on ? 0.85 : 0.7 },
              ]}
              numberOfLines={1}
            >
              {weekday}
            </Text>
            <Text style={[type.serifFigure, styles.date, { color: on ? '#ffffff' : ink }]}>
              {Number(iso.slice(8, 10))}
            </Text>
            <View style={[styles.dot, { backgroundColor: on ? '#ffffff' : ink, opacity: isToday ? 0.9 : 0 }]} />
          </Pressable>
        );
      })}
    </ScrollView>
  );
});

function shift(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

const noon = (iso: string) => new Date(`${iso}T12:00:00Z`);

/** One formatter per locale and shape, for the life of the app. */
const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(locale: Locale, shape: 'weekday' | 'long'): Intl.DateTimeFormat {
  const key = `${locale}:${shape}`;
  let found = formatters.get(key);
  if (!found) {
    found = new Intl.DateTimeFormat(
      locale,
      shape === 'weekday'
        ? { weekday: 'short', timeZone: 'UTC' }
        : { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' },
    );
    formatters.set(key, found);
  }
  return found;
}

const styles = StyleSheet.create({
  scroller: { marginVertical: -12 },
  row: { gap: GAP, paddingHorizontal: INSET, paddingVertical: 12 },
  day: {
    width: CELL,
    height: 64,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  weekday: { fontFamily: font.extrabold, fontSize: 10.5, lineHeight: 13, textTransform: 'uppercase', letterSpacing: 0.3 },
  date: { fontSize: 19, lineHeight: 23 },
  dot: { width: 4, height: 4, borderRadius: 2, marginTop: 2 },
});
