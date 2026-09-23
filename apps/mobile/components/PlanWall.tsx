import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { TRIAL, type Allowance, type MeterName } from '@ct/shared';
import { meterLocked, meterRemaining } from '@ct/shared';
import { Chunk, PressableChunk } from '@/components/Chunk';
import { Character } from '@/components/cast/Character';
import { Serif } from '@/components/Serif';
import { Land } from '@/components/Land';
import { useIntroWayIn } from '@/lib/billing';
import { useEntitlements } from '@/lib/entitlements';
import { useSaveAccount } from '@/lib/save-account';
import { useAuth } from '@/lib/auth';
import {
  introDuration,
  remainingLine,
  TIER_NAMES,
  tierFor,
  wallBody,
  wallEyebrow,
  wallTitle,
} from '@/lib/plan-copy';
import { type as t, useColors, useType, withAlpha, type Palette } from '@/theme';
import { useLocale, useT } from '@/lib/i18n';

/**
 * What a limit looks like when it is a price rather than a fault.
 *
 * The whole design problem here is that the app has to ask for money at the
 * exact moment somebody was trying to do something, which is the least welcome
 * moment there is. Three decisions fall out of that:
 *
 * **It is a card, not a dialog.** Nothing is dismissed, nothing is covered, the
 * conversation is not interrupted — the wall lands in the transcript where the
 * reply would have been and scrolls away with it. A modal would make the limit
 * an event; this makes it a message.
 *
 * **It is green, not red.** The palette has a `destructive` and this
 * deliberately does not use it. Running out of a metered allowance is the plan
 * working, and dressing it as a failure teaches people the app is broken.
 *
 * **The free door goes first.** The primary button is always the thing that
 * costs nothing — typing the meal in — and the upgrade is the quiet one beside
 * it. That ordering is not modesty: `plans.ts` sizes the free tier on the
 * argument that the wall stopped being an exit, and a wall whose only button is
 * a checkout puts the exit straight back.
 */
export function PlanWall({
  allowance,
  /** The server's own sentence, used when no allowance came back with the 402. */
  message,
  /** The free way out. Absent on walls that have none — the kitchen's. */
  onLogManually,
  style,
}: {
  allowance: Allowance | null;
  message?: string;
  onLogManually?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useColors();
  const type = useType();
  const tr = useT();
  const locale = useLocale();
  const router = useRouter();
  const { plan, tiers } = useEntitlements();
  const save = useSaveAccount();
  const auth = useAuth();
  const introDoor = useIntroWayIn();
  // Only the first phase: a door is one figure and a length, and a way in that
  // costs €0.99 for a week and then €4.99 for a month is sold by the €0.99.
  // What the rest of it becomes is `app/upgrade.tsx`'s sentence, which is
  // exactly where this button goes.
  const introWay = introDoor?.intro[0];
  /*
   * A guest's wall offers the account, not a plan: saving it is what starts the
   * free trial, and a guest cannot buy anything yet (GUEST-ACCOUNTS.md). Read
   * off the session as well as the allowance, because the wall stays in the
   * transcript after the account is saved and must stop offering it then.
   */
  const guest = allowance?.trial === 'guest' && auth.guest;

  const title = allowance ? wallTitle(allowance, tr, locale, guest) : (message ?? tr('plans.spent'));
  const body = allowance ? wallBody(allowance, tr, locale, guest) : undefined;

  /*
   * How much of the grant is gone, as a fraction, or null when there is no
   * grant to draw. Null covers the two states that are not a count at all: a
   * meter this plan does not carry, and a 402 that arrived without an
   * allowance. `used` can run past `allowed` — a turn that spent two — so it
   * is clamped rather than trusted to be a proportion.
   */
  const spent =
    allowance && allowance.allowed !== null && allowance.allowed > 0
      ? Math.min(1, allowance.used / allowance.allowed)
      : null;
  const eyebrow = allowance ? wallEyebrow(allowance, tr) : tr('wall.eyebrowSpent');
  /*
   * Which tier answers this. Without an allowance — a 402 from something that
   * does not send one — it falls back to the cheapest tier above the one they
   * are on rather than to Plus: hardcoding Plus offers a Coach account an
   * upgrade to something it already has.
   */
  const next = allowance
    ? tierFor(allowance.meter, tiers, plan)
    : (tiers.find((tier) => tier.plan !== 'free' && tier.plan !== plan)?.plan ?? null);

  return (
    <Land style={style}>
      <Chunk
        /*
         * The card surface, with the accent spent on its light rather than on
         * a fill or an outline.
         *
         * A tinted *fill* was the obvious move and it is wrong here: the ground
         * is cream, so nine per cent of a green over it comes out olive — a
         * colour that is in neither palette, next to a vivid green user bubble
         * that shows up exactly how muddy it is. It wore a green border for a
         * while; since the glow-up nothing is outlined, so the card glows green
         * instead — the same signal, at full chroma, cast rather than drawn —
         * and still reads like every other card in the conversation. It is a
         * message, not an alert.
         */
        color={colors.calories}
        depth={5}
        contentStyle={[styles.card, { backgroundColor: colors.card, borderColor: colors.hairline }]}
      >
        <View style={styles.top}>
          {/*
            Ember, hopeful, in a column of her own — never over the words
            (CAST.md). Hopeful and not sorry: running a grant out is the plan
            working, and a figure pulling a face at it would teach people the
            app is broken, which is the same argument the green makes above.
          */}
          <Character name="ember" mood="hopeful" size={56} loop={false} />

          <View style={styles.words}>
            {/*
              The count, drawn rather than said.

              It used to be the headline — "That's all 3 messages this month" —
              which spent the card's one serif line restating a number the
              reader had just watched run out. A bar says it faster and without
              a verb, which leaves the headline to be about what happens next.
              On a meter with no count behind it — a locked feature, a trial
              that ended — there is nothing to draw and the label stands alone.
            */}
            <View style={styles.meterRow}>
              {spent !== null && (
                <View style={[styles.track, { backgroundColor: withAlpha(colors.calories, 0.16) }]}>
                  <View
                    style={[
                      styles.fill,
                      {
                        width: `${Math.round(spent * 100)}%`,
                        backgroundColor: colors.primary,
                        experimental_backgroundImage: colors.primaryRamp,
                      },
                    ]}
                  />
                </View>
              )}
              <Text style={[t.eyebrow, styles.eyebrow, { color: colors.caloriesText }]}>{eyebrow}</Text>
            </View>

            <Serif accessibilityRole="header" style={[type.serifTitle, { color: colors.foreground }]}>
              {title}
            </Serif>
            {body && <Text style={[t.footnote, { color: colors.mutedForeground }]}>{body}</Text>}
          </View>
        </View>

        <View style={styles.actions}>
          {/*
            The doors, in the order they are worth taking.

            The rule this file has always kept is that a wall must never be a
            checkout with no way past it — `plans.ts` sizes the free tier on the
            argument that the wall stopped being an exit, and a card whose only
            button is a price puts the exit straight back. That rule is about
            *money*, and it used to be enforced by always making the free door
            the solid one. On a guest that was the wrong reading: saving an
            account costs nothing either, so promoting it promotes a free thing,
            and the door that had been solid — typing the meal in yourself —
            stays on the card beside it rather than disappearing.

            Side by side rather than stacked: two full-width pills one above the
            other was a form, and it was most of the card's height.
          */}
          {guest ? (
            <Door solid label={tr('guest.saveDoor')} colors={colors} onPress={() => save.open('guest_limit')} />
          ) : (
            onLogManually && (
              <Door
                solid
                colors={colors}
                label={tr('wall.logMyself')}
                glyph={<PencilGlyph color={colors.primaryForeground} />}
                onPress={onLogManually}
              />
            )
          )}

          {guest && onLogManually && <Quiet label={tr('wall.logMyself')} colors={colors} onPress={onLogManually} />}

          {next && !guest && (
            <Quiet
              colors={colors}
              /* The tier the button names, carried to the wall so it opens on
                 the one it just offered. Without it the paywall picks its own
                 default — the cheapest tier above the current plan — and a
                 kitchen that asks for Coach lands on Plus preselected. */
              onPress={() => router.push({ pathname: '/upgrade', params: { plan: next } })}
              /* Names the tier, because "Upgrade" does not say what for and the
                 tier that answers this meter is not always the top one. */
              label={tr('plans.seeWhatAdds')(TIER_NAMES[next])}
            />
          )}
        </View>

        {/*
          The paid door on a guest's wall, and the only one that is a price.

          Drawn only when the store has an introductory price for this person —
          the whole point of it is the small number, and "Try it all for €99.99
          a year" is not an easier yes than the free doors above it, it is a
          worse one.

          It spent a while as a grey line of footnote under the buttons, on the
          reasoning that nothing paid should outrank something free. That read
          as small print: the one door on the card with a price on it was also
          the only one that did not look like a control. A door can be second
          without being hidden — it is a button like the others, on its own row
          beneath them, wearing the outline rather than the fill. The ordering
          still says what it said; it just no longer whispers.
        */}
        {guest && introDoor && introWay && (
          <View style={styles.introRow}>
            <Door
              colors={colors}
              label={tr('guest.tryDoor')(introWay.price, introDuration(introWay, locale))}
              onPress={() => router.push({ pathname: '/upgrade', params: { plan: introDoor.plan } })}
            />
          </View>
        )}
      </Chunk>
    </Land>
  );
}

/** The quiet door: a word beside the solid one, not a second pill under it. */
function Quiet({ label, onPress, colors }: { label: string; onPress: () => void; colors: Palette }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      hitSlop={10}
      style={({ pressed }) => [styles.quiet, { opacity: pressed ? 0.45 : 1 }]}
    >
      <Text style={[t.footnoteSemibold, { color: colors.mutedForeground }]}>{label}</Text>
    </Pressable>
  );
}

/**
 * One door. Solid is the one to take; the rest are the same shape, quieter.
 *
 * Three identical filled pills stacked was what a guest's wall used to be, and
 * a stack of identical buttons is a form rather than a card: nothing in it says
 * which one the card is for. Same height, same radius, two weights of surface.
 */
function Door({
  label,
  onPress,
  colors,
  solid = false,
  glyph,
}: {
  label: string;
  onPress: () => void;
  colors: Palette;
  solid?: boolean;
  glyph?: React.ReactNode;
}) {
  return (
    <PressableChunk
      color={solid ? colors.calories : undefined}
      depth={solid ? undefined : 3}
      radius={999}
      onPress={onPress}
      accessibilityRole="button"
      style={styles.grow}
      contentStyle={[
        styles.button,
        solid
          ? { backgroundColor: colors.primary, experimental_backgroundImage: colors.primaryRamp }
          : { backgroundColor: colors.glassStrong, borderWidth: 1, borderColor: colors.hairline },
      ]}
    >
      {glyph}
      <Text
        style={[
          solid ? t.bodyBold : t.bodySemibold,
          styles.doorLabel,
          { color: solid ? colors.primaryForeground : colors.foreground },
        ]}
      >
        {label}
      </Text>
    </PressableChunk>
  );
}

/**
 * A whole feature that is not on this plan, drawn where the feature would be.
 *
 * The difference from `PlanWall` is when it appears: this one is on screen
 * *before* anything is pressed. A locked feature that looks unlocked until the
 * button fails is the worst of both — it wastes a tap and it teaches people
 * that buttons in this app sometimes do not work — and it is exactly what the
 * Cook tab did on the free tier, because `used >= allowed` against a null
 * `allowed` is false. See `meterSpent`.
 */
export function LockedPanel({
  title,
  body,
  meter,
  style,
}: {
  title: string;
  body: string;
  /** Which meter this feature spends, so the right tier is named. */
  meter: MeterName;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useColors();
  const type = useType();
  const tr = useT();
  const locale = useLocale();
  const router = useRouter();
  const { plan, tiers } = useEntitlements();
  const next = tierFor(meter, tiers, plan);

  return (
    <Chunk
      style={style}
      // Lit green rather than outlined green — see `PlanWall`.
      color={colors.calories}
      depth={5}
      contentStyle={[styles.card, { backgroundColor: colors.card, borderColor: colors.hairline }]}
    >
      <View style={styles.head}>
        <Badge colors={colors} icon="lock" />
        <Text style={[t.title2, styles.title, { color: colors.foreground }]}>{title}</Text>
      </View>
      <Text style={[t.body, { color: colors.mutedForeground }]}>{body}</Text>
      {next && (
        <PressableChunk
          color={colors.calories}
          radius={999}
          /* Same as the wall's: the panel names a tier, so it opens on it. */
          onPress={() => router.push({ pathname: '/upgrade', params: { plan: next } })}
          accessibilityRole="button"
          /* Not `actions`: that one is a *container*, and its `gap` lands
             between a chunk's surface and its `Overhang` — which stretches the
             ledge to 14px and reads as a button dropped in mud. */
          style={styles.loneAction}
          contentStyle={[styles.button, { backgroundColor: colors.primary, experimental_backgroundImage: colors.primaryRamp }]}
        >
          <Text style={[t.bodyBold, { color: colors.primaryForeground }]}>
            {tr('plans.seeWhatAdds')(TIER_NAMES[next])}
          </Text>
        </PressableChunk>
      )}
    </Chunk>
  );
}

/**
 * How early the count appears, as a number of remaining turns.
 *
 * A flat three was right while every ceiling it ran against was large — three
 * out of Plus's ninety is the last 3% of the month, which is a warning. It stops
 * being right on a small grant: three out of free's **ten** is 70% of the
 * allowance spent before the app says a word, and the whole argument for this
 * component is that a limit somebody can see is a plan while a limit they
 * discover is a trap. A grant small enough to run out in a week has to start
 * counting sooner, in proportion rather than in absolutes.
 *
 * So: half the grant, floored at the old three and capped at five.
 *
 *   free   chat    10  ->  5   the halfway point, which is the point
 *   free   photo    1  ->  3   floor; only 1 and 0 exist, so it shows at 1
 *   plus   photo    8  ->  4
 *   plus   chat    90  ->  5   cap; 45 left is not news
 *   coach  chat   180  ->  5
 *
 * The cap is what stops "half" turning the chip into a permanent fixture on the
 * tiers people pay for, and the floor is what stops a two-turn grant from
 * warning at one. Neither end is doing anything clever in between — the meters
 * that land there are the small ones, which are exactly the ones worth naming
 * early.
 */
const SHOW_FROM_MIN = 3;
const SHOW_FROM_MAX = 5;

export function showFrom(allowed: number): number {
  return Math.min(Math.max(SHOW_FROM_MIN, Math.ceil(allowed / 2)), SHOW_FROM_MAX);
}

/**
 * The quiet one: a count, while there is still a count to give.
 *
 * This is the piece that decides whether the wall is experienced as a trap or
 * as a plan. A ceiling nobody can see is only ever discovered by hitting it —
 * which is the complaint `usage.ts` makes about the client having no way to
 * ask — and by then the app has already refused to do something. A few turns of
 * warning costs a line of small text and turns the same limit into a decision
 * somebody gets to make while nothing is going wrong.
 *
 * Everything about it is calibrated to not be an advert. It appears only inside
 * `showFrom`, it says a number and a noun, it has no verb, and it is dismissed
 * for the session by tapping it away. Tapping the count itself opens the wall.
 */
export function MeterChip({
  meter,
  onDismiss,
  style,
}: {
  meter: MeterName;
  onDismiss?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useColors();
  const tr = useT();
  const locale = useLocale();
  const router = useRouter();
  const { allowances } = useEntitlements();
  const allowance = allowances?.[meter] ?? null;

  // Nothing to say while it is unknown, unmetered, comfortable, or already
  // spent — the last because a spent meter has the wall, and a chip repeating
  // the wall's news underneath it is the nagging this component avoids.
  // `meterLocked` covers the unmetered account too: its ceiling is null because
  // there is no bill behind it, and counting down from infinity is not a thing.
  if (!allowance || meterLocked(allowance) || allowance.unlimited) return null;
  const left = meterRemaining(allowance);
  // `allowed` is non-null past `meterLocked`, and the credits a meter may carry
  // are deliberately not in the threshold: they are stock rather than the
  // grant, and the chip is counting down the thing that runs out.
  if (left > showFrom(allowance.allowed ?? 0)) return null;
  /*
   * Zero with bought stock behind it is not "none left", it is the grant
   * running out in front of scans this person paid for — and `meterRemaining`
   * counts only the grant, by design. Saying none to somebody holding ten
   * credits is the one way this chip can be actively wrong, so it holds its
   * tongue and lets the wall, which does read credits, speak if it ever comes.
   */
  if (left === 0 && allowance.credits > 0) return null;

  return (
    <View style={[styles.chipRow, style]}>
      <Pressable
        onPress={() => router.push('/upgrade')}
        accessibilityRole="button"
        accessibilityLabel={tr('plans.remainingHint')(remainingLine(allowance, left, tr))}
        hitSlop={6}
        style={({ pressed }) => [styles.chip, { opacity: pressed ? 0.55 : 1 }]}
      >
        <View style={[styles.chipDot, { backgroundColor: colors.primary, experimental_backgroundImage: colors.primaryRamp }]} />
        <Text style={[t.footnoteSemibold, { color: colors.mutedForeground }]}>
          {/*
            Zero is a count too, and it used to be the one count this hid.

            The chip stopped at "1 message left", the last one got spent, and
            then it simply went — so the state between spending the grant and
            finding out was a composer that looked exactly like a working one.
            The argument for hiding it was that the wall carries the news, and
            that was true while the wall arrived the moment anything was typed;
            it is a beat too late for somebody deciding whether to type at all.
            It says the number either way now, and the last of them is zero.
          */}
          {left === 0 ? tr('wall.noneLeft') : remainingLine(allowance, left, tr)}
        </Text>
      </Pressable>
      {onDismiss && (
        <Pressable
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel={tr('plans.hide')}
          hitSlop={10}
          style={({ pressed }) => [styles.chipClose, { opacity: pressed ? 0.4 : 0.7 }]}
        >
          <Svg width={11} height={11} viewBox="0 0 24 24">
            <Path
              d="M18 6 6 18M6 6l12 12"
              stroke={colors.mutedForeground}
              strokeWidth={3}
              strokeLinecap="round"
              fill="none"
            />
          </Svg>
        </Pressable>
      )}
    </View>
  );
}

/** The round mark. Lucide's `sparkles` and `lock`, on lucide's 24-unit grid. */
function Badge({ colors, icon = 'sparkles' }: { colors: Palette; icon?: 'sparkles' | 'lock' }) {
  const stroke = {
    stroke: colors.caloriesText,
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };
  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: withAlpha(colors.primary, 0.22),
          boxShadow: `inset 0px 1px 0px ${colors.glassEdge}`,
        },
      ]}
    >
      <Svg width={17} height={17} viewBox="0 0 24 24">
        {icon === 'sparkles' ? (
          <>
            <Path
              d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z"
              {...stroke}
            />
            <Path d="M5 3v4M3 5h4M19 17v4M17 19h4" {...stroke} />
          </>
        ) : (
          <>
            <Rect x={3} y={11} width={18} height={11} rx={2} {...stroke} />
            <Path d="M7 11V7a5 5 0 0 1 10 0v4" {...stroke} />
          </>
        )}
      </Svg>
    </View>
  );
}

/** Lucide's `pen-line`. */
export function PencilGlyph({ color, size = 16 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 20h9M16.4 3.6a1 1 0 0 1 3 3L7.4 18.6a2 2 0 0 1-.9.5l-2.9.9a.5.5 0 0 1-.6-.6l.8-2.9a2 2 0 0 1 .5-.9z"
        stroke={color}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 22, paddingHorizontal: 14, paddingVertical: 14, gap: 12 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  words: { flex: 1, gap: 2 },
  grow: { flexGrow: 1, flexShrink: 1, flexBasis: 180 },
  quiet: { paddingVertical: 10, paddingHorizontal: 10 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  // `flexShrink` rather than `flex: 1`: the title wraps to as many lines as it
  // needs beside a badge that never shrinks.
  title: { flexShrink: 1 },
  badge: { width: 30, height: 30, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  meterRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 1 },
  // A short bar, not a full-width one: this is a label's worth of information
  // sitting beside a label, and a bar across the whole card would read as
  // progress towards something rather than as a grant running out.
  track: { width: 40, height: 4, borderRadius: 999, overflow: 'hidden' },
  // Wraps inside the row rather than running off the card: "3 of 3 messages
  // used" is three words in English and five in Bulgarian, and at an
  // accessibility text size even the English one reaches the edge.
  eyebrow: { flexShrink: 1 },
  fill: { height: '100%', borderRadius: 999 },
  introRow: { marginTop: 2 },
  // A label in a row container does not wrap on its own — it overflows and is
  // clipped, which is how "€1.99 for 1 week" lost its last word. `flexShrink`
  // hands it back the width it is allowed to wrap inside; the pill's
  // `minHeight` then grows to fit the second line.
  doorLabel: { flexShrink: 1, textAlign: 'center' },
  // Wraps rather than crushes: at an accessibility text size the quiet door
  // drops to its own line instead of squeezing the pill to nothing.
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  loneAction: { marginTop: 4 },
  /*
   * `minHeight`, not `height`: a label that wraps has to grow the pill rather
   * than spill out of it. Every door here is a sentence in thirteen languages
   * — German's is half again as long as English's — and at an accessibility
   * text size even the short ones run to two lines. A fixed height clips the
   * second one, which reads as a cut-off word rather than as a layout that ran
   * out of room. See the note in `theme/typography.ts` about text sizes.
   */
  button: {
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  chipRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  chipDot: { width: 6, height: 6, borderRadius: 999 },
  chipClose: { padding: 4 },
});
