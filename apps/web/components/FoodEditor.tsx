'use client';

import { useEffect, useState } from 'react';
import { Check, Loader2, Plus, X } from 'lucide-react';
import { type EnergyAdjustment, formatNumber, type FoodEntry, type Meal, parseGrams } from '@ct/shared';
import { foodEmoji } from '@ct/shared/food-emoji';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useLocale, useT, type StringKey } from '@/lib/i18n';

/**
 * A meal as the form that could have collected it — whether or not it exists.
 *
 * The journal's card is a receipt, and until recently a receipt was final: the
 * only way to fix "that was a bigger portion" was to say it in the conversation
 * and spend a model call re-estimating a meal the user could already describe
 * exactly. This is the other door — the numbers themselves, typed.
 *
 * It now opens both ways. With an `entryId` it corrects; with null it creates,
 * which is the manual log path `POST /entries/food` exists for. The web gets no
 * outbox and no offline mode — see OFFLINE.md §7 — but typing a meal in is
 * useful with a network too, and the mobile form gained the same second door.
 *
 * It edits *items*, not the meal's totals, because the totals are not stored:
 * they are summed from the items on the way out. A form that let somebody set
 * the calories directly would be writing a figure the next read would overwrite
 * with the sum of the parts it disagrees with.
 *
 * The entry is fetched rather than taken from the card. The card carries item
 * names and the meal's totals but not what each item is worth, and widening it
 * would put a full nutrition table in every turn to serve the rare correction.
 */

const MEALS: { key: Meal; label: StringKey }[] = [
  { key: 'breakfast', label: 'meal.breakfast' },
  { key: 'lunch', label: 'meal.lunch' },
  { key: 'dinner', label: 'meal.dinner' },
  { key: 'snack', label: 'meal.snackOne' },
];

/** Held as strings so a half-typed number is not rounded out from under them. */
interface DraftItem {
  name: string;
  /**
   * The grouping key the item came in with, carried through the form so a
   * correction does not cost the food its identity — the portion somebody fixes
   * here is exactly the observation `usualPortions` most wants to keep.
   *
   * Dropped the moment they rename the row: a key that says "rice" on something
   * they have retyped as "quinoa" is worse than no key at all.
   */
  canonical: string | null;
  /**
   * The weight the item already had, kept so that opening a meal and saving it
   * does not quietly throw the weight away.
   *
   * The quantity box holds prose, and most of what the model writes into it —
   * "~200g", "1 medium banana" — is not something `parseGrams` will read back.
   * Without this, every pass through this form would null `quantity_g`, and
   * `usualPortions` skips items that have none: correcting a meal would delete
   * the very observation the correction was worth making.
   *
   * Cleared when they edit the box, because at that point the old weight is a
   * claim about a portion they have just told us was different.
   */
  quantity_g: number | null;
  quantity: string;
  kcal: string;
  protein: string;
  carbs: string;
  fat: string;
}

export function FoodEditor({
  entryId,
  initialMeal,
  onSaved,
  onCancel,
}: {
  /** Null to compose a new meal rather than correct an existing one. */
  entryId: string | null;
  /** Which slot a new meal starts in. Ignored when correcting. */
  initialMeal?: Meal;
  /** The saved entry — corrected or newly logged — so the caller can redraw. */
  onSaved: (entry: FoodEntry) => void;
  onCancel: () => void;
}) {
  const creating = entryId === null;
  const [entry, setEntry] = useState<FoodEntry | null>(null);
  const [description, setDescription] = useState('');
  const [meal, setMeal] = useState<Meal>(initialMeal ?? 'lunch');
  // One blank row to type into. An empty form with an "add item" link is a form
  // that asks to be started before it can be filled in.
  const t = useT();
  const locale = useLocale();
  const [items, setItems] = useState<DraftItem[]>(creating ? [blank()] : []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (entryId === null) return;
    let cancelled = false;
    api
      .foodEntry(entryId)
      .then((found) => {
        if (cancelled) return;
        setEntry(found);
        setDescription(found.description);
        setMeal(found.meal);
        setItems(found.items.map(toDraft));
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [entryId]);

  /*
   * What the log would not store as typed, from the last save.
   *
   * Not an error — the meal is saved and the form has already closed over the
   * corrected numbers — but it must be said. This route's contract is that a
   * figure somebody typed on purpose is not second-guessed, and an arithmetic
   * impossibility is the one thing that overrides it; overriding it in silence
   * would be the indefensible part.
   */
  const [adjusted, setAdjusted] = useState<EnergyAdjustment[]>([]);

  function patch(index: number, next: Partial<DraftItem>) {
    // Renaming a row makes it a different food, and the key it inherited was
    // about the old one.
    const renamed = next.name !== undefined ? { canonical: null } : {};
    // Same for the weight: once they retype the quantity, the grams that came
    // with the old text are about a portion they are in the middle of changing.
    const reweighed = next.quantity !== undefined ? { quantity_g: null } : {};
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, ...next, ...renamed, ...reweighed } : item)),
    );
  }

  async function save() {
    const payload = items.map(fromDraft).filter((item) => item.name.trim().length > 0);
    // The API refuses an empty meal, and rightly — a meal with nothing in it is
    // a deletion, which is a different button with a different confirmation.
    if (payload.length === 0) {
      setError(t('editor.needsAnItem'));
      return;
    }

    const label = description.trim();
    if (creating && label.length === 0) {
      // The API refuses this too, but the sentence it answers with is about a
      // field rather than about a meal, and this form knows what it is asking.
      setError(t('editor.needsAName'));
      return;
    }

    setSaving(true);
    try {
      const saved = entryId
        ? await api.updateFoodEntry(entryId, { description: label || undefined, meal, items: payload })
        : await api.logFoodEntry({ description: label, meal, items: payload });
      setAdjusted(saved.adjusted ?? []);
      // Held open when something was changed, so the sentence saying so is not
      // torn off the screen by the caller redrawing behind it.
      if ((saved.adjusted ?? []).length > 0) {
        setItems(saved.items.map(toDraft));
        return;
      }
      onSaved(saved);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (error !== null && entry === null) {
    return (
      <Shell>
        <p className="text-footnote text-destructive font-semibold">{error}</p>
        <button
          type="button"
          onClick={onCancel}
          className="text-footnote text-muted-foreground hover:text-foreground font-semibold"
        >
          Close
        </button>
      </Shell>
    );
  }

  if (entry === null && !creating) {
    return (
      <Shell>
        <p className="text-footnote text-muted-foreground">{t('common.loading')}</p>
      </Shell>
    );
  }

  // Shown live off the drafts, because the figure people are correcting *to* is
  // usually the total — they adjust an item and watch this land on the number
  // they remember from the packet.
  const total = items.reduce((sum, item) => sum + (Number(item.kcal) || 0), 0);
  // The receipt's own bar, redrawn off the drafts. The card this replaces shows
  // the meal as a macro split, so the form that corrects it shows the same
  // split, moving — which is also the only thing here that reports on four
  // typed numbers at once. Split by energy, not by grams, for the reason
  // written on the card: a gram of fat is not a gram of carbohydrate.
  const energy = [
    { key: 'p', kcal: grams(items, 'protein') * 4, fill: 'var(--protein)' },
    { key: 'c', kcal: grams(items, 'carbs') * 4, fill: 'var(--carbs)' },
    { key: 'f', kcal: grams(items, 'fat') * 9, fill: 'var(--fat)' },
  ];
  const split = energy.reduce((a, band) => a + band.kcal, 0);

  return (
    <Shell>
      {/* What this card is, kept to the weight of a caption — the meal's name is
          the title here, and a bold heading above it said the same thing twice.
          The total sits where the receipt puts it, and counts while you type. */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-footnote text-muted-foreground font-semibold">
          {creating ? t('editor.logItYourself') : t('editor.fixWhatsWrong')}
        </p>
        <span className="text-figure shrink-0 text-body">
          {formatNumber(Math.round(total), locale)}
          <span className="text-muted-foreground text-footnote font-semibold"> kcal</span>
        </span>
      </div>

      {/* The receipt's head, made editable: the same picture, the same line of
          bold text. Ruled underneath rather than boxed, so the title reads as
          the card's name and the boxes below it are the data being corrected. */}
      <div className="border-border focus-within:border-ring flex items-center gap-2.5 border-b-2 pb-1.5 transition-colors">
        <span aria-hidden className="shrink-0 text-[22px] leading-none">
          {foodEmoji(description, meal)}
        </span>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          aria-label={t('editor.whatThisWas')}
          placeholder={t('editor.whatWasIt')}
          className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-body font-bold outline-none"
        />
      </div>

      {split > 0 && (
        <div className="bg-muted border-border flex h-2.5 gap-px overflow-hidden rounded-full border">
          {energy.map((band) => (
            <div key={band.key} style={{ width: `${(band.kcal / split) * 100}%`, background: band.fill }} />
          ))}
        </div>
      )}

      <div className="grid grid-cols-4 gap-1.5">
        {MEALS.map(({ key, label }) => {
          const on = meal === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setMeal(key)}
              aria-pressed={on}
              className={
                on
                  ? 'bg-primary text-primary-foreground text-footnote rounded-full py-1.5 font-semibold'
                  : 'bg-muted text-muted-foreground text-footnote hover:text-foreground rounded-full py-1.5 font-semibold'
              }
            >
              {t(label)}
            </button>
          );
        })}
      </div>

      {items.map((item, i) => (
        <div key={i} className="border-border space-y-1.5 border-t pt-2.5">
          {/* Name and portion on one line, the way the receipt writes them:
              "chicken 180g". They were two full-width boxes stacked, which made
              a two-item meal eight boxes tall before a number was typed. */}
          <div className="flex items-center gap-2">
            <Input
              value={item.name}
              onChange={(e) => patch(i, { name: e.target.value })}
              aria-label={t('editor.itemName')(String(i + 1))}
              placeholder={t('editor.itemPlaceholder')}
              className="bg-muted h-9 flex-[1.6] font-semibold dark:bg-muted"
            />
            {/* The words, kept as words. "1 medium banana" is the assumption the
                estimate was built on, and it is the thing a reader checks first. */}
            <Input
              value={item.quantity}
              onChange={(e) => patch(i, { quantity: e.target.value })}
              aria-label={t('editor.itemQuantity')(String(i + 1))}
              placeholder={t('editor.howMuch')}
              className="bg-muted h-9 flex-1 dark:bg-muted"
            />
            <button
              type="button"
              onClick={() => setItems((prev) => prev.filter((_, j) => j !== i))}
              aria-label={t('editor.removeItem')(
                item.name || t('editor.itemFallback')(String(i + 1)),
              )}
              className="text-muted-foreground hover:text-foreground shrink-0"
            >
              <X size={15} />
            </button>
          </div>

          {/* The macros wear the card's colours, so the row of cells reads as
              the row of figures it will be saved back into. */}
          <div className="grid grid-cols-4 gap-1.5">
            <Cell
              value={item.kcal}
              onChange={(v) => patch(i, { kcal: v })}
              label={t('editor.itemCalories')(String(i + 1))}
              unit="kcal"
            />
            <Cell
              value={item.protein}
              onChange={(v) => patch(i, { protein: v })}
              label={t('editor.itemProtein')(String(i + 1))}
              unit={t('macro.proteinInitial')}
              tint="var(--protein-text)"
            />
            <Cell
              value={item.carbs}
              onChange={(v) => patch(i, { carbs: v })}
              label={t('editor.itemCarbs')(String(i + 1))}
              unit={t('macro.carbsInitial')}
              tint="var(--carbs-text)"
            />
            <Cell
              value={item.fat}
              onChange={(v) => patch(i, { fat: v })}
              label={t('editor.itemFat')(String(i + 1))}
              unit={t('macro.fatInitial')}
              tint="var(--fat-text)"
            />
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={() => setItems((prev) => [...prev, blank()])}
        className="text-footnote text-muted-foreground hover:text-foreground flex items-center gap-1.5 font-semibold"
      >
        <Plus size={13} />
        {t('editor.anotherItem')}
      </button>

      {error !== null && <p className="text-footnote text-destructive font-semibold">{error}</p>}

      {adjusted.length > 0 && (
        <div className="text-footnote text-muted-foreground space-y-0.5">
          <p className="font-semibold">{t('editor.adjustedHeading')}</p>
          {adjusted.map((item, i) => (
            <p key={`${item.name}-${i}`}>{adjustmentLine(item, t)}</p>
          ))}
        </div>
      )}

      <div className="border-border flex items-center justify-between border-t pt-2.5">
        <button
          type="button"
          onClick={onCancel}
          className="text-footnote text-muted-foreground hover:text-foreground font-semibold"
        >
          {t('common.cancel')}
        </button>
        <Button onClick={() => void save()} disabled={saving} className="gap-1.5 rounded-full">
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
          {saving ? t('setup.saving') : creating ? t('editor.log') : t('common.save')}
        </Button>
      </div>
    </Shell>
  );
}

/** One macro across the drafts, in grams. Half-typed cells count as nothing. */
function grams(items: DraftItem[], key: 'protein' | 'carbs' | 'fat'): number {
  return items.reduce((total, item) => total + (Number(item[key]) || 0), 0);
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-card border-border chunk animate-land space-y-2.5 rounded-[var(--radius)] border-2 px-4 py-3.5">
      {children}
    </div>
  );
}

function Cell({
  value,
  onChange,
  label,
  unit,
  tint,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  unit: string;
  /** The macro's text cut, so P, C and F read as the card's own colours. */
  tint?: string;
}) {
  return (
    <div className="bg-muted border-input focus-within:border-ring flex items-center gap-1 rounded-xl border-2 px-2 py-1.5 transition-colors">
      <input
        value={value}
        // A half-typed "12." has to survive until they finish.
        onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ''))}
        aria-label={label}
        inputMode="decimal"
        placeholder="—"
        className="text-footnote w-full min-w-0 bg-transparent outline-none"
      />
      <span
        className="text-footnote text-muted-foreground shrink-0 font-bold"
        style={tint ? { color: tint } : undefined}
      >
        {unit}
      </span>
    </div>
  );
}

/**
 * One line about a figure the log declined to store, in their language.
 *
 * The reasons are ordered as they were applied, and the first is the one worth
 * saying: a mass correction that then dragged the calories to a new floor is
 * one thing that happened to the item, not two.
 */
function adjustmentLine(
  item: EnergyAdjustment,
  t: (key: 'editor.adjustedMass' | 'editor.adjustedCeiling' | 'editor.adjustedFloor') => (name: string) => string,
): string {
  const reason = item.reasons[0] ?? 'floor';
  const key =
    reason === 'mass'
      ? 'editor.adjustedMass'
      : reason === 'ceiling'
        ? 'editor.adjustedCeiling'
        : 'editor.adjustedFloor';
  return t(key)(item.name);
}

const blank = (): DraftItem => ({
  name: '',
  // A row somebody is about to type into is not yet any food in particular.
  canonical: null,
  quantity_g: null,
  quantity: '',
  kcal: '',
  protein: '',
  carbs: '',
  fat: '',
});

function toDraft(item: FoodEntry['items'][number]): DraftItem {
  return {
    name: item.name,
    canonical: item.canonical,
    quantity_g: item.quantity_g,
    // The words if there are any, the weight if not — the same fallback the
    // card draws, so reopening a meal shows what reading it showed.
    quantity: item.quantity_desc ?? (item.quantity_g === null ? '' : `${Math.round(item.quantity_g)}g`),
    kcal: String(Math.round(item.kcal)),
    protein: String(Math.round(item.protein_g)),
    carbs: String(Math.round(item.carbs_g)),
    fat: String(Math.round(item.fat_g)),
  };
}

/**
 * A draft, back in the shape the API takes.
 *
 * The diet-quality fields are deliberately not carried: they are per-item
 * estimates nobody is being asked for here, and sending stale ones would claim
 * a corrected item still has the fibre the original was guessed to have. Null
 * is "nobody estimated this", which is the honest answer after a hand edit.
 */
function fromDraft(draft: DraftItem) {
  const quantity = draft.quantity.trim();
  return {
    name: draft.name.trim(),
    canonical: draft.canonical,
    // A weight when they typed one; otherwise the one the item already had,
    // which `patch` has already cleared if they touched the box at all.
    quantity_g: parseGrams(quantity) ?? draft.quantity_g,
    quantity_desc: quantity.length > 0 ? quantity : null,
    kcal: Number(draft.kcal) || 0,
    protein_g: Number(draft.protein) || 0,
    carbs_g: Number(draft.carbs) || 0,
    fat_g: Number(draft.fat) || 0,
    fiber_g: null,
    sodium_mg: null,
    sat_fat_g: null,
    sugar_g: null,
  };
}
