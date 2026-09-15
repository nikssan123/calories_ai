import { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { useIsFocused } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Streak } from '@ct/shared';
import { Confetti } from '@/components/Confetti';
import { GlowButton } from '@/components/GlowButton';
import { Serif } from '@/components/Serif';
import { haptics } from '@/lib/haptics';
import { useT, type StringKey } from '@/lib/i18n';
import { markMomentShown, momentShown } from '@/lib/store';
import { column, type as t, useColors, useTheme, useType } from '@/theme';
import { Character } from './Character';

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

export function StreakMoment({
  streak,
  userId,
}: {
  streak: Streak | null | undefined;
  userId: string | null | undefined;
}) {
  const focused = useIsFocused();
  const [open, setOpen] = useState<Milestone | null>(null);

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
        setOpen(reached);
        haptics.logged();
        await markMomentShown(userId, moment);
      })();
    }, SETTLE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [moment, userId, focused, reached]);

  return (
    <Modal
      visible={open !== null}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => setOpen(null)}
    >
      {open !== null && <Celebration days={open} onClose={() => setOpen(null)} />}
    </Modal>
  );
}

function Celebration({ days, onClose }: { days: Milestone; onClose: () => void }) {
  const colors = useColors();
  const { scheme } = useTheme();
  const type = useType();
  const tr = useT();
  const insets = useSafeAreaInsets();
  const [burst, setBurst] = useState(0);

  // Confetti ignores its first value (the state on arrival), so the burst is a
  // change made just after the sheet has faded in.
  useEffect(() => {
    const timer = setTimeout(() => setBurst(1), 280);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View
      style={[
        styles.backdrop,
        { backgroundColor: colors.background, experimental_backgroundImage: WARMTH[scheme] },
      ]}
    >
      <View style={[column, styles.sheet, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.middle}>
          <View style={styles.stage}>
            <Character name="skye" mood="cheer" size={96} delay={140} />
            <Character name="ember" mood="proud" size={144} style={styles.lead} />
            <Character name="plum" mood="cheer" size={96} delay={460} />
            <View style={styles.burst} pointerEvents="none">
              <Confetti trigger={burst} />
            </View>
          </View>

          <Text style={[t.eyebrow, styles.centred, { color: colors.proteinText }]}>
            {tr(`badge.streak_${days}` as StringKey)}
          </Text>
          <Serif accessibilityRole="header" style={[type.hero, styles.figure, styles.centred, { color: colors.foreground }]}>
            {tr('streak.days')(days)}
          </Serif>
          <Text style={[t.body, styles.centred, { color: colors.mutedForeground }]}>{tr('cast.showedUp')}</Text>
        </View>

        <GlowButton label={tr('cast.keepGoing')} onPress={onClose} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1 },
  sheet: { flex: 1, paddingHorizontal: 20, gap: 16 },
  middle: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  stage: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 20 },
  // Ember stands a step forward, so the three overlap a little like a group photo.
  lead: { marginHorizontal: -18, zIndex: 1 },
  burst: { position: 'absolute', left: 0, right: 0, top: 30, height: 1 },
  figure: { fontSize: 52, lineHeight: 60 },
  centred: { textAlign: 'center' },
});
