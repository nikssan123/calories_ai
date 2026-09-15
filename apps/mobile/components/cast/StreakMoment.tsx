import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useIsFocused } from 'expo-router';
import type { Streak } from '@ct/shared';
import { Confetti } from '@/components/Confetti';
import { Serif } from '@/components/Serif';
import { haptics } from '@/lib/haptics';
import { useT, type StringKey } from '@/lib/i18n';
import { markMomentShown, momentShown } from '@/lib/store';
import { type as t, useColors, useTheme, useType } from '@/theme';

/**
 * Seven in a row, said out loud.
 *
 * A run already has its chip under the ring and its badges on the wall, and
 * neither is a moment: the chip just counts one higher, and the badge turns up
 * somewhere nobody is looking. This is the day a run reaches 7, 30, 100 or 365,
 * with Ember holding up the flame while the other two cheer (CAST.md).
 *
 * It celebrates the days, not the food. There is no calorie figure on it
 * anywhere, the same rule the badges keep (STREAKS.md §1).
 *
 * **Once per run, per milestone.** Keyed on the run's first day, so a run that
 * broke and was rebuilt to seven gets its moment again. That is showing up
 * twice, and the badge, which is only ever earned once, can't say so.
 *
 * **Only the focused screen asks.** Today and the journal both mount this, and
 * tabs stay mounted, so without that guard two modals would race for one flag.
 * It waits a beat before opening, so a meal that has just been logged gets to
 * land in its own reply first.
 */
const MILESTONES = [7, 30, 100, 365] as const;
type Milestone = (typeof MILESTONES)[number];

const SETTLE_MS = 1200;

const WARMTH = {
  light: 'radial-gradient(120% 70% at 50% 22%, rgba(255, 190, 110, 0.5) 0%, rgba(255, 190, 110, 0) 70%)',
  dark: 'radial-gradient(120% 70% at 50% 22%, rgba(255, 150, 60, 0.16) 0%, rgba(255, 150, 60, 0) 70%)',
} as const;

/**
 * The moment, asked for by the focused screen: the milestone to celebrate now,
 * or null. Marks it shown as it hands it over, so it plays once per run per
 * milestone on this phone.
 *
 * It used to open a modal over the screen. Now it happens where the cast
 * already is (CAST.md, fourth pass): the three celebrate on the ledge or the
 * shelf, confetti comes off the composer, and the words land in the journal as
 * a card — so nothing covers the screen and nothing needs closing.
 */
export function useStreakMoment(
  streak: Streak | null | undefined,
  userId: string | null | undefined,
): { days: Milestone; key: string } | null {
  const focused = useIsFocused();
  const [open, setOpen] = useState<{ days: Milestone; key: string } | null>(null);

  const reached =
    streak && streak.state === 'alive' ? (MILESTONES.find((m) => m === streak.current) ?? null) : null;
  const moment = reached !== null && streak?.start ? `streak:${streak.start}:${reached}` : null;

  useEffect(() => {
    if (!moment || !userId || !focused || reached === null) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        if (await momentShown(userId, moment)) return;
        if (cancelled) return;
        await markMomentShown(userId, moment);
        setOpen({ days: reached, key: moment });
        haptics.logged();
      })();
    }, SETTLE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [moment, userId, focused, reached]);

  return open;
}

export type { Milestone };

/** The words of the moment, as a card in the conversation or under Today's ring. */
export function MomentCard({ days, compact = false }: { days: Milestone; compact?: boolean }) {
  const colors = useColors();
  const { scheme } = useTheme();
  const type = useType();
  const tr = useT();
  return (
    <View
      style={[
        styles.card,
        compact && styles.cardCompact,
        {
          backgroundColor: colors.card,
          borderColor: colors.hairline,
          boxShadow: colors.shadow,
          experimental_backgroundImage: WARMTH[scheme],
        },
      ]}
    >
      <Text style={[t.eyebrow, { color: colors.proteinText }]}>{tr(`badge.streak_${days}` as StringKey)}</Text>
      <Serif accessibilityRole="header" style={[type.hero, compact ? styles.figureCompact : styles.figure, { color: colors.foreground }]}>
        {tr('streak.days')(days)}
      </Serif>
      <Text style={[t.body, { color: colors.mutedForeground }]}>{tr('cast.showedUp')}</Text>
    </View>
  );
}

/** Where the confetti bursts from: place it where the burst should come from. */
export function MomentBurst({ trigger }: { trigger: string | null }) {
  return (
    <View style={styles.burst} pointerEvents="none">
      <Confetti trigger={trigger} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 26, paddingHorizontal: 20, paddingVertical: 18, gap: 4 },
  cardCompact: { paddingVertical: 14, alignItems: 'center' },
  burst: { position: 'absolute', left: 0, right: 0, top: 0, height: 1 },
  figure: { fontSize: 44, lineHeight: 52 },
  figureCompact: { fontSize: 34, lineHeight: 40 },
});
