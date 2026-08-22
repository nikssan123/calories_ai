import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import type { ChatAction, ChatCard as Card, ExerciseEntry, UnitSystem } from '@ct/shared';
import {
  formatBodyWeight,
  formatDistance,
  formatWeightDelta,
  loadUnit,
  toLoad,
} from '@ct/shared';
import { exerciseEmoji, foodEmoji } from '@ct/shared/food-emoji';
import { Chunk } from '@/components/Chunk';
import { RecipeTile } from '@/components/kitchen/RecipeTile';
import { Sparkline } from '@/components/Sparkline';
import { WorkoutCard } from '@/components/workout/WorkoutCard';
import { api } from '@/lib/api';
import { useUnits } from '@/lib/units';
import { duration, ease, font, type as t, useColors, withAlpha, type Palette } from '@/theme';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/**
 * The visual half of a turn — and the thing this app should be recognised by.
 *
 * These sit inside the conversation, so they stay compact: no headings, one
 * accent, and never taller than the reply they belong to. A card that outweighs
 * the sentence next to it turns a conversation into a dashboard, which is the
 * thing this product is not.
 *
 * What they do get is the entrance, and a face. A card is the moment the agent
 * hands an understood meal back to you, so it drops in and bounces once instead
 * of simply appearing, and it arrives wearing a picture of the food.
 */
export function ChatActionCard({
  action,
  messageId,
  today,
  onLogged,
}: {
  action: ChatAction;
  /** The message this card sits on — the workout card answers onto it. */
  messageId?: string;
  /**
   * The date the app currently calls today, from the day summary above the
   * conversation. Never guessed from the device clock: this app's day turns
   * over at 4am, so between midnight and then the calendar and the journal
   * disagree about which day it is, and a card that took the clock's word for
   * it would label tonight's supper as yesterday's.
   */
  today?: string;
  /** Something was logged from a card rather than through a turn. */
  onLogged?: () => void;
}) {
  if (!action.card) return <Chip action={action} />;
  return (
    <CardBody card={action.card} messageId={messageId} today={today} onLogged={onLogged} />
  );
}

/** Actions with nothing to draw — a deletion — stay a line of text. */
function Chip({ action }: { action: ChatAction }) {
  const colors = useColors();
  return (
    <Land>
      <Chunk
        depth={2}
        radius={999}
        style={styles.chipWrap}
        contentStyle={[
          styles.chip,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <View
          style={[
            styles.chipDot,
            {
              backgroundColor:
                action.kind === 'food_deleted' ? colors.destructive : colors.calories,
            },
          ]}
        />
        <Text style={[t.footnoteSemibold, { color: colors.foreground }]}>{action.summary}</Text>
      </Chunk>
    </Land>
  );
}

function CardBody({
  card,
  messageId,
  today,
  onLogged,
}: {
  card: Card;
  messageId?: string;
  today?: string;
  onLogged?: () => void;
}) {
  switch (card.type) {
    case 'food':
      return <FoodCard card={card} today={today} />;
    case 'exercise':
      return <ExerciseCard card={card} />;
    case 'weight':
      return <WeightCard card={card} />;
    case 'trend':
      return <TrendCard card={card} />;
    case 'day':
      return <DayCard card={card} />;
    case 'plan':
      return <PlanCard card={card} />;
    case 'recipes':
      return <RecipesCard card={card} />;
    case 'workout_prompt':
      // Needs a real message id to answer onto. An optimistic bubble has none
      // yet, but it also cannot be carrying a card the model drew.
      return messageId ? (
        <WorkoutPrompt card={card} messageId={messageId} onLogged={onLogged} />
      ) : null;
  }
}

/**
 * Recipes, answered in the conversation.
 *
 * The one card that breaks the compactness rule above, and it earns it: these
 * are not a picture of something that already happened, they are the thing the
 * user has to act on. A summary here would send someone to another tab to do
 * the one tap the card could have taken itself.
 */
function RecipesCard({ card }: { card: Extract<Card, { type: 'recipes' }> }) {
  const router = useRouter();
  return (
    <Land style={styles.recipes}>
      {card.recipes.map((recipe) => (
        <RecipeTile
          key={recipe.id}
          title={recipe.title}
          summary={recipe.summary}
          kcal={recipe.kcal}
          protein_g={recipe.protein_g}
          servingLabel="per portion"
          emoji={foodEmoji(recipe.title)}
          needs={recipe.ingredients.filter((i) => i.missing).map((i) => i.name)}
          minutes={recipe.minutes}
          steps={recipe.steps.length}
          saved={recipe.saved}
          onPress={() => router.push(`/recipe/${recipe.id}`)}
          onToggleSave={() => void api.saveRecipe(recipe.id, !recipe.saved).catch(() => {})}
        />
      ))}
    </Land>
  );
}

/**
 * The question, and the receipt it becomes.
 *
 * Logging rewrites this message's card on the server, but nothing re-reads the
 * conversation afterwards — so the question would stay on screen with a live
 * button, and every further press would log the same session again. Swapping
 * the card here shows what a reload would have shown, without waiting for one.
 */
function WorkoutPrompt({
  card,
  messageId,
  onLogged,
}: {
  card: Extract<Card, { type: 'workout_prompt' }>;
  messageId: string;
  onLogged?: () => void;
}) {
  const [logged, setLogged] = useState<ExerciseEntry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const colors = useColors();

  if (logged) return <ExerciseCard card={toExerciseCard(logged)} />;

  return (
    <>
      <WorkoutCard
        card={card}
        messageId={messageId}
        onLogged={(entry) => {
          setLogged(entry);
          onLogged?.();
        }}
        onError={setError}
      />
      {error && (
        <Text style={[t.footnoteSemibold, { color: colors.destructive }]}>{error}</Text>
      )}
    </>
  );
}

/** The receipt the server just wrote onto the message, from the entry it returned. */
function toExerciseCard(entry: ExerciseEntry): Extract<Card, { type: 'exercise' }> {
  return {
    type: 'exercise',
    entry_id: entry.id,
    description: entry.description,
    confidence: entry.confidence,
    kcal_burned: Math.round(entry.kcal_burned),
    duration_min: entry.duration_min,
    distance_km: entry.distance_km,
    category: entry.category,
    sets: entry.sets,
  };
}

/**
 * The entrance. `animate-land`: down, in, and one bounce.
 *
 * The overshoot is the easing's, not a second keyframe — `--ease-spring` passes
 * 1 and comes back — so scale is driven straight from the progress value and
 * allowed past 1. Opacity is the one channel clamped, because a card brighter
 * than opaque is not a thing and the web's keyframes finish it at 60% anyway.
 */
function Land({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  const progress = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    if (reduced) {
      progress.value = 1;
      return;
    }
    progress.value = withTiming(1, { duration: duration.spring, easing: ease.spring });
  }, [reduced, progress]);

  const animated = useAnimatedStyle(() => ({
    opacity: Math.min(1, progress.value / 0.6),
    transform: [
      { translateY: -14 * (1 - progress.value) },
      { scale: 0.94 + 0.06 * progress.value },
    ],
  }));

  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}

function Shell({ children }: { children: React.ReactNode }) {
  const colors = useColors();
  return (
    <Land>
      <Chunk
        contentStyle={[styles.shell, { backgroundColor: colors.card, borderColor: colors.border }]}
      >
        {children}
      </Chunk>
    </Land>
  );
}

const MEAL_LABEL: Record<string, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

function FoodCard({ card, today }: { card: Extract<Card, { type: 'food' }>; today?: string }) {
  const colors = useColors();
  const approx = card.confidence !== 'high';
  const macros = [
    { value: card.protein_g, label: 'P', fill: colors.protein, text: colors.proteinText },
    { value: card.carbs_g, label: 'C', fill: colors.carbs, text: colors.carbsText },
    { value: card.fat_g, label: 'F', fill: colors.fat, text: colors.fatText },
  ];
  // Macro split by energy, not by grams — 30g of fat is more than twice the
  // calories of 30g of carbohydrate, so a gram-weighted bar misreads the meal.
  const energy = [card.protein_g * 4, card.carbs_g * 4, card.fat_g * 9];
  const total = energy.reduce((a, b) => a + b, 0);

  return (
    <Shell>
      <View style={styles.head}>
        <View style={styles.headBody}>
          {/* Sized to sit on the same block as the description, so a one-line
              and a two-line card do not stagger their pictures. */}
          <Text style={styles.emoji}>{foodEmoji(card.description, card.meal)}</Text>
          <View style={styles.flex}>
            <Text numberOfLines={1} style={[t.bodyBold, { color: colors.foreground }]}>
              {card.description}
            </Text>
            <Text style={[t.footnoteSemibold, { color: colors.mutedForeground }]}>
              {MEAL_LABEL[card.meal] ?? card.meal}
              {card.confidence === 'low' && ' · rough estimate'}
            </Text>
          </View>
        </View>
        <Text style={[t.figure, styles.figure, { color: colors.foreground }]}>
          {approx && '~'}
          {card.kcal.toLocaleString()}
          <Text style={[t.footnoteSemibold, { color: colors.mutedForeground }]}> kcal</Text>
        </Text>
      </View>

      {total > 0 && (
        <View style={[styles.split, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          {energy.map((value, i) => (
            <View
              key={macros[i]!.label}
              style={{ width: `${(value / total) * 100}%`, backgroundColor: macros[i]!.fill }}
            />
          ))}
        </View>
      )}

      <View style={styles.macros}>
        {macros.map((macro) => (
          <Text key={macro.label} style={[t.footnoteBold, t.tnum]}>
            {/* The text cut, not the fill: mango at 13px on white is 2:1. */}
            <Text style={{ color: macro.text }}>{Math.round(macro.value)}</Text>
            <Text style={{ color: colors.mutedForeground }}>{macro.label}</Text>
          </Text>
        ))}
      </View>

      {card.items.length > 1 && (
        <Text
          numberOfLines={1}
          style={[t.footnote, styles.items, { color: colors.mutedForeground }]}
        >
          {card.items
            .map((item) => (item.quantity ? `${item.name} ${item.quantity}` : item.name))
            .join(' · ')}
        </Text>
      )}

      {card.day && <DayProgress day={card.day} kcal={card.kcal} approx={approx} today={today} />}
    </Shell>
  );
}

/**
 * The meal, put where it lands in the day.
 *
 * A calorie figure on its own is a number people have to do sums with: 640 is
 * a third of one person's day and most of another's. So the card draws it — the
 * day so far in a quiet green, this meal as the bright band on the end of it,
 * and whatever is left as empty track. It answers "how am I doing?" at a
 * glance, before anyone has read a digit.
 *
 * The bands run in the order the day happened, which is why the meal is always
 * the one on the right and always the one that grows on arrival: the movement
 * *is* the message. Anything past the target is drawn in ink rather than red —
 * over is information, not a telling-off — and the target keeps a notch so a
 * day that ran past it still shows where it went.
 */
function DayProgress({
  day,
  kcal,
  approx,
  today,
}: {
  day: NonNullable<Extract<Card, { type: 'food' }>['day']>;
  kcal: number;
  /** Estimated rather than measured — marked here exactly as in the header. */
  approx: boolean;
  today?: string;
}) {
  const colors = useColors();

  const target = Math.max(1, Math.round(day.target_kcal));
  const before = Math.max(0, Math.round(day.kcal_before));
  // Defensive: a card written before a deletion elsewhere could otherwise ask
  // for a negative band, which paints as a full-width one.
  const after = Math.max(before, Math.round(day.kcal_after));
  const over = after > target;
  const remaining = target - after;
  // The bar is the target's width until the day runs past it, and the day's
  // width after that — so a 3,000 kcal day still fits, and the notch says where
  // the target was rather than the bar quietly rescaling nothing.
  const scale = Math.max(target, after);

  const underTarget = Math.min(before, target);
  const bands = [
    { key: 'earlier', kcal: underTarget, mine: false, over: false },
    { key: 'earlier-over', kcal: Math.max(0, before - target), mine: false, over: true },
    {
      key: 'meal',
      kcal: Math.max(0, Math.min(after, target) - underTarget),
      mine: true,
      over: false,
    },
    { key: 'meal-over', kcal: Math.max(0, after - Math.max(before, target)), mine: true, over: true },
  ].filter((band) => band.kcal > 0);
  const last = bands.length - 1;
  const word = dayWord(day.local_date, today);

  return (
    <View style={styles.progress}>
      <DashedRule color={withAlpha(colors.border, 0.7)} />
      <View style={[styles.bar, { backgroundColor: colors.muted, borderColor: colors.border }]}>
        {bands.map((band, i) => (
          <Band
            key={band.key}
            width={bandWidth(band.kcal, band.mine, scale)}
            color={bandFill(colors, band.mine, band.over)}
            mine={band.mine}
            roundedEnd={i === last}
          />
        ))}

        {/* Where the day was aiming, kept visible once it has been passed. */}
        {over && (
          <View
            pointerEvents="none"
            style={[styles.notch, { left: `${(target / scale) * 100}%`, backgroundColor: colors.card }]}
          />
        )}
      </View>

      {/*
        Both halves of the answer, because "1,315 left" on its own is only half
        of it: it says where the day is going and never says where it has got
        to. The two figures are the same pair the ring on Today carries, in the
        same order, so glancing between them is not translation work.
      */}
      <View style={styles.legend}>
        <View style={styles.legendLeft}>
          <View
            style={[
              styles.legendDot,
              { backgroundColor: bandFill(colors, true, over && before >= target) },
            ]}
          />
          {/* `truncate`, which on this line is load-bearing rather than
              defensive: the two halves together are wider than a phone at the
              narrow end, and without it RN wraps — dropping "meal" onto a
              second line that the baseline-aligned row then hides. */}
          <Text
            numberOfLines={1}
            style={[t.footnoteSemibold, styles.legendLabel, { color: colors.mutedForeground }]}
          >
            this meal
          </Text>
          {/* The band's own figure, on the band's own label. The header carries
              it too, but the header is about the plate and this line is about
              the day. */}
          <Text
            style={[
              t.footnote,
              t.tnum,
              styles.legendRight,
              { fontFamily: font.extrabold, color: colors.foreground },
            ]}
          >
            {approx && '~'}
            {kcal.toLocaleString()}
          </Text>
        </View>

        <Text style={[t.footnoteSemibold, t.tnum, styles.legendRight, { color: colors.mutedForeground }]}>
          {/* The day so far leads, at ink weight: it is the figure the bar is a
              picture of, and the one they came to the card for. */}
          <Text style={{ fontFamily: font.extrabold, color: colors.foreground }}>
            {after.toLocaleString()}
          </Text>
          {` of ${target.toLocaleString()} · `}
          <Text style={{ fontFamily: font.bold, color: over ? colors.foreground : undefined }}>
            {over
              ? `${Math.abs(remaining).toLocaleString()} over`
              : `${remaining.toLocaleString()} left`}
          </Text>
          {word && ` ${word}`}
        </Text>
      </View>
    </View>
  );
}

/**
 * One band. Only this meal's grows.
 *
 * `scaleX` from a left origin rather than an animated width, which is what the
 * web does and for the same reason: a width animation re-lays-out the row on
 * every frame, and the bands after it shuffle. The day so far was already true
 * when the card arrived, so animating it would claim otherwise.
 */
function Band({
  width,
  color,
  mine,
  roundedEnd,
}: {
  width: number;
  color: string;
  mine: boolean;
  roundedEnd: boolean;
}) {
  const reduced = useReducedMotion();
  const grow = useSharedValue(mine && !reduced ? 0 : 1);

  useEffect(() => {
    if (!mine || reduced) {
      grow.value = 1;
      return;
    }
    // It follows the card down rather than arriving with it: the band answers
    // "and where does that leave me?", a question you only ask once the meal
    // itself has appeared.
    grow.value = withDelay(140, withTiming(1, { duration: duration.spring, easing: ease.spring }));
  }, [mine, reduced, grow]);

  const animated = useAnimatedStyle(() => ({ transform: [{ scaleX: grow.value }] }));

  return (
    <Animated.View
      style={[
        styles.band,
        { width: `${width}%`, backgroundColor: color },
        roundedEnd ? styles.bandEnd : null,
        animated,
      ]}
    />
  );
}

/**
 * `border-t-2 border-dashed`, drawn rather than declared.
 *
 * RN's `borderStyle: 'dashed'` applies to a whole border box, not to one edge:
 * Android happens to honour a lone `borderTopWidth` with it, and iOS draws
 * nothing at all — so the rule that separates the meal from the day it landed
 * in was simply absent on the platform this app is mostly used on. An SVG line
 * is the same picture on both, and needs no measuring because a horizontal rule
 * can be given its width as a percentage.
 */
function DashedRule({ color }: { color: string }) {
  return (
    <Svg width="100%" height={2} style={styles.rule}>
      <Line x1="0" y1={1} x2="100%" y2={1} stroke={color} strokeWidth={2} strokeDasharray="6 6" />
    </Svg>
  );
}

/**
 * A band's share of the bar, with a floor under this meal's own.
 *
 * An apple against a 2,200 kcal day is four percent of the track — three
 * pixels, which on a bar with a border reads as nothing logged at all. The
 * floor costs a little accuracy on exactly the meals whose accuracy nobody is
 * reading off the bar, and buys the one thing the card is for: seeing that the
 * thing you just said went in.
 */
function bandWidth(kcal: number, mine: boolean, scale: number): number {
  const share = (kcal / scale) * 100;
  return mine ? Math.max(share, 2.5) : share;
}

/** Green up to the target, ink past it; the day so far steps back behind both. */
function bandFill(colors: Palette, mine: boolean, over: boolean): string {
  const colour = over ? colors.foreground : colors.calories;
  // `color-mix(in oklch, …, transparent 68%)`. Mixing with `transparent` is
  // premultiplied, so it is the same colour at 32% and not a hue shift — which
  // is why this one can be spelled as an alpha rather than precomputed.
  return mine ? colour : withAlpha(colour, 0.32);
}

/**
 * Which day the bar is talking about, said only when it is not this one.
 *
 * Two figures and a date is more line than a phone has, and "today" is what
 * everybody assumes anyway — so the words are spent on the case that would
 * otherwise mislead: a meal logged onto yesterday, whose bar would read as
 * today's. Silent, too, when nobody has told us which day is current.
 */
function dayWord(isoDate: string, today?: string): string {
  if (today === undefined || isoDate === today) return '';
  return `on ${formatDate(isoDate)}`;
}

function ExerciseCard({ card }: { card: Extract<Card, { type: 'exercise' }> }) {
  const colors = useColors();
  const units = useUnits();
  const detail = [
    card.distance_km !== null ? formatDistance(card.distance_km, units) : null,
    card.duration_min !== null ? `${Math.round(card.duration_min)} min` : null,
  ].filter(Boolean);

  return (
    <Shell>
      <View style={styles.headRow}>
        <View style={styles.headBody}>
          <Text style={styles.emoji}>{exerciseEmoji(card.description)}</Text>
          <Text numberOfLines={1} style={[t.bodyBold, styles.flex, { color: colors.foreground }]}>
            {card.description}
          </Text>
        </View>
        <Text style={[t.figure, styles.figure, { color: colors.exerciseText }]}>
          −{card.kcal_burned.toLocaleString()}
          <Text style={[t.footnoteSemibold, { color: colors.mutedForeground }]}> kcal</Text>
        </Text>
      </View>

      <Text style={[t.footnote, styles.subline, { color: colors.mutedForeground }]}>
        {detail.length > 0 ? detail.join(' · ') : 'Burn is an estimate'}
        {/* §9 restated where the burn is: it is not a credit to spend. */}
        {' · not added to your budget'}
      </Text>

      {/*
        The sets, where there were any. A strength session summed to one calorie
        figure is the least interesting thing about it — the number nobody
        trained for. What was actually done is the load and the reps.
      */}
      {card.sets.length > 0 && (
        <View style={styles.sets}>
          {groupSets(card.sets, units).map((group) => (
            <View key={group.name} style={styles.setRow}>
              <Text numberOfLines={1} style={[t.footnote, styles.flex, { color: colors.foreground }]}>
                {group.name}
              </Text>
              <Text style={[t.footnote, t.tnum, { color: colors.mutedForeground }]}>
                {group.detail}
              </Text>
            </View>
          ))}
        </View>
      )}
    </Shell>
  );
}

/**
 * Sets, collapsed into the line a person would say out loud.
 *
 * "3 × 8 at 80kg" when they are all alike, and the honest "8, 8, 6 at 80kg"
 * when they are not — because the set where the reps dropped is the most
 * informative thing in the session, and averaging it away would hide exactly
 * the detail the sets were stored to keep.
 */
function groupSets(sets: Extract<Card, { type: 'exercise' }>['sets'], units: UnitSystem) {
  const byName = new Map<string, typeof sets>();
  for (const set of sets) {
    byName.set(set.name, [...(byName.get(set.name) ?? []), set]);
  }

  return [...byName].map(([name, group]) => {
    const reps = group.map((s) => s.reps).filter((r): r is number => r !== null);
    const weights = [
      ...new Set(group.map((s) => s.weight_kg).filter((w): w is number => w !== null)),
    ];
    const seconds = group.map((s) => s.duration_sec).filter((d): d is number => d !== null);

    if (reps.length > 0) {
      const same = new Set(reps).size === 1;
      const count = same ? `${reps.length} × ${reps[0]}` : reps.join(', ');
      const loads = weights.map((w) => toLoad(w, units));
      const load = loads.length > 0 ? ` at ${loads.join('/')}${loadUnit(units)}` : '';
      return { name, detail: `${count}${load}` };
    }
    if (seconds.length > 0) {
      const total = seconds.reduce((a, b) => a + b, 0);
      return { name, detail: `${Math.round(total / 60)} min` };
    }
    return { name, detail: `${group.length} sets` };
  });
}

function WeightCard({ card }: { card: Extract<Card, { type: 'weight' }> }) {
  const colors = useColors();
  const units = useUnits();

  return (
    <Shell>
      <View style={styles.weightRow}>
        <Text style={styles.emoji}>⚖️</Text>
        <Text style={[t.figure, styles.weight, { color: colors.foreground }]}>
          {formatBodyWeight(card.weight_kg, units)}
        </Text>
        {card.change_7d_kg !== null && card.change_7d_kg !== 0 && (
          <Text
            style={[
              t.footnoteBold,
              t.tnum,
              { color: card.change_7d_kg < 0 ? colors.positive : colors.mutedForeground },
            ]}
          >
            {card.change_7d_kg > 0 ? '+' : '−'}
            {formatWeightDelta(Math.abs(card.change_7d_kg), units, false)} this week
          </Text>
        )}
      </View>
      <Sparkline points={card.series} stroke={colors.foreground} height={44} style={styles.chart} />
    </Shell>
  );
}

function TrendCard({ card }: { card: Extract<Card, { type: 'trend' }> }) {
  const colors = useColors();
  const metricColor: Record<string, string> = {
    calories: colors.calories,
    protein: colors.protein,
    weight: colors.foreground,
    exercise: colors.exercise,
  };
  const hasPoints = card.series.some((point) => point.average !== null);

  return (
    <Shell>
      <View style={styles.headRow}>
        <Text numberOfLines={1} style={[t.bodyBold, styles.flex, { color: colors.foreground }]}>
          {card.title}
        </Text>
        {card.average !== null && (
          <Text style={[t.footnoteSemibold, t.tnum, { color: colors.mutedForeground }]}>
            {'avg '}
            <Text style={{ fontFamily: font.extrabold, color: colors.foreground }}>
              {card.average.toLocaleString()}
            </Text>
            {` ${card.unit}`}
          </Text>
        )}
      </View>

      {hasPoints ? (
        <Sparkline
          points={card.series}
          stroke={metricColor[card.metric] ?? colors.calories}
          target={card.target}
          variant={card.metric === 'exercise' ? 'bars' : 'line'}
          style={styles.chartWide}
        />
      ) : (
        // Better an empty state than an axis with one point on it pretending to
        // be a trend.
        <Text style={[t.footnote, styles.subline, { color: colors.mutedForeground }]}>
          Not enough logged days yet to draw a trend.
        </Text>
      )}

      {card.caption && (
        <Text style={[t.footnote, styles.caption, { color: colors.mutedForeground }]}>
          {card.caption}
        </Text>
      )}
    </Shell>
  );
}

function DayCard({ card }: { card: Extract<Card, { type: 'day' }> }) {
  const colors = useColors();
  const remaining = card.targets.kcal - card.consumed.kcal;
  const over = remaining < 0;
  const pct = Math.min(100, (card.consumed.kcal / Math.max(1, card.targets.kcal)) * 100);
  const macros = [
    { key: 'protein_g', label: 'Protein', color: colors.proteinText },
    { key: 'carbs_g', label: 'Carbs', color: colors.carbsText },
    { key: 'fat_g', label: 'Fat', color: colors.fatText },
  ] as const;

  return (
    <Shell>
      <View style={styles.headRow}>
        <Text style={[t.figure, styles.figure, { color: colors.foreground }]}>
          {card.consumed.kcal.toLocaleString()}
          <Text style={[t.footnoteSemibold, { color: colors.mutedForeground }]}>
            {` / ${card.targets.kcal.toLocaleString()} kcal`}
          </Text>
        </Text>
        {/* Ink, not red: over target is information, not a telling-off. */}
        <Text
          style={[
            t.footnoteBold,
            t.tnum,
            { color: over ? colors.foreground : colors.mutedForeground },
          ]}
        >
          {over
            ? `${Math.abs(remaining).toLocaleString()} over`
            : `${remaining.toLocaleString()} left`}
        </Text>
      </View>

      <View style={[styles.dayTrack, { backgroundColor: colors.muted, borderColor: colors.border }]}>
        <Band
          width={pct}
          color={over ? colors.foreground : colors.calories}
          mine
          roundedEnd
        />
      </View>

      <View style={styles.macros}>
        {macros.map(({ key, label, color }) => (
          <Text key={key} style={[t.footnoteBold, t.tnum]}>
            <Text style={{ color }}>{Math.round(card.consumed[key])}</Text>
            <Text style={{ color: colors.mutedForeground }}>
              {`/${card.targets[key]} ${label}`}
            </Text>
          </Text>
        ))}
      </View>

      {card.burned_kcal > 0 && (
        <Text style={[t.footnote, t.tnum, styles.caption, { color: colors.mutedForeground }]}>
          <Text style={{ fontFamily: font.bold, color: colors.exerciseText }}>
            −{card.burned_kcal} burned
          </Text>
          {` · ${formatDate(card.local_date)}`}
        </Text>
      )}
      {card.caption && (
        <Text style={[t.footnote, styles.caption, { color: colors.mutedForeground }]}>
          {card.caption}
        </Text>
      )}
    </Shell>
  );
}

/**
 * The week, as a line per night.
 *
 * Deliberately not seven recipe cards: that is a screen and a half of
 * conversation, and a week is something you read down rather than act on one
 * item at a time. On the web the whole card opens the plan screen; there is no
 * plan screen here yet, so it is a card you read rather than one you press.
 */
function PlanCard({ card }: { card: Extract<Card, { type: 'plan' }> }) {
  const colors = useColors();
  const planned = card.nights.filter((night) => night.title !== null);

  return (
    <Shell>
      <View style={styles.headRow}>
        <Text style={[t.bodyBold, styles.flex, { color: colors.foreground }]}>
          This week&rsquo;s dinners
        </Text>
        <Text style={[t.footnoteSemibold, { color: colors.mutedForeground }]}>
          {planned.length} night{planned.length === 1 ? '' : 's'}
        </Text>
      </View>

      <View style={styles.nights}>
        {card.nights.map((night) => (
          <View key={night.slot_id} style={styles.night}>
            <Text style={[t.footnoteBold, styles.weekday, { color: colors.mutedForeground }]}>
              {night.weekday.slice(0, 3).toUpperCase()}
            </Text>
            <Text
              numberOfLines={1}
              style={[
                t.footnoteSemibold,
                styles.flex,
                {
                  color: night.title === null || night.cooked
                    ? colors.mutedForeground
                    : colors.foreground,
                },
                // Cooked is history, not an achievement to celebrate — it steps
                // back so the nights still ahead are what you see.
                night.cooked ? styles.cooked : null,
              ]}
            >
              {night.title ?? 'Nothing planned'}
            </Text>
            {night.kcal !== null && (
              <Text style={[t.footnoteBold, t.tnum, { color: colors.mutedForeground }]}>
                {night.kcal.toLocaleString()}
              </Text>
            )}
          </View>
        ))}
      </View>
    </Shell>
  );
}

function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  shell: { borderWidth: 2, borderRadius: 24, paddingHorizontal: 16, paddingVertical: 14 },
  recipes: { gap: 8 },
  chipWrap: { alignSelf: 'flex-start' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 2,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  chipDot: { width: 8, height: 8, borderRadius: 4 },
  head: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  headBody: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 },
  emoji: { fontSize: 22, lineHeight: 28 },
  figure: { fontSize: 16, lineHeight: 24 },
  split: {
    flexDirection: 'row',
    gap: 1,
    height: 10,
    borderRadius: 999,
    borderWidth: 1,
    overflow: 'hidden',
    marginTop: 12,
  },
  macros: { flexDirection: 'row', gap: 12, marginTop: 8 },
  items: { marginTop: 8 },
  progress: { marginTop: 12 },
  rule: { marginBottom: 10 },
  bar: {
    flexDirection: 'row',
    gap: 1,
    height: 12,
    borderRadius: 999,
    borderWidth: 1,
    overflow: 'hidden',
  },
  band: { height: '100%', transformOrigin: 'left center' },
  bandEnd: { borderTopRightRadius: 999, borderBottomRightRadius: 999 },
  notch: { position: 'absolute', top: 0, bottom: 0, width: 2, opacity: 0.7 },
  legend: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 8,
  },
  legendLeft: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1, minWidth: 0 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { flexShrink: 1 },
  legendRight: { flexShrink: 0 },
  subline: { marginTop: 6 },
  caption: { marginTop: 8 },
  sets: { gap: 4, marginTop: 10 },
  setRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  weightRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  weight: { fontSize: 24, lineHeight: 30 },
  chart: { marginTop: 8, opacity: 0.8 },
  chartWide: { marginTop: 10 },
  dayTrack: {
    flexDirection: 'row',
    height: 10,
    borderRadius: 999,
    borderWidth: 1,
    overflow: 'hidden',
    marginTop: 10,
  },
  nights: { gap: 6, marginTop: 10 },
  night: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  weekday: { width: 36 },
  cooked: { textDecorationLine: 'line-through' },
});
