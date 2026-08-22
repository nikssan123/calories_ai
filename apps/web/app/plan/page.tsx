'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  CalendarDays,
  Check,
  ChefHat,
  Clock,
  Loader2,
  Plus,
  ShoppingBasket,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import type {
  MealPlan,
  MealPlanBrief,
  MealPlanSlot,
  ShoppingItem,
  ShoppingList,
} from '@ct/shared';
import { formatMass } from '@ct/shared';
import { api } from '@/lib/api';
import { useUnits } from '@/lib/units';
import { InsetGroup, InsetRow } from '@/components/InsetGroup';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { foodEmoji } from '@ct/shared/food-emoji';
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
      // Always worth a request now. The list used to be nothing but a
      // projection of the plan, so an unplanned week could not have one; it
      // holds written lines too, and those exist whether or not anybody has
      // planned anything.
      setList(await api.shoppingList(week_start));
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
              // The column used to be reserved only once the plan had produced
              // something to buy, on the grounds that it was otherwise 320px of
              // nothing beside a form. It is never nothing now: an empty list
              // still has a field to write on, which is the whole point of the
              // panel on a week nobody has planned yet.
              list && 'lg:grid-cols-[1fr_320px]',
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
                    Fill the week in below, or ask for it in the{' '}
                    <Link
                      href="/"
                      className="text-foreground font-semibold underline underline-offset-2"
                    >
                      journal
                    </Link>
                    .
                  </p>
                </div>
              )}

              <InsetGroup
                title="🍳  How to plan the week"
                footer={
                  <>
                    This is the most expensive thing the kitchen does, so it runs once and you edit
                    it after. Or say it in the{' '}
                    <Link
                      href="/"
                      className="text-foreground font-semibold underline underline-offset-2"
                    >
                      journal
                    </Link>{' '}
                    — “plan my dinners this week, two of us, nothing over 30 minutes”.
                  </>
                }
              >
                {/*
                  Labelled, rather than left to its placeholder to explain itself.
                  Every other row here says what it is before you touch it, and a
                  bare field at the top of the group was the one thing you had to
                  click into to find out.
                */}
                <div className="px-4 py-3.5">
                  <label
                    htmlFor="plan-wants"
                    className="text-footnote text-muted-foreground mb-1.5 block font-medium"
                  >
                    Anything happening this week?
                  </label>
                  <Input
                    id="plan-wants"
                    value={wants}
                    onChange={(e) => setWants(e.target.value)}
                    placeholder="“out on Thursday”, “use up the squash”"
                    className="bg-muted/60 border-border h-11 rounded-full border-2 px-4 text-body"
                  />
                </div>

                {/*
                  A whole label and a line saying what it does to the week, on each
                  of the three.

                  They were sentence fragments finished by their own controls
                  — "Feeding" [2], "On a weeknight" [30m] — which is a caption
                  for a number rather than a question anybody could answer, and it
                  read as a label for something else entirely unless you already
                  knew what the planner did with it. "On a weeknight" was also
                  untrue: the number goes to the model as the time they have, for
                  every night in the run and the weekend with it, so it is the
                  longest cook of the week and now says so.
                */}
                <InsetRow>
                  <div className="flex-1">
                    <p className="text-body">How many it feeds</p>
                    <p className="text-muted-foreground text-[13px] font-medium">
                      Every dinner is cooked for this many.
                    </p>
                  </div>
                  <div
                    role="group"
                    aria-label="How many it feeds"
                    className="flex shrink-0 items-center gap-1.5"
                  >
                    {[1, 2, 3, 4].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setServings(n)}
                        aria-pressed={servings === n}
                        aria-label={n === 1 ? '1 person' : `${n} people`}
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
                      A bigger cook covers the night after it, so the week has fewer evenings at the
                      stove.
                    </p>
                  </div>
                  <Switch
                    checked={batch}
                    onCheckedChange={setBatch}
                    aria-label="Cook once, eat twice"
                  />
                </InsetRow>

                <InsetRow>
                  <div className="flex-1">
                    <p className="text-body">Longest cook</p>
                    <p className="text-muted-foreground text-[13px] font-medium">
                      No dinner in the week takes longer than this.
                    </p>
                  </div>
                  <div
                    role="group"
                    aria-label="Longest cook"
                    className="flex shrink-0 items-center gap-1.5"
                  >
                    {[20, 30, 45, null].map((m) => (
                      <button
                        key={String(m)}
                        type="button"
                        onClick={() => setMinutes(m)}
                        aria-pressed={minutes === m}
                        aria-label={m === null ? 'Any length' : `${m} minutes`}
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

            <Shopping list={list} onList={setList} />
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
 * The shop the week implies, and the things it never could.
 *
 * The ingredients are derived on every read and stored nowhere, so they cannot
 * disagree with the week beside them — swapping a night changes this list
 * rather than leaving a stale line somebody buys against. That is also why they
 * carry no tick and no delete: they are an answer rather than a list, and the
 * way to settle one is to cook the night, change it, or say it is in the
 * kitchen already.
 *
 * Written lines are the other half. Nothing in a recipe produces kitchen roll,
 * so nothing could hold it, and a shopping list you cannot write kitchen roll
 * on is one people keep a second copy of on their phone. Those rows are stored,
 * they tick off, and they are the only ones this screen can delete.
 */
function Shopping({
  list,
  onList,
}: {
  list: ShoppingList | null;
  onList: (next: ShoppingList) => void;
}) {
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const units = useUnits();

  if (!list) return null;

  const week = list.week_start;
  const left = list.items.filter((item) => !item.bought).length;

  async function write() {
    const typed = draft.trim();
    if (!typed || busy) return;
    setBusy(true);
    try {
      // Comma-separated in one go, as the kitchen's own add field takes it:
      // "kitchen roll, bin bags, milk" is how a list actually gets written, and
      // three round trips would be three chances to lose one.
      const names = typed
        .split(',')
        .map((n) => n.trim())
        .filter(Boolean);
      onList(await api.addShoppingItems(names.map((name) => ({ name })), week));
      setDraft('');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function tick(item: ShoppingItem) {
    try {
      await api.updateShoppingItem(item.extra_id!, { bought: !item.bought });
      onList(await api.shoppingList(week));
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function remove(item: ShoppingItem) {
    try {
      await api.deleteShoppingItem(item.extra_id!);
      toast.success(`Took ${item.name} off the list`);
      onList(await api.shoppingList(week));
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <InsetGroup
      title="🧺  Shopping list"
      trailing={<span className="text-footnote text-muted-foreground tnum font-bold">{left}</span>}
      footer={
        list.have_already.length > 0
          ? `Left off because your kitchen has them: ${list.have_already.join(', ')}.`
          : undefined
      }
      className="lg:sticky lg:top-4"
    >
      {/*
        Shaped like the kitchen's add field rather than like the ask box on the
        Cook screen, and for the same reason: this writes a row that outlives
        the visit, so it is squared off, labelled, and its button says the verb.
      */}
      <div className="p-3">
        <label
          htmlFor="shopping-add"
          className="text-footnote text-muted-foreground mb-1.5 block font-medium"
        >
          Add to the list
        </label>
        <div className="flex items-center gap-2">
          <Input
            id="shopping-add"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void write();
            }}
            placeholder="kitchen roll, bin bags"
            className="bg-muted/60 border-border h-11 rounded-xl border-2 px-3 text-body"
          />
          <Button
            variant="secondary"
            disabled={!draft.trim() || busy}
            onClick={() => void write()}
            className="h-11 shrink-0 gap-1.5 rounded-xl px-4"
          >
            <Plus size={16} />
            Add
          </Button>
        </div>
        <p className="text-footnote text-muted-foreground mt-1.5 font-medium">
          For anything no recipe would ask for. The ingredients below come from the week.
        </p>
      </div>

      {list.items.length === 0 ? (
        <p className="text-muted-foreground px-4 py-4 text-body">
          Nothing on the list yet. Plan the week, or write what you need.
        </p>
      ) : (
        list.items.map((item) => {
          // A line somebody wrote is theirs to tick off or take back. An
          // ingredient is not: it is here because a night needs it, so it goes
          // by cooking that night or changing it — a delete button on one would
          // promise something this screen cannot do.
          const written = item.extra_id !== null;
          return (
            <InsetRow key={item.name} className="py-3">
              {written ? (
                <button
                  type="button"
                  onClick={() => void tick(item)}
                  aria-pressed={item.bought}
                  aria-label={
                    item.bought ? `Put ${item.name} back on the list` : `Tick off ${item.name}`
                  }
                  className={cn(
                    'flex size-[22px] shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                    item.bought
                      ? 'bg-primary text-primary-foreground border-transparent'
                      : 'border-border text-transparent',
                  )}
                >
                  <Check size={13} strokeWidth={3} />
                </button>
              ) : (
                <ShoppingBasket size={15} className="text-muted-foreground shrink-0" />
              )}

              <div className="min-w-0 flex-1">
                <p className={cn('text-body', item.bought && 'text-muted-foreground line-through')}>
                  {item.name}
                </p>
                <p className="text-muted-foreground text-footnote font-medium">
                  {item.quantity_g !== null
                    ? formatMass(item.quantity_g, units)
                    : item.quantity_descs.join(' + ') || '—'}
                </p>
              </div>

              {item.for_dates.length > 0 && (
                <span className="text-footnote text-muted-foreground tnum shrink-0 font-semibold">
                  {item.for_dates.length === 1 ? '1 night' : `${item.for_dates.length} nights`}
                </span>
              )}
              {written && (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => void remove(item)}
                  className="text-muted-foreground hover:text-foreground size-8 shrink-0"
                  aria-label={`Take ${item.name} off the list`}
                >
                  <Trash2 size={15} />
                </Button>
              )}
            </InsetRow>
          );
        })
      )}
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
