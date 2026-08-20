'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, Check, ChefHat, Clock, Loader2, ShoppingBasket, X } from 'lucide-react';
import { toast } from 'sonner';
import type { MealPlan, MealPlanBrief, MealPlanSlot, ShoppingList } from '@ct/shared';
import { api } from '@/lib/api';
import { InsetGroup, InsetRow } from '@/components/InsetGroup';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { foodEmoji } from '@/lib/foodEmoji';
import { cn } from '@/lib/utils';

/**
 * The week ahead — seven dinner slots and the shop they imply.
 *
 * Deliberately not the Cook grid with dates bolted on. Cook is a screen for
 * choosing between things, so it is a grid of tiles you browse; this is a
 * screen for reading a decision already made, so it is a list in the order the
 * days happen. A week laid out as a grid loses the only thing that makes it a
 * week.
 *
 * Dinner only, and the subtitle says so rather than leaving people to notice:
 * breakfast and lunch are habitual, they would go stale within days, and a plan
 * carrying four wrong entries for every right one reads as wrong throughout.
 */
export default function PlanPage() {
  const [plan, setPlan] = useState<MealPlan | null>(null);
  const [list, setList] = useState<ShoppingList | null>(null);
  const [loading, setLoading] = useState(true);
  const [thinking, setThinking] = useState(false);

  const [wants, setWants] = useState('');
  const [servings, setServings] = useState(1);
  const [minutes, setMinutes] = useState<number | null>(null);
  const [batch, setBatch] = useState(true);

  const load = useCallback(async () => {
    try {
      const { plan: found, week_start } = await api.mealPlan();
      setPlan(found);
      // Only worth a request when there is a week to shop for.
      setList(found ? await api.shoppingList(week_start) : null);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function generate() {
    setThinking(true);
    try {
      const brief: MealPlanBrief = {
        wants: wants.trim() || undefined,
        servings,
        minutes,
        batch,
      };
      const { plan: made, message } = await api.planWeek(brief);
      setPlan(made);
      setList(await api.shoppingList(made.week_start));
      if (message) toast.success(message);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setThinking(false);
    }
  }

  async function skip(slot: MealPlanSlot) {
    try {
      const updated = await api.updateSlot(slot.id, { recipe_id: null });
      setPlan(updated);
      setList(await api.shoppingList(updated.week_start));
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function cook(slot: MealPlanSlot) {
    try {
      const entry = await api.cookSlot(slot.id);
      toast.success(`Logged ${entry.description} — ${Math.round(entry.kcal)} kcal`);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const planned = plan?.slots.some((s) => s.recipe) ?? false;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-5 pb-8 lg:px-6">
      <div className="mx-auto w-full max-w-5xl space-y-7">
        <div>
          <h1 className="text-large-title">This week</h1>
          <p className="text-muted-foreground mt-1.5 text-body font-medium">
            Dinners, priced against your targets. One tap logs the night you cooked.
          </p>
        </div>

        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-32 w-full rounded-2xl" />
            <Skeleton className="h-64 w-full rounded-2xl" />
          </div>
        ) : (
          <div
            className={cn(
              'grid gap-7 lg:items-start',
              // The list's column is only reserved once there is a list. Held
              // open on an unplanned week it is 320px of nothing beside a form.
              list && list.items.length > 0 && 'lg:grid-cols-[1fr_320px]',
            )}
          >
            <div className="space-y-7">
              {plan && planned ? (
                <InsetGroup
                  title={`📅  ${rangeLabel(plan)}`}
                  footer="Open a night to read the method, or skip it if you are out."
                >
                  {plan.slots.map((slot) => (
                    <Night
                      key={slot.id}
                      slot={slot}
                      onCook={() => void cook(slot)}
                      onSkip={() => void skip(slot)}
                    />
                  ))}
                </InsetGroup>
              ) : (
                <div className="bg-card border-border chunk rounded-[var(--radius)] border-2 px-6 py-10 text-center">
                  <span aria-hidden className="animate-bob mb-3 block text-[40px] leading-none">
                    🗓️
                  </span>
                  <p className="text-muted-foreground text-body font-medium">
                    Nothing planned for this week yet.
                    <br />
                    Say what the week looks like and the kitchen will fill the nights in.
                  </p>
                </div>
              )}

              <InsetGroup
                title="🍳  What the week looks like"
                footer="This is the most expensive thing the kitchen does, so it runs once and you edit it after."
              >
                <div className="px-4 py-3.5">
                  <Input
                    value={wants}
                    onChange={(e) => setWants(e.target.value)}
                    placeholder="Anything to steer it — “out on Thursday”, “use up the squash”"
                    className="bg-muted/60 border-border h-11 rounded-full border-2 px-4 text-body"
                  />
                </div>

                <InsetRow>
                  <span className="flex-1 text-body">Feeding</span>
                  <div className="flex items-center gap-1.5">
                    {[1, 2, 3, 4].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setServings(n)}
                        className={cn(
                          'size-9 rounded-full border-2 text-[13px] font-bold transition-colors',
                          servings === n
                            ? 'bg-primary text-primary-foreground border-transparent'
                            : 'border-border text-muted-foreground',
                        )}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </InsetRow>

                <InsetRow>
                  <div className="flex-1">
                    <p className="text-body">Cook once, eat twice</p>
                    <p className="text-muted-foreground text-[13px] font-medium">
                      Lets one cook cover the night after it.
                    </p>
                  </div>
                  <Switch checked={batch} onCheckedChange={setBatch} aria-label="Batch cook" />
                </InsetRow>

                <InsetRow>
                  <span className="flex-1 text-body">On a weeknight</span>
                  <div className="flex items-center gap-1.5">
                    {[20, 30, 45, null].map((m) => (
                      <button
                        key={String(m)}
                        type="button"
                        onClick={() => setMinutes(m)}
                        className={cn(
                          'h-9 rounded-full border-2 px-3 text-[13px] font-bold transition-colors',
                          minutes === m
                            ? 'bg-primary text-primary-foreground border-transparent'
                            : 'border-border text-muted-foreground',
                        )}
                      >
                        {m === null ? 'Any' : `${m}m`}
                      </button>
                    ))}
                  </div>
                </InsetRow>

                <div className="px-4 py-3.5">
                  <Button
                    onClick={() => void generate()}
                    disabled={thinking}
                    className="h-11 w-full rounded-full"
                  >
                    {thinking ? (
                      <>
                        <Loader2 size={16} className="mr-2 animate-spin" />
                        Writing the week…
                      </>
                    ) : (
                      <>
                        <CalendarDays size={16} className="mr-2" />
                        {planned ? 'Plan it again' : 'Plan the week'}
                      </>
                    )}
                  </Button>
                </div>
              </InsetGroup>
            </div>

            <Shopping list={list} />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * One night.
 *
 * A skipped night is drawn as a night rather than hidden, because the gap is
 * the information: a week with Friday empty is a week you are out on Friday,
 * and a list that quietly omits it is a list you have to count.
 */
function Night({
  slot,
  onCook,
  onSkip,
}: {
  slot: MealPlanSlot;
  onCook: () => void;
  onSkip: () => void;
}) {
  const cooked = slot.cooked_at !== null;

  return (
    <InsetRow className={cn('items-start gap-3 py-3.5', cooked && 'opacity-60')}>
      <div className="w-11 shrink-0 pt-0.5">
        <p className="text-footnote text-muted-foreground font-bold">{slot.weekday.slice(0, 3)}</p>
        <p className="text-footnote text-muted-foreground tnum font-medium">
          {String(Number(slot.local_date.slice(8)))}
        </p>
      </div>

      {slot.recipe ? (
        <>
          <span aria-hidden className="pt-0.5 text-[19px] leading-none">
            {foodEmoji(slot.recipe.title)}
          </span>
          <div className="min-w-0 flex-1">
            <Link href={`/cook/recipe/${slot.recipe.id}`} className="text-body font-semibold">
              {slot.recipe.title}
            </Link>
            <p className="text-muted-foreground text-footnote mt-0.5 font-medium">
              <span className="tnum text-foreground font-bold">{Math.round(slot.recipe.kcal)}</span>{' '}
              kcal · {Math.round(slot.recipe.protein_g)}g protein
              {slot.recipe.minutes !== null && (
                <>
                  {' · '}
                  <Clock size={11} className="inline align-[-1px]" /> {slot.recipe.minutes}m
                </>
              )}
            </p>
            {slot.covers.length > 0 && (
              <p className="text-footnote mt-1 font-semibold text-[var(--calories-text)]">
                {slot.covers.length === 1
                  ? 'Cooks enough for the next night too'
                  : `Cooks enough for ${slot.covers.length} more nights`}
              </p>
            )}
          </div>

          {cooked ? (
            <span className="text-footnote flex shrink-0 items-center gap-1 pt-1 font-bold text-[var(--calories-text)]">
              <Check size={14} /> Cooked
            </span>
          ) : (
            <div className="flex shrink-0 items-center gap-1.5">
              <Button size="sm" onClick={onCook} className="h-9 rounded-full px-3.5 text-[13px]">
                <ChefHat size={14} className="mr-1.5" />
                Log
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={onSkip}
                aria-label={`Skip ${slot.weekday}`}
                className="text-muted-foreground size-9 rounded-full p-0"
              >
                <X size={15} />
              </Button>
            </div>
          )}
        </>
      ) : (
        <p className="text-muted-foreground flex-1 pt-0.5 text-body font-medium italic">
          Nothing planned
        </p>
      )}
    </InsetRow>
  );
}

/**
 * The shop.
 *
 * Derived on every read and never stored, so it cannot disagree with the week
 * beside it — swapping a night changes this list rather than leaving a stale
 * line somebody buys against.
 */
function Shopping({ list }: { list: ShoppingList | null }) {
  if (!list || list.items.length === 0) return null;

  return (
    <InsetGroup
      title="🧺  Shopping list"
      trailing={
        <span className="text-footnote text-muted-foreground tnum font-bold">
          {list.items.length}
        </span>
      }
      footer={
        list.have_already.length > 0
          ? `Left off because your kitchen has them: ${list.have_already.join(', ')}.`
          : undefined
      }
      className="lg:sticky lg:top-4"
    >
      {list.items.map((item) => (
        <InsetRow key={item.name} className="py-3">
          <ShoppingBasket size={15} className="text-muted-foreground shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-body">{item.name}</p>
            <p className="text-muted-foreground text-footnote font-medium">
              {item.quantity_g !== null
                ? `${Math.round(item.quantity_g)}g`
                : item.quantity_descs.join(' + ') || '—'}
            </p>
          </div>
          <span className="text-footnote text-muted-foreground tnum shrink-0 font-semibold">
            {item.for_dates.length === 1 ? '1 night' : `${item.for_dates.length} nights`}
          </span>
        </InsetRow>
      ))}
    </InsetGroup>
  );
}

/** "18–22 March", from the week's own first and last night. */
function rangeLabel(plan: MealPlan): string {
  const first = plan.slots[0]?.local_date ?? plan.week_start;
  const last = plan.slots.at(-1)?.local_date ?? plan.week_start;
  const month = (date: string) =>
    new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone: 'UTC' }).format(
      new Date(`${date}T12:00:00Z`),
    );
  const day = (date: string) => String(Number(date.slice(8)));

  return month(first) === month(last)
    ? `${day(first)}–${day(last)} ${month(last)}`
    : `${day(first)} ${month(first)} – ${day(last)} ${month(last)}`;
}
