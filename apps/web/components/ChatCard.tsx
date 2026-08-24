'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import type { ChatAction, ChatCard as Card, ExerciseEntry, FoodEntry, Locale, UnitSystem } from '@ct/shared';
import { bodyWeightToKg, bodyWeightUnit, formatBodyWeight, formatDay, formatDistance, formatWeightDelta, loadUnit, toBodyWeight, toLoad } from '@ct/shared';
import { useUnits } from '@/lib/units';
import { RecipeCard } from '@/components/kitchen/RecipeCard';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FoodEditor } from '@/components/FoodEditor';
import { WorkoutCard } from '@/components/workout/WorkoutCard';
import { Sparkline } from '@/components/Sparkline';
import { exerciseEmoji, foodEmoji } from '@ct/shared/food-emoji';
import { cn } from '@/lib/utils';
import { useLocale } from '@/lib/i18n';

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
 * of simply appearing (`animate-land` in globals.css) and it arrives wearing a
 * picture of the food — see @ct/shared/food-emoji. Between them those two are
 * most of what makes a reply feel like an answer rather than a receipt.
 */
export function ChatActionCard({
  action,
  messageId,
  today,
  onLogged,
  text,
}: {
  action: ChatAction;
  /** The message this card sits on — the workout card answers onto it. */
  messageId?: string;
  /**
   * The date the app currently calls today, from the day summary beside the
   * conversation. Never guessed from the browser clock: this app's day turns
   * over at 4am, so between midnight and then the calendar and the journal
   * disagree about which day it is, and a card that took the browser's word
   * for it would label tonight's supper as yesterday's.
   */
  today?: string;
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
  return action.removed ? <Removed>{body}</Removed> : body;
}

/**
 * A card whose meal is no longer logged.
 *
 * The entry can be deleted from anywhere — the day, the exercise page, a later
 * turn — and none of those is a conversation, so the card that announced it
 * would otherwise sit here counting a meal that stopped existing.
 *
 * Struck rather than dropped. The turn is a record of something that happened
 * and deleting rows out of a transcript is how you get a journal nobody
 * believes; what has to go is the *claim*, not the history. So the card fades
 * back to the weight of a timestamp and says what became of it, and anything
 * still clickable on it — a suggestion's log button, a workout's answer — is
 * deliberately dead, because acting on it would log against an entry that is
 * not there.
 */
function Removed({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="pointer-events-none opacity-45">{children}</div>
      <div className="flex items-center gap-2 pl-0.5">
        <span
          aria-hidden
          className="size-2 shrink-0 rounded-full"
          style={{ background: 'var(--destructive)' }}
        />
        <span className="text-footnote text-muted-foreground font-semibold">Removed</span>
      </div>
    </div>
  );
}

/** Actions with nothing to draw — a deletion — stay a line of text. */
function Chip({ action }: { action: ChatAction }) {
  return (
    <div className="bg-card border-border chunk animate-land flex items-center gap-2 rounded-full border-2 px-3.5 py-1.5 [--chunk-depth:2px]">
      <span
        className="size-2 shrink-0 rounded-full"
        style={{
          background: action.kind === 'food_deleted' ? 'var(--destructive)' : 'var(--calories)',
        }}
      />
      <span className="text-footnote font-semibold">{action.summary}</span>
    </div>
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
    case 'recipes':
      return <RecipesCard card={card} />;
    case 'plan':
      return <PlanCard card={card} />;
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
 * The question, and the receipt it becomes.
 *
 * Logging rewrites this message's card on the server, but nothing re-reads the
 * conversation afterwards — so the question used to stay on screen with a live
 * button, and every further press logged the same session again. Only a reload
 * ended it. Swapping the card here shows what that reload would have shown,
 * without waiting for one.
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

  if (logged) return <ExerciseCard card={toExerciseCard(logged)} />;

  return (
    <WorkoutCard
      card={card}
      messageId={messageId}
      onLogged={(entry) => {
        setLogged(entry);
        onLogged?.();
      }}
    />
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
 * Recipes, answered in the conversation.
 *
 * The one card that breaks the compactness rule above, and it earns it: these
 * are not a picture of something that already happened, they are the thing the
 * user has to act on. A summary here would send someone to another tab to do
 * the one tap the card could have taken itself, so it is the same card as on
 * Cook — servings stepper, cook button and all.
 */
function RecipesCard({ card }: { card: Extract<Card, { type: 'recipes' }> }) {
  const router = useRouter();
  return (
    <div className="animate-land space-y-2">
      {card.recipes.map((recipe) => (
        <RecipeCard
          key={recipe.id}
          recipe={recipe}
          // The journal owns the day summary above the thread, and it re-reads
          // it on navigation; refreshing is the cheapest way to keep the ring
          // honest without threading a callback through every card.
          onCooked={() => router.refresh()}
        />
      ))}
    </div>
  );
}

/**
 * The week, as a line per night.
 *
 * Deliberately not the recipe cards above: seven of those is a screen and a
 * half of conversation, and a week is something you read down rather than act
 * on one item at a time. The nights that matter are tonight and tomorrow, so
 * anything already cooked reads back quietly and the whole card opens the plan
 * screen — which is where swapping and cooking actually live.
 */
function PlanCard({ card }: { card: Extract<Card, { type: 'plan' }> }) {
  const router = useRouter();
  const planned = card.nights.filter((night) => night.title !== null);

  return (
    <button
      type="button"
      onClick={() => router.push('/plan')}
      className="w-full text-left"
      aria-label="Open the week's plan"
    >
      <Shell className="transition-transform active:scale-[0.99]">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-body font-bold">This week&rsquo;s dinners</p>
          <span className="text-footnote text-muted-foreground shrink-0 font-semibold">
            {planned.length} night{planned.length === 1 ? '' : 's'}
          </span>
        </div>

        <ul className="mt-2.5 space-y-1.5">
          {card.nights.map((night) => (
            <li key={night.slot_id} className="flex items-baseline gap-2.5">
              <span className="text-footnote text-muted-foreground w-9 shrink-0 font-bold uppercase">
                {night.weekday.slice(0, 3)}
              </span>
              <span
                className={cn(
                  'text-footnote min-w-0 flex-1 truncate font-semibold',
                  night.title === null && 'text-muted-foreground',
                  // Cooked is history, not an achievement to celebrate — it
                  // steps back so the nights still ahead are what you see.
                  night.cooked && 'text-muted-foreground line-through',
                )}
              >
                {night.title ?? 'Nothing planned'}
              </span>
              {night.kcal !== null && (
                <span className="tnum text-footnote text-muted-foreground shrink-0 font-bold">
                  {night.kcal.toLocaleString()}
                </span>
              )}
            </li>
          ))}
        </ul>
      </Shell>
    </button>
  );
}

const MEAL_LABEL: Record<string, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

function Shell({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'bg-card border-border chunk animate-land rounded-[var(--radius)] border-2 px-4 py-3.5',
        className,
      )}
    >
      {children}
    </div>
  );
}

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
      quantity:
        item.quantity_desc ?? (item.quantity_g === null ? null : `${Math.round(item.quantity_g)}g`),
    })),
    kcal: entry.kcal,
    protein_g: entry.protein_g,
    carbs_g: entry.carbs_g,
    fat_g: entry.fat_g,
    day: card.day ? { ...card.day, kcal_after: card.day.kcal_before + entry.kcal } : null,
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
  const approx = card.confidence !== 'high';
  const macros = [
    { value: card.protein_g, label: 'P', color: 'var(--protein)', text: 'var(--protein-text)' },
    { value: card.carbs_g, label: 'C', color: 'var(--carbs)', text: 'var(--carbs-text)' },
    { value: card.fat_g, label: 'F', color: 'var(--fat)', text: 'var(--fat-text)' },
  ];
  // Macro split by energy, not by grams — 30g of fat is more than twice the
  // calories of 30g of carbohydrate, so a gram-weighted bar misreads the meal.
  const energy = [card.protein_g * 4, card.carbs_g * 4, card.fat_g * 9];
  const total = energy.reduce((a, b) => a + b, 0);

  return (
    <Shell>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          {/* Sized to sit on the same baseline block as the description, so a
              one-line and a two-line card do not stagger their pictures. */}
          <span aria-hidden className="shrink-0 text-[22px] leading-none">
            {foodEmoji(card.description, card.meal)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-body font-bold">{card.description}</p>
            <p className="text-footnote text-muted-foreground font-semibold">
              {MEAL_LABEL[card.meal] ?? card.meal}
              {card.confidence === 'low' && ' · rough estimate'}
            </p>
          </div>
        </div>
        <span className="text-figure shrink-0 text-body">
          {approx && '~'}
          {card.kcal.toLocaleString()}
          <span className="text-muted-foreground text-footnote font-semibold"> kcal</span>
        </span>
      </div>

      {total > 0 && (
        <div className="bg-muted border-border mt-3 flex h-2.5 gap-px overflow-hidden rounded-full border">
          {energy.map((value, i) => (
            <div
              key={macros[i]!.label}
              style={{ width: `${(value / total) * 100}%`, background: macros[i]!.color }}
            />
          ))}
        </div>
      )}

      <div className="mt-2 flex gap-3">
        {macros.map((macro) => (
          <span key={macro.label} className="tnum text-footnote font-bold">
            {/* The text cut, not the fill: mango at 13px on white is 2:1. */}
            <span style={{ color: macro.text }}>{Math.round(macro.value)}</span>
            <span className="text-muted-foreground">{macro.label}</span>
          </span>
        ))}
      </div>

      {card.items.length > 1 && (
        <p className="text-footnote text-muted-foreground mt-2 truncate font-medium">
          {card.items
            .map((item) => (item.quantity ? `${item.name} ${item.quantity}` : item.name))
            .join(' · ')}
        </p>
      )}

      <button
        type="button"
        onClick={onEdit}
        aria-label={`Edit ${card.description}`}
        className="text-footnote text-muted-foreground hover:text-foreground mt-1.5 ml-auto block font-semibold"
      >
        Edit
      </button>

      {card.day && <DayProgress day={card.day} kcal={card.kcal} today={today} />}
    </Shell>
  );
}

/**
 * The meal, put where it lands in the day.
 *
 * A calorie figure on its own is a number people have to do sums with: 640 is
 * a third of one person's day and most of another's, and the app was already
 * making them read two numbers and subtract. So the card draws it — the day so
 * far in a quiet green, this meal as the bright band on the end of it, and
 * whatever is left as empty track. It answers "how am I doing?" at a glance,
 * before anyone has read a digit.
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
  today,
}: {
  day: NonNullable<Extract<Card, { type: 'food' }>['day']>;
  /** Only the picture's description now — the figure itself is in the header. */
  kcal: number;
  today?: string;
}) {
  const locale = useLocale();
  const target = Math.max(1, Math.round(day.target_kcal));
  const before = Math.max(0, Math.round(day.kcal_before));
  // Defensive: a card written before a deletion elsewhere could otherwise ask
  // for a negative band, which paints as a full-width one.
  const after = Math.max(before, Math.round(day.kcal_after));
  const over = after > target;
  const remaining = target - after;
  // The bar is the target's width until the day runs past it, and the day's
  // width after that — so a 3,000 kcal day still fits, and the notch says
  // where the target was rather than the bar quietly rescaling nothing.
  const scale = Math.max(target, after);

  const underTarget = Math.min(before, target);
  const bands = [
    { key: 'earlier', kcal: underTarget, mine: false, over: false },
    { key: 'earlier-over', kcal: Math.max(0, before - target), mine: false, over: true },
    { key: 'meal', kcal: Math.max(0, Math.min(after, target) - underTarget), mine: true, over: false },
    { key: 'meal-over', kcal: Math.max(0, after - Math.max(before, target)), mine: true, over: true },
  ].filter((band) => band.kcal > 0);
  const last = bands.length - 1;

  return (
    <div className="border-border/70 mt-3 border-t-2 border-dashed pt-2.5">
      <div
        role="img"
        aria-label={[
          `${after.toLocaleString()} of ${target.toLocaleString()} kcal`,
          dayWord(day.local_date, locale, today),
          `— this meal ${kcal.toLocaleString()}.`,
          over
            ? `${Math.abs(remaining).toLocaleString()} over.`
            : `${remaining.toLocaleString()} left.`,
        ]
          .filter(Boolean)
          .join(' ')}
        // A hairline of track between the bands, exactly as the macro bar
        // above separates its three — it is what makes the day so far and this
        // meal read as two things rather than one two-tone one.
        className="bg-muted border-border relative flex h-3 gap-px overflow-hidden rounded-full border"
      >
        {bands.map((band, i) => (
          <div
            key={band.key}
            className={cn(
              // Never shrunk: the spring overshoots by design, and a band that
              // gave way to it would drag the whole day back and forth.
              'h-full shrink-0',
              // Only this meal's band grows. The day so far was already true
              // when the card arrived, and animating it would claim otherwise.
              band.mine && 'animate-band',
              i === last && 'rounded-r-full',
            )}
            style={{
              width: `${bandWidth(band.kcal, band.mine, scale)}%`,
              background: bandFill(band.mine, band.over),
            }}
          />
        ))}

        {/* Where the day was aiming, kept visible once it has been passed. */}
        {over && (
          <span
            aria-hidden
            className="absolute inset-y-0 w-0.5 bg-[var(--card)] opacity-70"
            style={{ left: `${(target / scale) * 100}%` }}
          />
        )}
      </div>

      {/*
        Both halves of the answer, because "1,315 left" on its own is only half
        of it: it says where the day is going and never says where it has got
        to. The two figures are the same pair the ring on the dashboard carries,
        in the same order, so glancing between them is not translation work.

        This meal's own figure is not among them: the header states it, two
        lines up and in the largest type on the card. A legend repeating it made
        the same number appear twice inside one card, which reads as two
        different facts until you have checked that it isn't.
      */}
      <div className="tnum text-footnote text-muted-foreground mt-2 font-semibold">
        {/* The day so far leads, at ink weight: it is the figure the bar is
            a picture of, and the one they came to the card for. */}
        <span className="text-foreground font-extrabold">{after.toLocaleString()}</span> of{' '}
        {target.toLocaleString()}
        {' · '}
        <span className={cn('font-bold', over && 'text-foreground')}>
          {over
            ? `${Math.abs(remaining).toLocaleString()} over`
            : `${remaining.toLocaleString()} left`}
        </span>
        {dayWord(day.local_date, locale, today) && ` ${dayWord(day.local_date, locale, today)}`}
      </div>
    </div>
  );
}

/**
 * A band's share of the bar, with a floor under this meal's own.
 *
 * An apple against a 2,200 kcal day is four percent of the track — three
 * pixels, which on a bar with a border reads as nothing logged at all. The
 * floor costs a little accuracy on exactly the meals whose accuracy nobody is
 * reading off the bar, and buys the one thing the card is for: seeing that the
 * thing you just said went in. Only this meal's band gets it; padding the day
 * so far would make the whole day look further along than it is.
 */
function bandWidth(kcal: number, mine: boolean, scale: number): number {
  const share = (kcal / scale) * 100;
  return mine ? Math.max(share, 2.5) : share;
}

/** Green up to the target, ink past it; the day so far steps back behind both. */
function bandFill(mine: boolean, over: boolean): string {
  const colour = over ? 'var(--foreground)' : 'var(--calories)';
  return mine ? colour : `color-mix(in oklch, ${colour}, transparent 68%)`;
}

/**
 * Which day the bar is talking about, said only when it is not this one.
 *
 * Two figures and a date is more line than a phone has, and "today" is what
 * everybody assumes anyway — so the words are spent on the case that would
 * otherwise mislead: a meal logged onto yesterday, whose bar would read as
 * today's day. Silent, too, when nobody has told us which day is current; a
 * guess is the one answer that could be wrong without looking wrong.
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
  const units = useUnits();
  const [edited, setEdited] = useState<Extract<Card, { type: 'exercise' }> | null>(null);
  const [editing, setEditing] = useState(false);

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
        />
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="text-footnote text-muted-foreground hover:text-foreground mt-1.5 ml-auto block font-semibold"
        >
          Cancel
        </button>
      </>
    );
  }

  return (
    <Shell>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <span aria-hidden className="shrink-0 text-[22px] leading-none">
            {exerciseEmoji(shown.description)}
          </span>
          <p className="min-w-0 flex-1 truncate text-body font-bold">{shown.description}</p>
        </div>
        <span className="text-figure shrink-0 text-body text-[var(--exercise-text)]">
          −{shown.kcal_burned.toLocaleString()}
          <span className="text-muted-foreground text-footnote font-semibold"> kcal</span>
        </span>
      </div>
      <p className="text-footnote text-muted-foreground mt-1.5 font-medium">
        {detail.length > 0 ? detail.join(' · ') : 'Burn is an estimate'}
        {/* §9 restated where the burn is: it is not a credit to spend. */}
        {' · not added to your budget'}
      </p>

      {/*
        Quiet, and on the receipt rather than behind a hover: a correction is an
        ordinary thing to want, and an affordance nobody can see is a feature
        nobody finds. Weighted like the subline above it, because it is not what
        the card is for.
      */}
      <button
        type="button"
        onClick={() => setEditing(true)}
        aria-label={`Edit ${shown.description}`}
        className="text-footnote text-muted-foreground hover:text-foreground mt-1.5 ml-auto block font-semibold"
      >
        Edit
      </button>

      {/*
        The sets, where there were any.
        
        A strength session summed to one calorie figure is the least interesting
        thing about it — the number nobody trained for. What was actually done
        is the load and the reps, so the card shows those and lets the burn stay
        the small print it deserves to be.
      */}
      {shown.sets.length > 0 && (
        <div className="mt-2.5 space-y-1">
          {groupSets(shown.sets, units).map((group) => (
            <div key={group.name} className="flex items-baseline justify-between gap-3">
              <span className="text-footnote min-w-0 flex-1 truncate">{group.name}</span>
              <span className="text-footnote text-muted-foreground shrink-0 tabular-nums">
                {group.detail}
              </span>
            </div>
          ))}
        </div>
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
 *
 * The load is converted per distinct value rather than after joining, so that
 * "80/85 kg" becomes "176/187 lb" and not a rounded pair that collides.
 */
function groupSets(sets: Extract<Card, { type: 'exercise' }>['sets'], units: UnitSystem) {
  const byName = new Map<string, typeof sets>();
  for (const set of sets) {
    byName.set(set.name, [...(byName.get(set.name) ?? []), set]);
  }

  return [...byName].map(([name, group]) => {
    const reps = group.map((s) => s.reps).filter((r): r is number => r !== null);
    const weights = [...new Set(group.map((s) => s.weight_kg).filter((w): w is number => w !== null))];
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
      setError('That is not a weight.');
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
      onLogged?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <Shell>
        <div className="flex items-center gap-2.5">
          <span aria-hidden className="text-[22px] leading-none">⚖️</span>
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value.replace(/[^0-9.]/g, ''))}
            aria-label="Weight"
            inputMode="decimal"
            autoFocus
            className="text-figure flex-1"
          />
          <span className="text-footnote text-muted-foreground">{bodyWeightUnit(units)}</span>
        </div>

        {error !== null && (
          <p className="text-footnote text-destructive mt-1.5 font-semibold">{error}</p>
        )}

        <div className="mt-2.5 flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setError(null);
            }}
            className="text-footnote text-muted-foreground hover:text-foreground font-semibold"
          >
            Cancel
          </button>
          <Button onClick={() => void save()} disabled={saving} className="gap-1.5 rounded-full">
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="flex items-baseline gap-2.5">
        <span aria-hidden className="text-[22px] leading-none">⚖️</span>
        <span className="text-figure text-[24px]">{formatBodyWeight(shown, units)}</span>
        {card.change_7d_kg !== null && card.change_7d_kg !== 0 && (
          <span
            className={cn(
              'tnum text-footnote font-bold',
              card.change_7d_kg < 0 ? 'text-[var(--positive)]' : 'text-muted-foreground',
            )}
          >
            {card.change_7d_kg > 0 ? '+' : '−'}
            {formatWeightDelta(Math.abs(card.change_7d_kg), units, false)} this week
          </span>
        )}
      </div>
      <Sparkline
        points={card.series}
        stroke="var(--foreground)"
        height={44}
        className="mt-2 opacity-80"
      />

      {/* Only where the card knows which day it is for. An older row cannot say,
          and guessing would write today's weight over a reading from March. */}
      {card.local_date !== null && (
        <button
          type="button"
          onClick={() => {
            setDraft(String(toBodyWeight(shown, units)));
            setEditing(true);
          }}
          aria-label="Edit this weigh-in"
          className="text-footnote text-muted-foreground hover:text-foreground mt-1.5 ml-auto block font-semibold"
        >
          Edit
        </button>
      )}
    </Shell>
  );
}

const METRIC_COLOR: Record<string, string> = {
  calories: 'var(--calories)',
  protein: 'var(--protein)',
  weight: 'var(--foreground)',
  exercise: 'var(--exercise)',
};

function TrendCard({ card }: { card: Extract<Card, { type: 'trend' }> }) {
  const hasPoints = card.series.some((point) => point.average !== null);

  return (
    <Shell>
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 flex-1 truncate text-body font-bold">{card.title}</p>
        {card.average !== null && (
          <span className="tnum text-muted-foreground shrink-0 text-footnote font-semibold">
            avg{' '}
            <span className="text-foreground font-extrabold">
              {card.average.toLocaleString()}
            </span>{' '}
            {card.unit}
          </span>
        )}
      </div>

      {hasPoints ? (
        <Sparkline
          points={card.series}
          stroke={METRIC_COLOR[card.metric] ?? 'var(--calories)'}
          target={card.target}
          variant={card.metric === 'exercise' ? 'bars' : 'line'}
          className="mt-2.5"
        />
      ) : (
        // Better an empty state than an axis with one point on it pretending
        // to be a trend.
        <p className="text-footnote text-muted-foreground mt-2 font-medium">
          Not enough logged days yet to draw a trend.
        </p>
      )}

      {card.caption && (
        <p className="text-footnote text-muted-foreground mt-2 font-medium">{card.caption}</p>
      )}
    </Shell>
  );
}

function DayCard({ card }: { card: Extract<Card, { type: 'day' }> }) {
  const locale = useLocale();
  const remaining = card.targets.kcal - card.consumed.kcal;
  const over = remaining < 0;
  const pct = Math.min(100, (card.consumed.kcal / Math.max(1, card.targets.kcal)) * 100);
  const macros = [
    { key: 'protein_g', label: 'Protein', color: 'var(--protein-text)' },
    { key: 'carbs_g', label: 'Carbs', color: 'var(--carbs-text)' },
    { key: 'fat_g', label: 'Fat', color: 'var(--fat-text)' },
  ] as const;

  return (
    <Shell>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-figure text-body">
          {card.consumed.kcal.toLocaleString()}
          <span className="text-muted-foreground text-footnote font-semibold">
            {' '}
            / {card.targets.kcal.toLocaleString()} kcal
          </span>
        </p>
        {/* Ink, not red: over target is information, not a telling-off. */}
        <span
          className={cn(
            'tnum text-footnote shrink-0 font-bold',
            over ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          {over
            ? `${Math.abs(remaining).toLocaleString()} over`
            : `${remaining.toLocaleString()} left`}
        </span>
      </div>

      <div className="bg-muted border-border mt-2.5 h-2.5 overflow-hidden rounded-full border">
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            background: over ? 'var(--foreground)' : 'var(--calories)',
            transition: 'width var(--dur-spring) var(--ease-spring)',
          }}
        />
      </div>

      <div className="mt-2.5 flex gap-3">
        {macros.map(({ key, label, color }) => (
          <span key={key} className="tnum text-footnote font-bold">
            <span style={{ color }}>{Math.round(card.consumed[key])}</span>
            <span className="text-muted-foreground">
              /{card.targets[key]} {label}
            </span>
          </span>
        ))}
      </div>

      {card.burned_kcal > 0 && (
        <p className="tnum text-footnote text-muted-foreground mt-2">
          <span className="font-bold text-[var(--exercise-text)]">−{card.burned_kcal} burned</span>
          {' · '}
          {formatDate(card.local_date, locale)}
        </p>
      )}
      {card.caption && (
        <p className="text-footnote text-muted-foreground mt-2 font-medium">{card.caption}</p>
      )}
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
 * and the prose sits underneath at one paragraph, with the rest a click away.
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
  const units = useUnits();
  const [open, setOpen] = useState(false);

  // Paragraphs rather than a line clamp: a clamp cuts mid-sentence and cannot
  // say how much is left, and a paragraph is the honest unit of prose anyway.
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
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-body font-bold">Last week</p>
        <span className="text-footnote text-muted-foreground shrink-0 font-semibold">
          {formatDate(card.week_start, locale)} – {formatDate(card.week_end, locale)}
        </span>
      </div>

      <div className="mt-3 flex gap-1">
        {week.map((day) => (
          <div
            key={day.date}
            title={day.kcal === null ? 'Nothing logged' : `${day.kcal.toLocaleString()} kcal`}
            className={cn(
              'text-footnote flex h-[30px] flex-1 items-center justify-center rounded-[9px] border-2 font-bold',
              day.hit
                ? 'border-transparent'
                : day.kcal !== null
                  ? 'bg-muted border-transparent'
                  : 'text-muted-foreground border-border',
            )}
            style={
              day.hit
                ? { background: 'var(--calories)', color: 'var(--primary-foreground)' }
                : undefined
            }
          >
            {WEEKDAY_INITIALS[new Date(`${day.date}T00:00:00Z`).getUTCDay()]}
          </div>
        ))}
      </div>
      <p className="text-footnote text-muted-foreground mt-2">
        {card.days_logged === 0
          ? 'Nothing logged this week.'
          : `${card.days_logged} day${card.days_logged === 1 ? '' : 's'} logged, ${card.days_on_target} within 10% of target.`}
      </p>

      <div className="mt-3.5 flex gap-3">
        <Figure
          value={card.mean_kcal === null ? '—' : Math.round(card.mean_kcal).toLocaleString()}
          unit=" kcal"
          label={`a day, against ${card.target_kcal.toLocaleString()}`}
        />
        {card.weight_change_kg !== null ? (
          <Figure value={formatWeightDelta(card.weight_change_kg, units)} label="on the scale" />
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
      </div>

      {card.target_change && (
        <div className="bg-muted border-border mt-3.5 rounded-2xl border-2 px-3.5 py-3">
          <div className="tnum text-body flex items-center gap-2 font-bold">
            <span className="text-muted-foreground">
              {card.target_change.from_kcal.toLocaleString()}
            </span>
            <ArrowRight size={14} className="text-muted-foreground" />
            <span className="text-[var(--calories-text)]">
              {card.target_change.to_kcal.toLocaleString()} kcal
            </span>
          </div>
          <p className="text-footnote text-muted-foreground mt-1.5">
            {card.target_change.explanation}
          </p>
        </div>
      )}

      {shown.length > 0 && (
        <div className="border-border mt-3.5 flex flex-col gap-2.5 border-t-2 pt-3">
          {shown.map((paragraph, index) => (
            <p key={index} className="text-body leading-relaxed">
              {paragraph}
            </p>
          ))}
        </div>
      )}

      {rest > 0 && (
        <button
          type="button"
          onClick={() => setOpen((was) => !was)}
          className="text-footnote mt-2.5 font-bold text-[var(--calories-text)]"
        >
          {open ? 'Show less' : `Read the rest (${rest} more)`}
        </button>
      )}
    </Shell>
  );
}

/** A number and what it is a number of. Two of them make the review's top line. */
function Figure({ value, unit, label }: { value: string; unit?: string; label: string }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="text-figure tnum text-[20px] leading-[26px]">
        {value}
        {unit ? <span className="text-muted-foreground text-footnote font-semibold">{unit}</span> : null}
      </p>
      <p className="text-footnote text-muted-foreground">{label}</p>
    </div>
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
