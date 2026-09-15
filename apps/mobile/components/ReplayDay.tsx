import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOut, ZoomOut } from 'react-native-reanimated';
import type { FoodEntry, Locale } from '@ct/shared';
import { foodEmoji } from '@ct/shared/food-emoji';
import { dominant } from '@/components/cast/Presence';
import type { CastName } from '@/components/cast/Character';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { haptics } from '@/lib/haptics';
import { type as t, useColors } from '@/theme';

/**
 * Replay the day (CAST.md, fourth pass): hold Today's ring and the day's meals
 * drop into it in the order they were eaten, each with its time, while the ring
 * fills to where it is now and whoever each meal is mostly made of hops on the
 * shelf. A ten-second ritual for the evening; it is what the app's name
 * promises.
 *
 * It shows what happened and when, and grades nothing: no colours for over, no
 * words about the total.
 */

const STEP_MS = 900;

export interface Replay {
  /** The consumed figure the ring should show right now. */
  consumed: number;
  /** Who should hop on the shelf for the meal landing now, and a key to replay it. */
  hop: { name: CastName; key: number } | null;
  /** The meal dropping in now, for the overlay. */
  current: { key: string; emoji: string; time: string } | null;
  running: boolean;
}

export function useReplay(entries: FoodEntry[], total: number, locale: Locale, timezone: string | undefined) {
  const reduced = useReducedMotion();
  const ordered = useMemo(
    () => [...entries].sort((a, b) => a.eaten_at.localeCompare(b.eaten_at)),
    [entries],
  );
  const [step, setStep] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const start = () => {
    if (reduced || ordered.length === 0 || step !== null) return;
    haptics.selected();
    setStep(-1);
    const advance = (next: number) => {
      timer.current = setTimeout(() => {
        if (next >= ordered.length) {
          timer.current = setTimeout(() => setStep(null), 1200);
          return;
        }
        setStep(next);
        haptics.selected();
        advance(next + 1);
      }, next === 0 ? 450 : STEP_MS);
    };
    advance(0);
  };

  const time = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', timeZone: timezone || undefined }),
    [locale, timezone],
  );

  let replay: Replay = { consumed: total, hop: null, current: null, running: false };
  if (step !== null) {
    const upTo = ordered.slice(0, Math.max(0, step + 1));
    const entry = step >= 0 ? ordered[step] : undefined;
    replay = {
      consumed: upTo.reduce((sum, e) => sum + e.kcal, 0),
      hop: entry ? { name: dominant(entry), key: step } : null,
      current: entry
        ? { key: entry.id, emoji: foodEmoji(entry.description, entry.meal), time: time.format(new Date(entry.eaten_at)) }
        : null,
      running: true,
    };
  }
  return { replay, start };
}

/** The meal dropping into the ring: over the ring's top, never over its figure, and gone as it lands. */
export function ReplayDrop({ current }: { current: Replay['current'] }) {
  const colors = useColors();
  return (
    <View pointerEvents="none" style={styles.anchor}>
      {current && (
        <Animated.View
          key={current.key}
          collapsable={false}
          entering={FadeInDown.springify().damping(12).stiffness(170)}
          exiting={ZoomOut.duration(260)}
          style={[styles.chip, { backgroundColor: colors.glassStrong, borderColor: colors.glassEdge, boxShadow: colors.shadow }]}
        >
          <Text style={styles.emoji}>{current.emoji}</Text>
          <Animated.Text exiting={FadeOut.duration(120)} style={[t.footnoteBold, t.tnum, { color: colors.foreground }]}>
            {current.time}
          </Animated.Text>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: { position: 'absolute', top: -6, left: 0, right: 0, alignItems: 'center', zIndex: 2 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  emoji: { fontSize: 18, lineHeight: 22 },
});
