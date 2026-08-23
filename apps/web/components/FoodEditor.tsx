'use client';

import { useEffect, useState } from 'react';
import { Check, Loader2, Plus, X } from 'lucide-react';
import type { FoodEntry, Meal } from '@ct/shared';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * A logged meal, reopened as the form that could have collected it.
 *
 * The journal's card is a receipt, and until now a receipt was final: the only
 * way to fix "that was a bigger portion" was to say it in the conversation and
 * spend a model call re-estimating a meal the user could already describe
 * exactly. This is the other door — the numbers themselves, typed.
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

const MEALS: { key: Meal; label: string }[] = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' },
  { key: 'snack', label: 'Snack' },
];

/** Held as strings so a half-typed number is not rounded out from under them. */
interface DraftItem {
  name: string;
  quantity: string;
  kcal: string;
  protein: string;
  carbs: string;
  fat: string;
}

export function FoodEditor({
  entryId,
  onSaved,
  onCancel,
}: {
  entryId: string;
  /** The corrected entry, so the card above can redraw without a reload. */
  onSaved: (entry: FoodEntry) => void;
  onCancel: () => void;
}) {
  const [entry, setEntry] = useState<FoodEntry | null>(null);
  const [description, setDescription] = useState('');
  const [meal, setMeal] = useState<Meal>('lunch');
  const [items, setItems] = useState<DraftItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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

  function patch(index: number, next: Partial<DraftItem>) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...next } : item)));
  }

  async function save() {
    const payload = items.map(fromDraft).filter((item) => item.name.trim().length > 0);
    // The API refuses an empty meal, and rightly — a meal with nothing in it is
    // a deletion, which is a different button with a different confirmation.
    if (payload.length === 0) {
      setError('A meal needs at least one item. Delete it instead?');
      return;
    }

    setSaving(true);
    try {
      const updated = await api.updateFoodEntry(entryId, {
        description: description.trim() || undefined,
        meal,
        items: payload,
      });
      onSaved(updated);
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

  if (entry === null) {
    return (
      <Shell>
        <p className="text-footnote text-muted-foreground">Loading…</p>
      </Shell>
    );
  }

  // Shown live off the drafts, because the figure people are correcting *to* is
  // usually the total — they adjust an item and watch this land on the number
  // they remember from the packet.
  const total = items.reduce((sum, item) => sum + (Number(item.kcal) || 0), 0);

  return (
    <Shell>
      <p className="text-body font-bold">Fix what’s wrong</p>

      <Input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        aria-label="What this was"
        placeholder="What was it?"
        className="font-medium"
      />

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
              {label}
            </button>
          );
        })}
      </div>

      {items.map((item, i) => (
        <div key={i} className="border-border space-y-2 border-t pt-2.5">
          <div className="flex items-center gap-2">
            <Input
              value={item.name}
              onChange={(e) => patch(i, { name: e.target.value })}
              aria-label={`Item ${i + 1} name`}
              placeholder="Item"
              className="flex-1 font-medium"
            />
            <button
              type="button"
              onClick={() => setItems((prev) => prev.filter((_, j) => j !== i))}
              aria-label={`Remove ${item.name || `item ${i + 1}`}`}
              className="text-muted-foreground hover:text-foreground shrink-0"
            >
              <X size={15} />
            </button>
          </div>

          {/* The words, kept as words. "1 medium banana" is the assumption the
              estimate was built on, and it is the thing a reader checks first. */}
          <Input
            value={item.quantity}
            onChange={(e) => patch(i, { quantity: e.target.value })}
            aria-label={`Item ${i + 1} quantity`}
            placeholder="how much"
          />

          <div className="grid grid-cols-4 gap-1.5">
            <Cell value={item.kcal} onChange={(v) => patch(i, { kcal: v })} label={`Item ${i + 1} calories`} unit="kcal" />
            <Cell value={item.protein} onChange={(v) => patch(i, { protein: v })} label={`Item ${i + 1} protein`} unit="P" />
            <Cell value={item.carbs} onChange={(v) => patch(i, { carbs: v })} label={`Item ${i + 1} carbs`} unit="C" />
            <Cell value={item.fat} onChange={(v) => patch(i, { fat: v })} label={`Item ${i + 1} fat`} unit="F" />
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={() => setItems((prev) => [...prev, blank()])}
        className="text-footnote text-muted-foreground hover:text-foreground flex items-center gap-1.5 font-semibold"
      >
        <Plus size={13} />
        another item
      </button>

      {error !== null && <p className="text-footnote text-destructive font-semibold">{error}</p>}

      <div className="border-border flex items-center justify-between border-t pt-2.5">
        <button
          type="button"
          onClick={onCancel}
          className="text-footnote text-muted-foreground hover:text-foreground font-semibold"
        >
          Cancel
        </button>
        <Button onClick={() => void save()} disabled={saving} className="gap-1.5 rounded-full">
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
          {saving ? 'Saving…' : `Save · ${Math.round(total).toLocaleString()} kcal`}
        </Button>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-card animate-land space-y-2.5 rounded-[var(--radius)] p-3.5 shadow-[0_1px_2px_rgba(23,22,20,0.05)]">
      {children}
    </div>
  );
}

function Cell({
  value,
  onChange,
  label,
  unit,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  unit: string;
}) {
  return (
    <div className="bg-muted border-border flex items-center gap-1 rounded-lg border px-2 py-1.5">
      <input
        value={value}
        // A half-typed "12." has to survive until they finish.
        onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ''))}
        aria-label={label}
        inputMode="decimal"
        placeholder="—"
        className="text-footnote w-full min-w-0 bg-transparent outline-none"
      />
      <span className="text-footnote text-muted-foreground shrink-0">{unit}</span>
    </div>
  );
}

const blank = (): DraftItem => ({
  name: '',
  quantity: '',
  kcal: '',
  protein: '',
  carbs: '',
  fat: '',
});

function toDraft(item: FoodEntry['items'][number]): DraftItem {
  return {
    name: item.name,
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
    quantity_g: null,
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
