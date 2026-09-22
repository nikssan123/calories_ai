import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { Chunk, PressableChunk } from '@/components/Chunk';
import { Land } from '@/components/Land';
import { Serif } from '@/components/Serif';
import { Character } from '@/components/cast/Character';
import { useAuth } from '@/lib/auth';
import { useIntroWayIn } from '@/lib/billing';
import { introDuration } from '@/lib/plan-copy';
import { useSaveAccount } from '@/lib/save-account';
import { type as t, useColors, useType } from '@/theme';
import { useLocale, useT } from '@/lib/i18n';

/**
 * The soft ask, the first time a guest logs a meal (GUEST-ACCOUNTS.md, rung 2).
 *
 * This is the rung of the ladder that was designed, named in `SAVE_REASONS` and
 * counted by the funnel, and then never wired to anything: until now the only
 * thing that ever asked a guest to save was the wall at the end of the grant.
 * Three weeks of store installs say what that cost — 21 guests, 14 of whom
 * logged food, 4 of whom reached the wall, 1 of whom saw the ask, 0 of whom
 * saved. The wall cannot convert people who never arrive at it.
 *
 * So the ask moves to the moment almost everybody reaches, and pays for the
 * move by being small:
 *
 * **Two lines and a figure.** The first draft of this card was a headline, four
 * lines of body and two stacked buttons — a screen's worth of argument for a
 * thing nobody had asked about, dropped on somebody a second after their meal
 * logged. Everything that is not the ask belongs on the sheet behind it: what
 * the trial holds, what stays free, how long it takes. Here there is room for
 * where the journal lives and what to do about it, and Skye does the rest,
 * which is the whole reason the cast exists (CAST.md).
 *
 * **It is a card in the transcript, not a screen over it.** The wall opens the
 * full save sheet on top of the conversation (`index.tsx`), which is defensible
 * there — the turn was refused, nothing else was going to happen. Here the turn
 * *worked*, and answering that with a form spends the momentum the first log
 * earns. This lands where the reply lands and waits.
 *
 * **It can be dismissed, and it only asks once.** Shown once per install — see
 * `momentShown` — and gone from the transcript the moment "Not now" is tapped.
 */
export function SaveAsk({
  onDismiss,
  style,
}: {
  onDismiss: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useColors();
  const type = useType();
  const tr = useT();
  const save = useSaveAccount();
  const auth = useAuth();
  const locale = useLocale();
  const router = useRouter();
  const introDoor = useIntroWayIn();

  /*
   * Read off the session rather than trusting the row that built this card.
   * The ask sits in the transcript and the transcript outlives the asking: a
   * guest who taps through and saves comes back to a card telling them their
   * journal is on one phone, which is now false, over a button that opens a
   * sheet with nothing left to do. The wall solves the same problem the same
   * way — see `PlanWall` — and here there is nothing else on the row, so the
   * whole card goes.
   */
  if (!auth.guest) return null;

  return (
    <Land style={style}>
      <Chunk
        // Lit green rather than filled or outlined, exactly like `PlanWall`:
        // this is a message in the conversation, not an alert over it.
        color={colors.calories}
        depth={5}
        contentStyle={[styles.card, { backgroundColor: colors.card, borderColor: colors.hairline }]}
      >
        <View style={styles.top}>
          {/*
            Skye, hopeful, in a column of her own — never over the words
            (CAST.md). `loop` off because a breath at 56 is a wobble nobody
            reads, and a card in a scrolling transcript should not hold a timer
            open for it; blinking and a poke still work.
          */}
          <Character name="skye" mood="hopeful" size={56} loop={false} />
          <View style={styles.words}>
            <Serif accessibilityRole="header" style={[type.serifTitle, { color: colors.foreground }]}>
              {tr('saveAsk.title')}
            </Serif>
            <Text style={[t.footnote, { color: colors.mutedForeground }]}>{tr('saveAsk.body')}</Text>
          </View>
        </View>

        <View style={styles.actions}>
          <PressableChunk
            color={colors.calories}
            radius={999}
            onPress={() => save.open('first_log')}
            accessibilityRole="button"
            style={styles.grow}
            contentStyle={[
              styles.button,
              { backgroundColor: colors.primary, experimental_backgroundImage: colors.primaryRamp },
            ]}
          >
            <Text style={[t.bodyBold, { color: colors.primaryForeground }]}>{tr('saveAsk.door')}</Text>
          </PressableChunk>

          {/*
            The way out, as a word rather than as a × in the corner: a 13px
            glyph is the smallest thing on the card and it is the control
            somebody reaches for when they are not interested, which is the one
            moment an ask must not make anybody hunt.
          */}
          <Pressable
            onPress={onDismiss}
            accessibilityRole="button"
            hitSlop={10}
            style={({ pressed }) => [styles.later, { opacity: pressed ? 0.45 : 1 }]}
          >
            <Text style={[t.footnoteSemibold, { color: colors.mutedForeground }]}>{tr('save.later')}</Text>
          </Pressable>
        </View>

        {/*
          The paid way in, where the store has one for this person.

          The same line the wall carries, for the same reasons and in the same
          place — last, a line rather than a button, and only ever the
          introductory figure. It is here because somebody who has just watched
          the app read a meal off a sentence is the most convinced they will be
          all week, and a door that costs two euros is a smaller ask at that
          moment than it is at any later one. What it must not become is the
          point of the card: nothing has been refused, both doors above it are
          free, and a price drawn any louder than this would turn a soft ask
          into a sales pitch on the back of somebody's breakfast.

          Absent on most phones, which is the ordinary case rather than a
          failure — no offer configured, no store, or this person has already
          used theirs. See `useIntroWayIn`.
        */}
        {introDoor && (
          <PressableChunk
            depth={3}
            radius={999}
            onPress={() => router.push({ pathname: '/upgrade', params: { plan: introDoor.plan } })}
            accessibilityRole="button"
            contentStyle={[
              styles.button,
              { backgroundColor: colors.glassStrong, borderWidth: 1, borderColor: colors.hairline },
            ]}
          >
            <Text style={[t.bodySemibold, styles.doorLabel, { color: colors.foreground }]}>
              {tr('guest.tryDoor')(introDoor.intro!.price, introDuration(introDoor.intro!, locale))}
            </Text>
          </PressableChunk>
        )}
      </Chunk>
    </Land>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 22, paddingHorizontal: 14, paddingVertical: 14, gap: 12 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  words: { flex: 1, gap: 2 },
  // Wraps rather than crushes: at an accessibility text size the quiet action
  // drops to its own line instead of squeezing the pill to nothing.
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  grow: { flexGrow: 1, flexShrink: 1, flexBasis: 180 },
  // `minHeight`, not `height` — a wrapped label grows the pill. See `PlanWall`.
  button: {
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  later: { paddingVertical: 10, paddingHorizontal: 10 },
  // Wraps inside the pill rather than overflowing it. See `PlanWall`.
  doorLabel: { flexShrink: 1, textAlign: 'center' },

});
