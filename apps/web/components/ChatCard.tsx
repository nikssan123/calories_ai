'use client';

import type { ChatAction, ChatCard as Card } from '@ct/shared';
import { Sparkline } from '@/components/Sparkline';
import { cn } from '@/lib/utils';

/**
 * The visual half of a turn.
 *
 * These sit inside the conversation, so they are deliberately quieter than the
 * cards on Today or Progress: no headings, one accent, and never taller than
 * the reply they belong to. A card that outweighs the sentence next to it turns
 * a conversation into a dashboard, which is the thing this product is not.
 */
export function ChatActionCard({ action }: { action: ChatAction }) {
  if (!action.card) return <Chip action={action} />;
  return <CardBody card={action.card} />;
}

/** Actions with nothing to draw — a deletion — stay a line of text. */
function Chip({ action }: { action: ChatAction }) {
  return (
    <div className="bg-card flex items-center gap-2 rounded-xl px-3 py-2">
      <span
        className="size-1.5 shrink-0 rounded-full"
        style={{
          background:
            action.kind === 'food_deleted' ? 'var(--destructive)' : 'var(--calories)',
        }}
      />
      <span className="text-footnote">{action.summary}</span>
    </div>
  );
}

function CardBody({ card }: { card: Card }) {
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
  }
}

const MEAL_LABEL: Record<string, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

function Shell({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('bg-card rounded-2xl px-3.5 py-3', className)}>{children}</div>;
}

function FoodCard({ card }: { card: Extract<Card, { type: 'food' }> }) {
  const approx = card.confidence !== 'high';
  const macros = [
    { value: card.protein_g, label: 'P', color: 'var(--protein)' },
    { value: card.carbs_g, label: 'C', color: 'var(--carbs)' },
    { value: card.fat_g, label: 'F', color: 'var(--fat)' },
  ];
  // Macro split by energy, not by grams — 30g of fat is more than twice the
  // calories of 30g of carbohydrate, so a gram-weighted bar misreads the meal.
  const energy = [card.protein_g * 4, card.carbs_g * 4, card.fat_g * 9];
  const total = energy.reduce((a, b) => a + b, 0);

  return (
    <Shell>
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 flex-1 truncate text-[15px] font-medium">{card.description}</p>
        <span className="tnum shrink-0 text-[15px] font-semibold">
          {approx && '~'}
          {card.kcal.toLocaleString()}
          <span className="text-muted-foreground text-footnote font-normal"> kcal</span>
        </span>
      </div>

      <p className="text-footnote text-muted-foreground mt-0.5">
        {MEAL_LABEL[card.meal] ?? card.meal}
        {card.confidence === 'low' && ' · rough estimate'}
      </p>

      {total > 0 && (
        <div className="bg-muted mt-2.5 flex h-1.5 overflow-hidden rounded-full">
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
          <span key={macro.label} className="tnum text-footnote">
            <span style={{ color: macro.color }}>{Math.round(macro.value)}</span>
            <span className="text-muted-foreground">{macro.label}</span>
          </span>
        ))}
      </div>

      {card.items.length > 1 && (
        <p className="text-footnote text-muted-foreground mt-2 truncate">
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
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 flex-1 truncate text-[15px] font-medium">{card.description}</p>
        <span className="tnum shrink-0 text-[15px] font-semibold text-[var(--exercise)]">
          −{card.kcal_burned.toLocaleString()}
          <span className="text-muted-foreground text-footnote font-normal"> kcal</span>
        </span>
      </div>
      <p className="text-footnote text-muted-foreground mt-0.5">
        {detail.length > 0 ? detail.join(' · ') : 'Burn is an estimate'}
        {/* §9 restated where the burn is: it is not a credit to spend. */}
        {' · not added to your budget'}
      </p>
    </Shell>
  );
}

function WeightCard({ card }: { card: Extract<Card, { type: 'weight' }> }) {
  return (
    <Shell>
      <div className="flex items-baseline gap-2.5">
        <span className="tnum text-[22px] font-semibold">{card.weight_kg} kg</span>
        {card.change_7d_kg !== null && card.change_7d_kg !== 0 && (
          <span
            className={cn(
              'tnum text-footnote font-medium',
              card.change_7d_kg < 0 ? 'text-[var(--protein)]' : 'text-muted-foreground',
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
        <p className="min-w-0 flex-1 truncate text-[15px] font-medium">{card.title}</p>
        {card.average !== null && (
          <span className="tnum text-muted-foreground shrink-0 text-footnote">
            avg{' '}
            <span className="text-foreground font-semibold">
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
        <p className="text-footnote text-muted-foreground mt-2">
          Not enough logged days yet to draw a trend.
        </p>
      )}

      {card.caption && (
        <p className="text-footnote text-muted-foreground mt-2">{card.caption}</p>
      )}
    </Shell>
  );
}

function DayCard({ card }: { card: Extract<Card, { type: 'day' }> }) {
  const remaining = card.targets.kcal - card.consumed.kcal;
  const over = remaining < 0;
  const pct = Math.min(100, (card.consumed.kcal / Math.max(1, card.targets.kcal)) * 100);
  const macros = [
    { key: 'protein_g', label: 'Protein', color: 'var(--protein)' },
    { key: 'carbs_g', label: 'Carbs', color: 'var(--carbs)' },
    { key: 'fat_g', label: 'Fat', color: 'var(--fat)' },
  ] as const;

  return (
    <Shell>
      <div className="flex items-baseline justify-between gap-3">
        <p className="tnum text-[15px] font-medium">
          {card.consumed.kcal.toLocaleString()}
          <span className="text-muted-foreground font-normal">
            {' '}
            / {card.targets.kcal.toLocaleString()} kcal
          </span>
        </p>
        <span
          className={cn(
            'tnum text-footnote shrink-0',
            over ? 'text-destructive' : 'text-muted-foreground',
          )}
        >
          {over
            ? `${Math.abs(remaining).toLocaleString()} over`
            : `${remaining.toLocaleString()} left`}
        </span>
      </div>

      <div className="bg-muted mt-2 h-1 overflow-hidden rounded-full">
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            background: over ? 'var(--destructive)' : 'var(--calories)',
          }}
        />
      </div>

      <div className="mt-2.5 flex gap-3">
        {macros.map(({ key, label, color }) => (
          <span key={key} className="tnum text-footnote">
            <span style={{ color }}>{Math.round(card.consumed[key])}</span>
            <span className="text-muted-foreground">
              /{card.targets[key]} {label}
            </span>
          </span>
        ))}
      </div>

      {card.burned_kcal > 0 && (
        <p className="tnum text-footnote text-muted-foreground mt-2">
          <span className="text-[var(--exercise)]">−{card.burned_kcal} burned</span>
          {' · '}
          {formatDate(card.local_date)}
        </p>
      )}
      {card.caption && (
        <p className="text-footnote text-muted-foreground mt-2">{card.caption}</p>
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
