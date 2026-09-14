import { useEffect, useMemo, useRef } from 'react';
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
 * Three weeks, ending at today, scrolled to the end on arrival — further back
 * than that is what the calendar behind the date is for. A day already chosen
 * from the calendar that is older than the strip widens it, so the strip never
 * shows a selection it cannot draw.
 *
 * Tomorrow is not in it. There is no future to log against, and the arrow that
 * refused to step past today is now simply the edge of the row.
 */
const SPAN = 21;

export function DateStrip({
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

  const days = useMemo(() => {
    const back = Math.max(SPAN - 1, daysBetween(selected, today) + 3);
    return Array.from({ length: back + 1 }, (_, i) => shift(today, i - back));
  }, [today, selected]);

  useEffect(() => {
    // After layout, and without animation: arriving on Today should find the
    // strip already at today, not watch it travel there.
    const timer = setTimeout(() => scroll.current?.scrollToEnd({ animated: false }), 0);
    return () => clearTimeout(timer);
  }, [days.length]);

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
    >
      {days.map((iso) => {
        const on = iso === selected;
        const isToday = iso === today;
        return (
          <Pressable
            key={iso}
            onPress={() => {
              if (on) return;
              haptics.selected();
              onSelect(iso);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={isToday ? tr('today.title') : longDay(iso, locale)}
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
              {weekday(iso, locale)}
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
}

function shift(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

const weekday = (iso: string, locale: Locale) =>
  new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`));

const longDay = (iso: string, locale: Locale) =>
  new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(
    new Date(`${iso}T12:00:00Z`),
  );

const styles = StyleSheet.create({
  scroller: { marginVertical: -12 },
  row: { gap: 8, paddingHorizontal: 18, paddingVertical: 12 },
  day: {
    width: 46,
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
