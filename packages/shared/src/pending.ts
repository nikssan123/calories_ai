import type {
  Confidence,
  DaySummary,
  EntrySource,
  FoodEntry,
  FoodItem,
  FoodItemInput,
  Meal,
} from './index.ts';
import { rollUpDay } from './day.ts';

/**
 * A day with changes folded in that the server has not heard about yet.
 *
 * An offline client holds a queue of things it means to do — log this, repeat
 * that, delete the other — and the screen has to show the day as it will be,
 * not as it last was. The ring must move when a meal is typed rather than when
 * it reaches the server; otherwise logging in a basement looks exactly like
 * logging into a void.
 *
 * Here rather than in the client for two reasons. It is arithmetic over wire
 * shapes and nothing else — no storage, no transport, no queue — so it belongs
 * beside `rollUpDay`, which it calls to arrive at every figure the way the API
 * would. And a client is where this is hardest to test: the phone has no test
 * runner, and the numbers this produces are the ones a user reads. See
 * OFFLINE.md §4.
 *
 * Deliberately ignorant of *why* something is pending. A queue, an optimistic
 * edit, a retry in flight — this takes the same three lists either way.
 */

/**
 * A meal that exists on the client and nowhere else yet.
 *
 * `id` is the client-generated key the server will store it under, so it is
 * stable across the moment it syncs — the card drawn from it can be tapped,
 * counted and removed before it exists anywhere but the device.
 */
export interface PendingFood {
  id: string;
  localDate: string;
  meal: Meal;
  description: string;
  /** ISO instant. */
  eatenAt: string;
  note?: string | null;
  source: EntrySource;
  confidence: Confidence;
  items: FoodItemInput[];
}

export interface PendingPatch {
  entryId: string;
  meal?: Meal;
  description?: string;
  note?: string | null;
  /** The complete replacement list, as the API takes it. */
  items?: FoodItemInput[];
}

export interface DayEdits {
  /** Meals logged locally, to be added to the day. */
  added?: PendingFood[];
  /** Ids of entries deleted locally, to be taken out. */
  removed?: string[];
  /** Corrections made locally, to be applied in place. */
  patched?: PendingPatch[];
}

/**
 * One pending meal, in the shape of the entry it will become.
 *
 * The figures are what the server will compute — totals summed from items, the
 * quality panel null where nothing supplied one — so nothing on screen changes
 * when the send lands. A pending card that redraws itself on sync is a card
 * that looked wrong beforehand.
 */
export function pendingEntry(food: PendingFood): FoodEntry {
  const items = food.items.map((item, index) => toItem(item, food.id, index));
  return {
    id: food.id,
    meal: food.meal,
    eaten_at: food.eatenAt,
    local_date: food.localDate,
    description: food.description,
    note: food.note ?? null,
    confidence: food.confidence,
    source: food.source,
    photo_id: null,
    items,
    kcal: total(items, 'kcal'),
    protein_g: total(items, 'protein_g'),
    carbs_g: total(items, 'carbs_g'),
    fat_g: total(items, 'fat_g'),
    fiber_g: qualityTotal(items, 'fiber_g'),
    sodium_mg: qualityTotal(items, 'sodium_mg'),
    sat_fat_g: qualityTotal(items, 'sat_fat_g'),
    sugar_g: qualityTotal(items, 'sugar_g'),
  };
}

/**
 * The day as it stands, pending changes included.
 *
 * Everything is re-added up through `rollUpDay` rather than adjusted in place.
 * Adjusting is how a diet-quality panel goes wrong: coverage is a share of the
 * day's calories, not a sum an entry can be subtracted from, so a screen that
 * subtracts a deleted meal from the totals leaves coverage speaking for a meal
 * that is no longer there. Re-adding a handful of entries costs nothing and
 * cannot drift from what the server will say.
 *
 * `added` is filtered to this day; the other two are not, because a patch or a
 * deletion names an entry that already has a day of its own — it is either in
 * this day's list or it is not.
 */
export function foldPending(day: DaySummary, edits: DayEdits): DaySummary {
  const added = (edits.added ?? []).filter((food) => food.localDate === day.local_date);
  const removed = new Set(edits.removed ?? []);
  const patched = new Map((edits.patched ?? []).map((patch) => [patch.entryId, patch]));

  if (added.length === 0 && removed.size === 0 && patched.size === 0) return day;

  const entries = day.food_entries
    .filter((entry) => !removed.has(entry.id))
    .map((entry) => {
      const patch = patched.get(entry.id);
      return patch === undefined ? entry : applyPatch(entry, patch);
    })
    .concat(added.map(pendingEntry));

  return rollUpDay({
    localDate: day.local_date,
    foodEntries: entries,
    exerciseEntries: day.exercise_entries,
    targets: day.targets,
    weight: day.weight,
  });
}

function applyPatch(entry: FoodEntry, patch: PendingPatch): FoodEntry {
  const items = patch.items
    ? patch.items.map((item, index) => toItem(item, entry.id, index))
    : entry.items;

  return {
    ...entry,
    meal: patch.meal ?? entry.meal,
    description: patch.description ?? entry.description,
    // Undefined leaves it alone; null clears it. The two are different asks and
    // `??` would collapse them, quietly making "remove this note" a no-op.
    note: patch.note === undefined ? entry.note : patch.note,
    items,
    kcal: total(items, 'kcal'),
    protein_g: total(items, 'protein_g'),
    carbs_g: total(items, 'carbs_g'),
    fat_g: total(items, 'fat_g'),
    fiber_g: qualityTotal(items, 'fiber_g'),
    sodium_mg: qualityTotal(items, 'sodium_mg'),
    sat_fat_g: qualityTotal(items, 'sat_fat_g'),
    sugar_g: qualityTotal(items, 'sugar_g'),
  };
}

/**
 * Ids are derived from the entry's, rather than invented.
 *
 * They only have to be unique within the list — React keys the rows on them —
 * and a real uuid would imply these rows exist somewhere, which is the one
 * thing that is not true about them yet.
 */
function toItem(item: FoodItemInput, entryId: string, index: number): FoodItem {
  return {
    id: `${entryId}:${index}`,
    entry_id: entryId,
    name: item.name,
    canonical: item.canonical ?? null,
    quantity_g: item.quantity_g ?? null,
    quantity_desc: item.quantity_desc ?? null,
    kcal: item.kcal,
    protein_g: item.protein_g ?? 0,
    carbs_g: item.carbs_g ?? 0,
    fat_g: item.fat_g ?? 0,
    fiber_g: item.fiber_g ?? null,
    sodium_mg: item.sodium_mg ?? null,
    sat_fat_g: item.sat_fat_g ?? null,
    sugar_g: item.sugar_g ?? null,
  };
}

function total(items: FoodItem[], field: 'kcal' | 'protein_g' | 'carbs_g' | 'fat_g'): number {
  return Math.round(items.reduce((sum, item) => sum + item[field], 0));
}

/** Null unless something actually supplied a figure — zero is a different claim. */
function qualityTotal(
  items: FoodItem[],
  field: 'fiber_g' | 'sodium_mg' | 'sat_fat_g' | 'sugar_g',
): number | null {
  const values = items.map((item) => item[field]).filter((v): v is number => v !== null);
  return values.length === 0 ? null : Math.round(values.reduce((a, b) => a + b, 0));
}
