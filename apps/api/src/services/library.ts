import type { FoodEntry, LibraryRecipe, Meal, PantryItem } from '@ct/shared';
import { query, queryOne } from '../db.ts';
import { createFoodEntry } from './log.ts';
import { listPantry } from './pantry.ts';
import { buildDaySummary } from './summary.ts';
import { type DayContext, inferMeal, localDateFor } from '../time.ts';

/**
 * The starter library: a hundred real recipes, ranked the app's way.
 *
 * The ranking is the whole reason this is not just a recipe list. A recipe site
 * can sort by rating; only this app knows there is chicken in the fridge and
 * 900 kcal left in the day, so those are what order the shelf. What arrives at
 * the top is not "the best recipe" — it is "the one you could actually make
 * tonight", which is a different and much rarer answer.
 */

/**
 * Ranking happens in TypeScript over the whole table rather than in SQL.
 *
 * The library is a hundred rows that change only when someone re-seeds it, so
 * reading all of them costs less than the round trip saved, and the matching is
 * fuzzy in a way `&&` on a text[] is not — a pantry holding "chicken" has to
 * match "chicken breast", which is a substring question and not a set one. The
 * GIN index is there for when this grows past the point where that is true.
 */
export interface ListOptions {
  q?: string | null;
  category?: string | null;
  savedOnly?: boolean;
  limit?: number;
}

export async function listLibrary(
  userId: string,
  ctx: DayContext,
  options: ListOptions = {},
  now = new Date(),
): Promise<LibraryRecipe[]> {
  const today = localDateFor(now, ctx);
  const [rows, saved, pantry, day] = await Promise.all([
    query<any>('SELECT * FROM library_recipes'),
    savedSlugs(userId),
    listPantry(userId),
    buildDaySummary(userId, today),
  ]);

  const kcalLeft = Math.max(0, day.targets.kcal - day.consumed.kcal);
  const proteinLeft = Math.max(0, day.targets.protein_g - day.consumed.protein_g);
  const terms = pantry.map((item) => ({ item, norm: normalise(item.name) }));

  const search = options.q?.trim().toLowerCase() || null;

  const scored = rows
    .filter((row) => {
      if (options.savedOnly && !saved.has(row.slug)) return false;
      if (options.category && row.category !== options.category) return false;
      if (!search) return true;
      return (
        row.title.toLowerCase().includes(search) ||
        (row.keywords as string[]).some((k) => k.includes(search))
      );
    })
    .map((row) => {
      const match = matchPantry(row.keywords as string[], terms);
      return {
        recipe: toRecipe(row, saved.has(row.slug), match, kcalLeft),
        score: score(row, match, kcalLeft, proteinLeft),
      };
    })
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, Math.min(Math.max(options.limit ?? 12, 1), 60)).map((s) => s.recipe);
}

export async function getLibraryRecipe(
  userId: string,
  slug: string,
  ctx: DayContext,
  now = new Date(),
): Promise<LibraryRecipe | null> {
  const row = await queryOne<any>('SELECT * FROM library_recipes WHERE slug = $1', [slug]);
  if (!row) return null;

  const [saved, pantry, day] = await Promise.all([
    savedSlugs(userId),
    listPantry(userId),
    buildDaySummary(userId, localDateFor(now, ctx)),
  ]);
  const kcalLeft = Math.max(0, day.targets.kcal - day.consumed.kcal);
  const match = matchPantry(row.keywords, pantry.map((item) => ({ item, norm: normalise(item.name) })));
  return toRecipe(row, saved.has(slug), match, kcalLeft);
}

export async function setLibrarySaved(
  userId: string,
  slug: string,
  saved: boolean,
): Promise<boolean> {
  const exists = await queryOne<{ slug: string }>(
    'SELECT slug FROM library_recipes WHERE slug = $1',
    [slug],
  );
  if (!exists) return false;

  if (saved) {
    await query(
      `INSERT INTO saved_library_recipes (user_id, slug) VALUES ($1,$2)
       ON CONFLICT DO NOTHING`,
      [userId, slug],
    );
  } else {
    await query('DELETE FROM saved_library_recipes WHERE user_id = $1 AND slug = $2', [
      userId,
      slug,
    ]);
  }
  return true;
}

export interface CookOptions {
  portions?: number;
  meal?: Meal;
  eatenAt?: Date;
  ctx: DayContext;
}

/**
 * Logging a library recipe.
 *
 * One item, not one per ingredient. The USDA measured this dish per serving and
 * did not publish a per-ingredient split, so itemising it would mean inventing
 * the parts of a number that is already correct as a whole — a worse entry that
 * merely looks more precise. `confidence` is 'high' for the same reason it is
 * 'low' on a photo estimate: this figure was measured by someone, not guessed.
 */
export async function cookLibraryRecipe(
  userId: string,
  slug: string,
  options: CookOptions,
): Promise<FoodEntry | null> {
  const row = await queryOne<any>('SELECT * FROM library_recipes WHERE slug = $1', [slug]);
  if (!row) return null;

  const portions = options.portions ?? 1;
  const eatenAt = options.eatenAt ?? new Date();
  const per = {
    kcal: Number(row.kcal),
    protein_g: Number(row.protein_g),
    carbs_g: Number(row.carbs_g),
    fat_g: Number(row.fat_g),
  };

  return createFoodEntry({
    userId,
    meal: options.meal ?? inferMeal(eatenAt, options.ctx.timezone),
    eatenAt,
    description: row.title,
    note: row.source,
    confidence: 'high',
    // The same act as repeating a past meal: an entry created from something
    // already priced, without the agent seeing it.
    source: 'quick',
    photoId: null,
    items: [
      {
        name: row.title,
        quantity_g: null,
        quantity_desc:
          portions === 1
            ? (row.serving_size ?? '1 portion')
            : `${round2(portions)} × ${row.serving_size ?? 'portion'}`,
        kcal: round1(per.kcal * portions),
        protein_g: round1(per.protein_g * portions),
        carbs_g: round1(per.carbs_g * portions),
        fat_g: round1(per.fat_g * portions),
        // No diet-quality panel, deliberately: the USDA published energy and
        // three macros for these dishes and nothing else, so the columns on
        // library_recipes are NULL and this entry inherits that. It costs the
        // day some coverage, which is the honest outcome — the alternative is
        // an invented fiber figure wearing a measured recipe's authority.
      },
    ],
    ctx: options.ctx,
  });
}

// ---- Matching ---------------------------------------------------------------

export interface PantryMatch {
  /** The pantry items this recipe would use, by their own names. */
  have: string[];
  /** Ingredients with nothing in the kitchen to cover them. */
  missing: number;
}

interface Term {
  item: PantryItem;
  norm: string;
}

/**
 * Which of a recipe's ingredients the kitchen already covers.
 *
 * The rule is equality or a whole-word *suffix*, in either direction, and the
 * suffix part is doing real work: in an English compound the last word is the
 * thing itself and everything before it is a qualifier. "Brown rice" is rice
 * and "red pepper" is pepper, so a kitchen holding either covers them — while
 * "egg noodles" are not eggs and "milk chocolate" is not milk, which a looser
 * containment check happily claimed. That mistake put a beef recipe at the top
 * of the list for a kitchen that had no beef, on the strength of owning eggs.
 *
 * Erring toward a miss is deliberate. The promise this ranking makes is "you
 * could cook this right now", and a false yes breaks it in the one place the
 * user is standing in front of the evidence.
 */
export function matchPantry(keywords: string[], terms: Term[]): PantryMatch {
  const have = new Set<string>();
  let missing = 0;

  for (const keyword of keywords) {
    const target = normalise(keyword);
    const hit = terms.find((t) => isHeadOf(target, t.norm) || isHeadOf(t.norm, target));
    if (hit) have.add(hit.item.name);
    else missing += 1;
  }
  return { have: [...have], missing };
}

/** True when `phrase` ends with `tail` on a word boundary, or equals it. */
function isHeadOf(phrase: string, tail: string): boolean {
  if (!tail || !phrase) return false;
  if (phrase === tail) return true;
  return phrase.endsWith(tail) && phrase[phrase.length - tail.length - 1] === ' ';
}

/** Lowercase, depluralised, punctuation-free — the same shape the seed writes. */
export function normalise(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) =>
      w.endsWith('oes')
        ? w.slice(0, -2)
        : w.endsWith('ies') && w.length > 4
          ? `${w.slice(0, -3)}y`
          : w.endsWith('s') && !w.endsWith('ss')
            ? w.slice(0, -1)
            : w,
    )
    .join(' ');
}

/**
 * What to put at the top.
 *
 * Pantry coverage dominates, because "you could make this right now" is the
 * only thing here a recipe site cannot say. Fitting the day comes next, rating
 * only breaks ties — a beloved recipe you have none of the ingredients for is
 * not an answer to the question being asked.
 */
function score(
  row: any,
  match: PantryMatch,
  kcalLeft: number,
  proteinLeft: number,
): number {
  const total = (row.keywords as string[]).length || 1;
  const coverage = match.have.length / total;
  let s = coverage * 10;

  // One or two gaps is a useful recipe; five is a shopping list.
  if (match.missing <= 2) s += 1.5;

  const kcal = Number(row.kcal);
  if (kcalLeft > 0) {
    if (kcal <= kcalLeft) s += 2;
    // Twice what is left is not a suggestion, it is a different day.
    else if (kcal > kcalLeft * 2) s -= 3;
  }

  // Protein earns its place only when there is protein still to find.
  if (proteinLeft > 40 && Number(row.protein_g) >= 20) s += 1;

  s += (Number(row.rating) || 3.5) / 5;
  return s;
}

function toRecipe(
  row: any,
  saved: boolean,
  match: PantryMatch,
  kcalLeft: number,
): LibraryRecipe {
  return {
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    category: row.category,
    portions: Number(row.portions),
    serving_size: row.serving_size,
    ingredients: row.ingredients ?? [],
    steps: row.steps ?? [],
    kcal: Number(row.kcal),
    protein_g: Number(row.protein_g),
    carbs_g: Number(row.carbs_g),
    fat_g: Number(row.fat_g),
    image_path: row.image_path,
    source: row.source,
    source_url: row.source_url,
    rating: row.rating === null ? null : Number(row.rating),
    saved,
    have: match.have,
    missing: match.missing,
    // A day already at its target has nothing left for anything to fit inside,
    // so nothing claims to.
    fits_today: kcalLeft > 0 && Number(row.kcal) <= kcalLeft,
  };
}

async function savedSlugs(userId: string): Promise<Set<string>> {
  const rows = await query<{ slug: string }>(
    'SELECT slug FROM saved_library_recipes WHERE user_id = $1',
    [userId],
  );
  return new Set(rows.map((r) => r.slug));
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;
