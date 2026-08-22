'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ChatAction, ChatCard as Card, ExerciseEntry } from '@ct/shared';
import { RecipeCard } from '@/components/kitchen/RecipeCard';
import { WorkoutCard } from '@/components/workout/WorkoutCard';
import { Sparkline } from '@/components/Sparkline';
import { exerciseEmoji, foodEmoji } from '@/lib/foodEmoji';
import { cn } from '@/lib/utils';

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
 * picture of the food — see lib/foodEmoji. Between them those two are most of
 * what makes a reply feel like an answer rather than a receipt.
 */
export function ChatActionCard({
  action,
  messageId,
  onLogged,
}: {
  action: ChatAction;
  /** The message this card sits on — the workout card answers onto it. */
  messageId?: string;
  onLogged?: () => void;
}) {
  if (!action.card) return <Chip action={action} />;
  return <CardBody card={action.card} messageId={messageId} onLogged={onLogged} />;
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
  onLogged,
}: {
  card: Card;
  messageId?: string;
  onLogged?: () => void;
}) {
  switch (card.type) {
    case 'food':
      return <FoodCard card={card} />;
    case 'exercise':
      return <ExerciseCard card={card} />;
    case 'weight':
      return <WeightCard card={card} />;
    case 'trend':
      return <TrendCard card={card} />;
    case 'day':
      return <DayCard card={card} />;
    case 'recipes':
      return <RecipesCard card={card} />;
    case 'plan':
      return <PlanCard card={card} />;
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

function FoodCard({ card }: { card: Extract<Card, { type: 'food' }> }) {
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
    </Shell>
  );
}

function ExerciseCard({ card }: { card: Extract<Card, { type: 'exercise' }> }) {
  const detail = [
    card.distance_km !== null ? `${card.distance_km} km` : null,
    card.duration_min !== null ? `${Math.round(card.duration_min)} min` : null,
  ].filter(Boolean);

  return (
    <Shell>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <span aria-hidden className="shrink-0 text-[22px] leading-none">
            {exerciseEmoji(card.description)}
          </span>
          <p className="min-w-0 flex-1 truncate text-body font-bold">{card.description}</p>
        </div>
        <span className="text-figure shrink-0 text-body text-[var(--exercise-text)]">
          −{card.kcal_burned.toLocaleString()}
          <span className="text-muted-foreground text-footnote font-semibold"> kcal</span>
        </span>
      </div>
      <p className="text-footnote text-muted-foreground mt-1.5 font-medium">
        {detail.length > 0 ? detail.join(' · ') : 'Burn is an estimate'}
        {/* §9 restated where the burn is: it is not a credit to spend. */}
        {' · not added to your budget'}
      </p>

      {/*
        The sets, where there were any.
        
        A strength session summed to one calorie figure is the least interesting
        thing about it — the number nobody trained for. What was actually done
        is the load and the reps, so the card shows those and lets the burn stay
        the small print it deserves to be.
      */}
      {card.sets.length > 0 && (
        <div className="mt-2.5 space-y-1">
          {groupSets(card.sets).map((group) => (
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
 */
function groupSets(sets: Extract<Card, { type: 'exercise' }>['sets']) {
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
      const load = weights.length === 1 ? ` at ${weights[0]}kg` : weights.length > 1 ? ` at ${weights.join('/')}kg` : '';
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
  return (
    <Shell>
      <div className="flex items-baseline gap-2.5">
        <span aria-hidden className="text-[22px] leading-none">⚖️</span>
        <span className="text-figure text-[24px]">{card.weight_kg} kg</span>
        {card.change_7d_kg !== null && card.change_7d_kg !== 0 && (
          <span
            className={cn(
              'tnum text-footnote font-bold',
              card.change_7d_kg < 0 ? 'text-[var(--positive)]' : 'text-muted-foreground',
            )}
          >
            {card.change_7d_kg > 0 ? '+' : '−'}
            {Math.abs(card.change_7d_kg)} kg this week
          </span>
        )}
      </div>
      <Sparkline
        points={card.series}
        stroke="var(--foreground)"
        height={44}
        className="mt-2 opacity-80"
      />
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
          {formatDate(card.local_date)}
        </p>
      )}
      {card.caption && (
        <p className="text-footnote text-muted-foreground mt-2 font-medium">{card.caption}</p>
      )}
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
