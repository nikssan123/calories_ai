import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import type { ChatAction, ChatCard as Card, ExerciseEntry, FoodEntry, Locale, Recipe, UnitSystem } from '@ct/shared';
import { bodyWeightToKg, bodyWeightUnit, formatBodyWeight, formatDay, formatDistance, formatWeightDelta, isDeletion, loadUnit, toBodyWeight, toLoad } from '@ct/shared';
import { exerciseEmoji, foodEmoji } from '@ct/shared/food-emoji';
import { Chunk, PressableChunk } from '@/components/Chunk';
import { FoodEditor } from '@/components/FoodEditor';
import { RecipeTile } from '@/components/kitchen/RecipeTile';
import { scale, Servings } from '@/components/kitchen/Servings';
import { Sparkline } from '@/components/Sparkline';
import { Touched } from '@/components/Touched';
import { WorkoutCard } from '@/components/workout/WorkoutCard';
import { api } from '@/lib/api';
import { useUnits } from '@/lib/units';
import { duration, ease, font, type as t, useColors, withAlpha, type Palette } from '@/theme';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { haptics } from '@/lib/haptics';
import { useLocale } from '@/lib/i18n';
import { useT, type StringKey } from '@/lib/i18n';
import { messageOf } from '@/lib/errors';

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
  touched,
  onLogged,
  text,
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
  /**
   * This card corrects an entry that was already logged, and the correction
   * happened just now rather than in a conversation being read back. Draws the
   * one-shot ring; see `Touched`.
   */
  touched?: boolean;
  /** Something was logged from a card rather than through a turn. */
  onLogged?: () => void;
  /**
   * The message's own words, for the one card that folds them into itself.
   *
   * Every other card here sits *under* the reply it belongs to. The review card
   * swallows it, because the reply in that case is six hundred words and the
   * card exists precisely so nobody has to scroll them — see `ReviewCard`.
   */
  text?: string;
}) {
  if (!action.card) return <Chip action={action} />;
  const body = (
    <CardBody
      card={action.card}
      messageId={messageId}
      today={today}
      onLogged={onLogged}
      text={text}
    />
  );
  // A gone entry is never also news, so the ring and the strike never meet.
  if (action.removed) return <Removed>{body}</Removed>;
  return <Touched active={touched}>{body}</Touched>;
}

/**
 * A card whose meal is no longer logged.
 *
 * The entry can be deleted from anywhere — a swipe on Today, the exercise
 * screen, a later turn — and none of those is a conversation, so the card that
 * announced it would otherwise sit here counting a meal that stopped existing.
 *
 * Struck rather than dropped. The turn is a record of something that happened
 * and deleting rows out of a transcript is how you get a journal nobody
 * believes; what has to go is the *claim*, not the history. So the card fades
 * back to the weight of a timestamp and says what became of it, and anything
 * still tappable on it — a suggestion's log button, a workout's answer — is
 * deliberately dead, because acting on it would log against an entry that is
 * not there.
 */
function Removed({ children }: { children: React.ReactNode }) {
  const colors = useColors();
  const tr = useT();
  return (
    <View style={styles.removed}>
      <View style={styles.removedCard} pointerEvents="none">
        {children}
      </View>
      <View style={styles.removedTag}>
        <View style={[styles.chipDot, { backgroundColor: colors.destructive }]} />
        <Text style={[t.footnoteSemibold, { color: colors.mutedForeground }]}>{tr('chat.removed')}</Text>
      </View>
    </View>
  );
}

/** Actions with nothing to draw — a deletion — stay a line of text. */
function Chip({ action }: { action: ChatAction }) {
  const colors = useColors();
  const tr = useT();
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
              backgroundColor: isDeletion(action) ? colors.destructive : colors.calories,
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
  text,
}: {
  card: Card;
  messageId?: string;
  today?: string;
  onLogged?: () => void;
  text?: string;
}) {
  switch (card.type) {
    case 'food':
      return <FoodCard card={card} today={today} onLogged={onLogged} />;
    case 'exercise':
      return <ExerciseCard card={card} onLogged={onLogged} />;
    case 'weight':
      return <WeightCard card={card} onLogged={onLogged} />;
    case 'trend':
      return <TrendCard card={card} />;
    case 'day':
      return <DayCard card={card} />;
    case 'plan':
      return <PlanCard card={card} />;
    case 'recipes':
      return <RecipesCard card={card} onLogged={onLogged} />;
    case 'review':
      return <ReviewCard card={card} prose={text} />;
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
function RecipesCard({
  card,
  onLogged,
}: {
  card: Extract<Card, { type: 'recipes' }>;
  onLogged?: () => void;
}) {
  return (
    <Land style={styles.recipes}>
      {card.recipes.map((recipe) => (
        <SuggestedRecipe key={recipe.id} recipe={recipe} onLogged={onLogged} />
      ))}
    </Land>
  );
}

/**
 * One suggestion, with the tap it is for attached.
 *
 * The tile alone would only take you to the recipe's own screen, and this card
 * is the one place where that is not enough: a suggestion is a thing to act on
 * rather than a picture of something that already happened, and sending someone
 * to another screen to do the one tap the card could take itself is the whole
 * reason the web draws its full card here instead of a summary.
 */
function SuggestedRecipe({ recipe, onLogged }: { recipe: Recipe; onLogged?: () => void }) {
  const colors = useColors();
  const tr = useT();
  const router = useRouter();
  const [servings, setServings] = useState(1);
  const [saved, setSaved] = useState(recipe.saved);
  const [cooking, setCooking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cook() {
    setCooking(true);
    try {
      await api.cookRecipe(recipe.id, { portions: servings });
      haptics.logged();
      onLogged?.();
    } catch (e) {
      setError(messageOf(e, tr));
    } finally {
      setCooking(false);
    }
  }

  return (
    <View style={styles.suggestion}>
      <RecipeTile
        title={recipe.title}
        summary={recipe.summary}
        kcal={recipe.kcal}
        protein_g={recipe.protein_g}
        servingLabel={tr('cook.perPortion')}
        emoji={foodEmoji(recipe.title)}
        needs={recipe.ingredients.filter((i) => i.missing).map((i) => i.name)}
        minutes={recipe.minutes}
        steps={recipe.steps.length}
        saved={saved}
        onPress={() => router.push(`/recipe/${recipe.id}`)}
        onToggleSave={() => {
          const next = !saved;
          setSaved(next);
          void api.saveRecipe(recipe.id, next).catch(() => setSaved(!next));
        }}
      />

      <View style={styles.suggestionActions}>
        <Servings value={servings} onChange={setServings} unit={tr('recipe.portion')} style={styles.flex} />
        <PressableChunk
          depth={3}
          radius={999}
          color={colors.caloriesDeep}
          onPress={() => void cook()}
          disabled={cooking}
          accessibilityRole="button"
          contentStyle={[styles.cook, { backgroundColor: colors.primary }]}
        >
          <Text style={[t.footnoteBold, { color: colors.primaryForeground }]}>
            {cooking ? tr('recipe.logging') : `I ate this · ${Math.round(scale(recipe.kcal, servings))}`}
          </Text>
        </PressableChunk>
      </View>

      {error && (
        <Text style={[t.footnoteSemibold, { color: colors.destructive }]}>{error}</Text>
      )}
    </View>
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
  const tr = useT();

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
  const tr = useT();
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

const MEAL_LABEL: Record<string, StringKey> = {
  breakfast: 'meal.breakfast',
  lunch: 'meal.lunch',
  dinner: 'meal.dinner',
  snack: 'meal.snackOne',
};

/**
 * A meal, and the way back into it.
 *
 * Same bargain as the exercise card: the receipt gets a quiet way to reopen the
 * thing it is a receipt for. The form is a separate component because a meal is
 * a list of items with six numbers each, which is more form than a card should
 * carry inline — see `FoodEditor`.
 */
function FoodCard({
  card,
  today,
  onLogged,
}: {
  card: Extract<Card, { type: 'food' }>;
  today?: string;
  onLogged?: () => void;
}) {
  const colors = useColors();
  const tr = useT();
  const [edited, setEdited] = useState<Extract<Card, { type: 'food' }> | null>(null);
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <FoodEditor
        entryId={card.entry_id}
        onSaved={(entry) => {
          setEdited(mergeFood(edited ?? card, entry));
          setEditing(false);
          onLogged?.();
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return <FoodReceipt card={edited ?? card} today={today} onEdit={() => setEditing(true)} />;
}

/**
 * The corrected entry, drawn back onto the card it came from.
 *
 * `day` is carried over rather than recomputed: the band is this meal's share
 * of the day, and the client cannot know what the rest of the day now sums to.
 * The server has already rewritten the stored card with a correct one, so a
 * reload is right — this only has to stop showing a figure that is plainly
 * stale until then.
 */
function mergeFood(
  card: Extract<Card, { type: 'food' }>,
  entry: FoodEntry,
): Extract<Card, { type: 'food' }> {
  return {
    ...card,
    meal: entry.meal,
    description: entry.description,
    confidence: entry.confidence,
    items: entry.items.map((item) => ({
      name: item.name,
      quantity: item.quantity_desc ?? (item.quantity_g === null ? null : `${Math.round(item.quantity_g)}g`),
    })),
    kcal: entry.kcal,
    protein_g: entry.protein_g,
    carbs_g: entry.carbs_g,
    fat_g: entry.fat_g,
    day: card.day
      ? { ...card.day, kcal_after: card.day.kcal_before + entry.kcal }
      : null,
  };
}

function FoodReceipt({
  card,
  today,
  onEdit,
}: {
  card: Extract<Card, { type: 'food' }>;
  today?: string;
  onEdit: () => void;
}) {
  const colors = useColors();
  const tr = useT();
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
              {MEAL_LABEL[card.meal] ? tr(MEAL_LABEL[card.meal]!) : card.meal}
              {card.confidence === 'low' && ` · ${tr('today.roughEstimate')}`}
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

      <Pressable
        onPress={onEdit}
        accessibilityRole="button"
        accessibilityLabel={`Edit ${card.description}`}
        hitSlop={8}
        style={({ pressed }) => [styles.editRow, { opacity: pressed ? 0.6 : 1 }]}
      >
        <Text style={[t.footnoteSemibold, { color: colors.mutedForeground }]}>{tr('common.edit')}</Text>
      </Pressable>

      {card.day && <DayProgress day={card.day} today={today} />}
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
  today,
}: {
  day: NonNullable<Extract<Card, { type: 'food' }>['day']>;
  today?: string;
}) {
  const locale = useLocale();
  const colors = useColors();
  const tr = useT();

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
  const word = dayWord(day.local_date, locale, today);

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

        This meal's own figure is not among them: the header states it, two
        lines up and in the largest type on the card. A legend repeating it made
        the same number appear twice inside one card, which reads as two
        different facts until you have checked that it isn't.
      */}
      <View style={styles.legend}>
        <Text style={[t.footnoteSemibold, t.tnum, { color: colors.mutedForeground }]}>
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
function dayWord(isoDate: string, locale: Locale, today?: string): string {
  if (today === undefined || isoDate === today) return '';
  return `on ${formatDate(isoDate, locale)}`;
}

/**
 * A session, and the way back into it.
 *
 * The card was write-once until now: submitted from memory, usually while still
 * catching your breath, and the set you mistyped only becomes visible once it
 * is already a receipt. From there the only route back was to delete the
 * session and log it again.
 *
 * Editing reopens the same form that collected it rather than a second one —
 * see `EditableSession`. The result is swapped in locally because nothing
 * re-reads the conversation after a correction; the server has already redrawn
 * the stored card, so a reload agrees with what is on screen.
 */
function ExerciseCard({
  card,
  onLogged,
}: {
  card: Extract<Card, { type: 'exercise' }>;
  onLogged?: () => void;
}) {
  const colors = useColors();
  const tr = useT();
  const units = useUnits();
  const [edited, setEdited] = useState<Extract<Card, { type: 'exercise' }> | null>(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Derived rather than seeded into state, so a card redrawn by its parent is
  // not shadowed by a stale copy taken at mount.
  const shown = edited ?? card;

  const detail = [
    shown.distance_km !== null ? formatDistance(shown.distance_km, units) : null,
    shown.duration_min !== null ? `${Math.round(shown.duration_min)} min` : null,
  ].filter(Boolean);

  if (editing) {
    return (
      <>
        <WorkoutCard
          editing={{
            id: shown.entry_id,
            category: shown.category,
            duration_min: shown.duration_min,
            sets: shown.sets,
          }}
          onLogged={(entry) => {
            setEdited(toExerciseCard(entry));
            setEditing(false);
            onLogged?.();
          }}
          onError={setError}
        />
        <Pressable
          onPress={() => {
            setEditing(false);
            setError(null);
          }}
          accessibilityRole="button"
          hitSlop={8}
          style={({ pressed }) => [styles.editRow, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Text style={[t.footnoteSemibold, { color: colors.mutedForeground }]}>{tr('common.cancel')}</Text>
        </Pressable>
        {error && (
          <Text style={[t.footnoteSemibold, { color: colors.destructive }]}>{error}</Text>
        )}
      </>
    );
  }

  return (
    <Shell>
      <View style={styles.headRow}>
        <View style={styles.headBody}>
          <Text style={styles.emoji}>{exerciseEmoji(shown.description)}</Text>
          <Text numberOfLines={1} style={[t.bodyBold, styles.flex, { color: colors.foreground }]}>
            {shown.description}
          </Text>
        </View>
        <Text style={[t.figure, styles.figure, { color: colors.exerciseText }]}>
          −{shown.kcal_burned.toLocaleString()}
          <Text style={[t.footnoteSemibold, { color: colors.mutedForeground }]}> kcal</Text>
        </Text>
      </View>

      <Text style={[t.footnote, styles.subline, { color: colors.mutedForeground }]}>
        {detail.length > 0 ? detail.join(' · ') : tr('chat.burnEstimate')}
        {/* §9 restated where the burn is: it is not a credit to spend. */}
        {tr('chat.notAddedToBudget')}
      </Text>

      {/*
        Quiet, and on the receipt rather than behind a long-press: a correction
        is an ordinary thing to want and a gesture nobody can see is a feature
        nobody finds. Weighted like the subline above it, because it is not
        what the card is for.
      */}
      <Pressable
        onPress={() => setEditing(true)}
        accessibilityRole="button"
        accessibilityLabel={`Edit ${shown.description}`}
        hitSlop={8}
        style={({ pressed }) => [styles.editRow, { opacity: pressed ? 0.6 : 1 }]}
      >
        <Text style={[t.footnoteSemibold, { color: colors.mutedForeground }]}>{tr('common.edit')}</Text>
      </Pressable>

      {/*
        The sets, where there were any. A strength session summed to one calorie
        figure is the least interesting thing about it — the number nobody
        trained for. What was actually done is the load and the reps.
      */}
      {shown.sets.length > 0 && (
        <View style={styles.sets}>
          {groupSets(shown.sets, units).map((group) => (
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
export function groupSets(sets: Extract<Card, { type: 'exercise' }>['sets'], units: UnitSystem) {
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

/**
 * A weigh-in, and the way back into it.
 *
 * The smallest correction in the app and the one most worth having: a weight is
 * a single number typed on a bathroom floor, which is exactly where a
 * transposed digit comes from. 8.5 for 85 is not a rare slip, and until now it
 * could only be fixed by saying so in the conversation.
 *
 * One weight per day is the rule, so this writes rather than appends — the row
 * is keyed by `local_date`, which the card now carries for precisely this. A
 * card old enough to predate that field simply does not offer the edit.
 */
function WeightCard({
  card,
  onLogged,
}: {
  card: Extract<Card, { type: 'weight' }>;
  onLogged?: () => void;
}) {
  const colors = useColors();
  const tr = useT();
  const units = useUnits();
  const [weight, setWeight] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shown = weight ?? card.weight_kg;

  async function save() {
    const typed = Number(draft);
    if (!Number.isFinite(typed) || typed <= 0) {
      setError(tr('chat.notAWeight'));
      return;
    }
    setSaving(true);
    try {
      const entry = await api.logWeight(
        bodyWeightToKg(typed, units),
        undefined,
        card.local_date ?? undefined,
      );
      setWeight(entry.weight_kg);
      setEditing(false);
      setError(null);
      haptics.logged();
      onLogged?.();
    } catch (e) {
      setError(messageOf(e, tr));
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <Shell>
        <View style={styles.weightRow}>
          <Text style={styles.emoji}>⚖️</Text>
          <TextInput
            value={draft}
            onChangeText={(next) => setDraft(next.replace(/[^0-9.]/g, ''))}
            accessibilityLabel={tr('today.weight')}
            keyboardType="decimal-pad"
            autoFocus
            style={[
              t.figure,
              styles.weightField,
              {
                backgroundColor: colors.mutedField,
                borderColor: colors.border,
                color: colors.foreground,
              },
            ]}
          />
          <Text style={[t.footnoteSemibold, { color: colors.mutedForeground }]}>
            {bodyWeightUnit(units)}
          </Text>
        </View>

        {error !== null && (
          <Text style={[t.footnoteSemibold, { color: colors.destructive }]}>{error}</Text>
        )}

        <View style={styles.weightFoot}>
          <Pressable
            onPress={() => {
              setEditing(false);
              setError(null);
            }}
            accessibilityRole="button"
            hitSlop={8}
          >
            <Text style={[t.footnoteSemibold, { color: colors.mutedForeground }]}>{tr('common.cancel')}</Text>
          </Pressable>
          <PressableChunk
            depth={3}
            radius={999}
            color={colors.caloriesDeep}
            onPress={() => void save()}
            disabled={saving}
            accessibilityRole="button"
            style={{ opacity: saving ? 0.4 : 1 }}
            contentStyle={[styles.weightSave, { backgroundColor: colors.primary }]}
          >
            <Text style={[t.footnoteBold, { color: colors.primaryForeground }]}>
              {saving ? tr('setup.saving') : tr('common.save')}
            </Text>
          </PressableChunk>
        </View>
      </Shell>
    );
  }

  return (
    <Shell>
      <View style={styles.weightRow}>
        <Text style={styles.emoji}>⚖️</Text>
        <Text style={[t.figure, styles.weight, { color: colors.foreground }]}>
          {formatBodyWeight(shown, units)}
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

      {/* Only where the card knows which day it is for. An older row cannot say,
          and guessing would write today's weight over a reading from March. */}
      {card.local_date !== null && (
        <Pressable
          onPress={() => {
            setDraft(String(toBodyWeight(shown, units)));
            setEditing(true);
          }}
          accessibilityRole="button"
          accessibilityLabel={tr('chat.editWeighIn')}
          hitSlop={8}
          style={({ pressed }) => [styles.editRow, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Text style={[t.footnoteSemibold, { color: colors.mutedForeground }]}>{tr('common.edit')}</Text>
        </Pressable>
      )}
    </Shell>
  );
}

function TrendCard({ card }: { card: Extract<Card, { type: 'trend' }> }) {
  const colors = useColors();
  const tr = useT();
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
  const locale = useLocale();
  const colors = useColors();
  const tr = useT();
  const remaining = card.targets.kcal - card.consumed.kcal;
  const over = remaining < 0;
  const pct = Math.min(100, (card.consumed.kcal / Math.max(1, card.targets.kcal)) * 100);
  const macros = [
    { key: 'protein_g', label: tr('macro.protein'), color: colors.proteinText },
    { key: 'carbs_g', label: tr('macro.carbs'), color: colors.carbsText },
    { key: 'fat_g', label: tr('macro.fat'), color: colors.fatText },
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
          {` · ${formatDate(card.local_date, locale)}`}
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
  const tr = useT();
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
              {night.title ?? tr('chat.nothingPlanned')}
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

/**
 * Monday's review, folded.
 *
 * The one card in the journal that is bigger than the reply it belongs to, and
 * the only one that is allowed to be — because it *is* the reply. A review is
 * six or seven hundred words arriving in a thread whose every other turn is a
 * sentence, and the numbers it is about are buried three paragraphs in. Left as
 * prose it is a wall you scroll past on the one morning of the week there is
 * something to read.
 *
 * So the arithmetic comes out and goes on top — the week as seven days you can
 * count, the two figures that matter, and the target change if there was one —
 * and the prose sits underneath at one paragraph, with the rest a tap away.
 * Nothing is hidden that was not already scrolled past.
 */
function ReviewCard({
  card,
  prose,
}: {
  card: Extract<Card, { type: 'review' }>;
  /** The message's own text. Absent only if a client forgets to pass it. */
  prose?: string;
}) {
  const locale = useLocale();
  const colors = useColors();
  const tr = useT();
  const units = useUnits();
  const [open, setOpen] = useState(false);

  // Paragraphs rather than a line clamp: RN cannot clamp a stack of Texts by
  // line, and a paragraph is the honest unit of a piece of prose anyway.
  const paragraphs = (prose ?? '').trim().split(/\n{2,}/).filter(Boolean);
  const rest = Math.max(0, paragraphs.length - 1);
  const shown = open ? paragraphs : paragraphs.slice(0, 1);

  const band = card.target_kcal * 0.1;
  const byDate = new Map(card.days.map((day) => [day.local_date, day.kcal]));
  // Walked rather than mapped, because the gaps are the point and they exist
  // by omission: `days` only carries the days that were logged.
  const week = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(card.week_start, index);
    const kcal = byDate.get(date);
    return {
      date,
      kcal: kcal ?? null,
      hit: kcal !== undefined && Math.abs(kcal - card.target_kcal) <= band,
    };
  });

  return (
    <Shell>
      <View style={styles.headRow}>
        <Text style={[t.bodyBold, styles.flex, { color: colors.foreground }]}>{tr('chat.lastWeek')}</Text>
        <Text style={[t.footnoteSemibold, { color: colors.mutedForeground }]}>
          {formatDate(card.week_start, locale)} – {formatDate(card.week_end, locale)}
        </Text>
      </View>

      <View style={styles.weekStrip}>
        {week.map((day) => (
          <View
            key={day.date}
            style={[
              styles.weekDay,
              {
                backgroundColor: day.hit
                  ? colors.calories
                  : day.kcal !== null
                    ? colors.muted
                    : 'transparent',
                borderColor: day.kcal !== null ? 'transparent' : colors.border,
              },
            ]}
          >
            <Text
              style={[
                t.footnoteBold,
                {
                  color: day.hit
                    ? colors.primaryForeground
                    : day.kcal !== null
                      ? colors.foreground
                      : colors.mutedForeground,
                },
              ]}
            >
              {WEEKDAY_INITIALS[new Date(`${day.date}T00:00:00Z`).getUTCDay()]}
            </Text>
          </View>
        ))}
      </View>
      <Text style={[t.footnote, styles.caption, { color: colors.mutedForeground }]}>
        {card.days_logged === 0
          ? tr('chat.nothingLoggedThisWeek')
          : `${card.days_logged} day${card.days_logged === 1 ? '' : 's'} logged, ${card.days_on_target} within 10% of target.`}
      </Text>

      <View style={styles.reviewFigures}>
        <Figure
          value={card.mean_kcal === null ? '—' : `${Math.round(card.mean_kcal).toLocaleString()}`}
          unit=" kcal"
          label={`a day, against ${card.target_kcal.toLocaleString()}`}
        />
        {card.weight_change_kg !== null ? (
          <Figure
            value={formatWeightDelta(card.weight_change_kg, units)}
            label={tr('chat.onTheScale')}
          />
        ) : card.exercise_sessions > 0 ? (
          <Figure
            value={card.exercise_kcal.toLocaleString()}
            unit=" kcal"
            label={`burned over ${card.exercise_sessions} session${card.exercise_sessions === 1 ? '' : 's'}`}
          />
        ) : (
          <Figure
            value={card.mean_protein_g === null ? '—' : `${Math.round(card.mean_protein_g)}`}
            unit=" g"
            label={`protein a day, against ${Math.round(card.target_protein_g)}`}
          />
        )}
      </View>

      {card.target_change && (
        <View
          style={[styles.reviewChange, { backgroundColor: colors.muted, borderColor: colors.border }]}
        >
          <View style={styles.reviewChangeRow}>
            <Text style={[t.bodyBold, t.tnum, { color: colors.mutedForeground }]}>
              {card.target_change.from_kcal.toLocaleString()}
            </Text>
            <Svg width={14} height={14} viewBox="0 0 24 24">
              <Path
                d="M5 12h14M13 6l6 6-6 6"
                stroke={colors.mutedForeground}
                strokeWidth={2.4}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </Svg>
            <Text style={[t.bodyBold, t.tnum, { color: colors.caloriesText }]}>
              {card.target_change.to_kcal.toLocaleString()} kcal
            </Text>
          </View>
          <Text style={[t.footnote, styles.reviewChangeWhy, { color: colors.mutedForeground }]}>
            {card.target_change.explanation}
          </Text>
        </View>
      )}

      {shown.length > 0 && (
        <View style={[styles.reviewProse, { borderTopColor: colors.border }]}>
          {shown.map((paragraph, index) => (
            <Text
              key={index}
              style={[t.body, styles.reviewParagraph, { color: colors.foreground }]}
            >
              {paragraph}
            </Text>
          ))}
        </View>
      )}

      {rest > 0 && (
        <Pressable
          onPress={() => {
            haptics.selected();
            setOpen((was) => !was);
          }}
          accessibilityRole="button"
          hitSlop={8}
          style={styles.reviewMore}
        >
          <Text style={[t.footnoteBold, { color: colors.caloriesText }]}>
            {open ? tr('chat.showLess') : `Read the rest (${rest} more)`}
          </Text>
        </Pressable>
      )}
    </Shell>
  );
}

/** A number and what it is a number of. Two of them make the review's top line. */
function Figure({ value, unit, label }: { value: string; unit?: string; label: string }) {
  const colors = useColors();
  const tr = useT();
  return (
    <View style={styles.flex}>
      <Text style={[t.figure, styles.reviewFigure, { color: colors.foreground }]}>
        {value}
        {unit ? (
          <Text style={[t.footnoteSemibold, { color: colors.mutedForeground }]}>{unit}</Text>
        ) : null}
      </Text>
      <Text style={[t.footnote, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;

/** Calendar arithmetic on an ISO date, without dragging a timezone into it. */
function addDays(date: string, days: number): string {
  const at = new Date(`${date}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

const formatDate = (isoDate: string, locale: Locale) =>
  formatDay(isoDate, locale, { day: 'numeric', month: 'short' });

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  shell: { borderWidth: 2, borderRadius: 24, paddingHorizontal: 16, paddingVertical: 14 },
  recipes: { gap: 12 },
  suggestion: { gap: 8 },
  suggestionActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cook: { height: 40, borderRadius: 999, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  removed: { gap: 6 },
  removedCard: { opacity: 0.45 },
  removedTag: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 2 },
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
  legend: { marginTop: 8 },
  subline: { marginTop: 6 },
  /** Aligned right so it reads as an action on the card, not a line of it. */
  editRow: { marginTop: 8, alignSelf: 'flex-end' },
  weightField: { flex: 1, borderWidth: 2, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 },
  weightFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  weightSave: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999 },
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
  weekStrip: { flexDirection: 'row', gap: 4, marginTop: 12 },
  weekDay: {
    flex: 1,
    height: 30,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewFigures: { flexDirection: 'row', gap: 12, marginTop: 14 },
  reviewChange: { borderWidth: 2, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, marginTop: 14 },
  reviewChangeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  reviewChangeWhy: { marginTop: 6, lineHeight: 20 },
  reviewFigure: { fontSize: 20, lineHeight: 26 },
  reviewProse: { borderTopWidth: 2, marginTop: 14, paddingTop: 12, gap: 10 },
  reviewParagraph: { lineHeight: 24 },
  reviewMore: { marginTop: 10, alignSelf: 'flex-start' },
  nights: { gap: 6, marginTop: 10 },
  night: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  weekday: { width: 36 },
  cooked: { textDecorationLine: 'line-through' },
});
