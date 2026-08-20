import { beforeEach, describe, expect, it } from 'vitest';
import { query } from '../src/db.ts';
import { seedLibrary, readLibrarySeed, type LibrarySeedRecipe } from '../src/seed-library.ts';
import {
  cookLibraryRecipe,
  getLibraryRecipe,
  listLibrary,
  matchPantry,
  normalise,
  setLibrarySaved,
} from '../src/services/library.ts';
import { addPantryItems } from '../src/services/pantry.ts';
import { buildDaySummary } from '../src/services/summary.ts';
import { addMeal, createUser, setUserTargets, type TestUser } from './helpers/factories.ts';

/**
 * The starter library, and the ranking that makes it more than a recipe list.
 */

let user: TestUser;

beforeEach(async () => {
  user = await createUser();
  await setUserTargets(user, '2020-01-01', { kcal: 2200, protein_g: 160 });
});

function recipe(over: Partial<LibrarySeedRecipe> & { slug: string }): LibrarySeedRecipe {
  return {
    title: over.slug,
    summary: null,
    category: 'Main dish',
    portions: 4,
    serving_size: '1 serving',
    ingredients: [{ text: '1 thing', note: null }],
    steps: ['Cook it.'],
    keywords: [],
    kcal: 400,
    protein_g: 30,
    carbs_g: 30,
    fat_g: 10,
    food_groups: [],
    image_path: `/recipes/${over.slug}.jpg`,
    source: 'USDA MyPlate Kitchen',
    source_url: `https://example.test/${over.slug}`,
    rating: 4,
    rating_count: 100,
    ...over,
  };
}

const named = (...names: string[]) => names.map((name) => ({ name }));

describe('seedLibrary', () => {
  it('loads the shipped recipes', async () => {
    const { written } = await seedLibrary();
    expect(written).toBeGreaterThan(50);

    const rows = await query<{ n: string }>('SELECT count(*) AS n FROM library_recipes');
    expect(Number(rows[0]!.n)).toBe(written);
  });

  /** Correcting the data and re-seeding must not need a truncate first. */
  it('updates in place rather than duplicating', async () => {
    await seedLibrary([recipe({ slug: 'x', title: 'Old name' })]);
    await seedLibrary([recipe({ slug: 'x', title: 'New name' })]);

    const rows = await query<{ title: string }>('SELECT title FROM library_recipes');
    expect(rows).toEqual([{ title: 'New name' }]);
  });

  it('ships recipes that all have macros, steps and a photo', async () => {
    for (const r of await readLibrarySeed()) {
      expect(r.kcal, r.slug).toBeGreaterThan(0);
      expect(r.steps.length, r.slug).toBeGreaterThan(0);
      expect(r.keywords.length, r.slug).toBeGreaterThan(0);
      expect(r.image_path, r.slug).toMatch(/^\/recipes\/.+\.jpg$/);
      expect(r.source_url, r.slug).toBeTruthy();
    }
  });
});

describe('matching a kitchen to an ingredient', () => {
  const terms = (...names: string[]) =>
    names.map((name) => ({ item: { name } as never, norm: normalise(name) }));

  it('matches the same thing written either way round', () => {
    expect(matchPantry(['chicken breast'], terms('Chicken breast')).have).toEqual(['Chicken breast']);
    expect(matchPantry(['tomato'], terms('Tomatoes')).have).toEqual(['Tomatoes']);
  });

  /** A qualifier in front of the thing still leaves it the thing. */
  it('matches a qualified ingredient from the plain one', () => {
    expect(matchPantry(['brown rice'], terms('Rice')).have).toEqual(['Rice']);
    expect(matchPantry(['red pepper'], terms('Peppers')).have).toEqual(['Peppers']);
    expect(matchPantry(['plain yogurt'], terms('Yogurt')).have).toEqual(['Yogurt']);
  });

  /**
   * The regression this rule exists for. Loose containment matched a kitchen
   * holding eggs to "egg noodles" and put a beef recipe at the top of the list
   * for someone with no beef — a false yes, in the one place the user is
   * standing in front of the evidence.
   */
  it('does not mistake a qualifier for the thing itself', () => {
    expect(matchPantry(['egg noodle'], terms('Eggs')).have).toEqual([]);
    expect(matchPantry(['milk chocolate'], terms('Milk')).have).toEqual([]);
    expect(matchPantry(['chicken broth'], terms('Chicken breast')).have).toEqual([]);
  });

  /** Sharing a head noun is not enough — these are different jars. */
  it('does not match two different things that end the same way', () => {
    expect(matchPantry(['almond butter'], terms('Peanut butter')).have).toEqual([]);
    expect(matchPantry(['olive oil'], terms('Vegetable oil')).have).toEqual([]);
  });

  it('counts what is not covered', () => {
    const m = matchPantry(['chicken breast', 'saffron', 'rice'], terms('Chicken breast', 'Rice'));
    expect(m.have.sort()).toEqual(['Chicken breast', 'Rice']);
    expect(m.missing).toBe(1);
  });
});

describe('listLibrary', () => {
  it('puts what you can actually make first', async () => {
    await seedLibrary([
      recipe({ slug: 'have-none', keywords: ['octopus', 'saffron', 'truffle'] }),
      recipe({ slug: 'have-all', keywords: ['chicken breast', 'rice', 'garlic'] }),
      recipe({ slug: 'have-some', keywords: ['chicken breast', 'saffron', 'truffle'] }),
    ]);
    await addPantryItems(user.id, 'free', named('Chicken breast', 'Rice', 'Garlic'));

    const listed = await listLibrary(user.id, user.ctx);
    expect(listed.map((r) => r.slug)).toEqual(['have-all', 'have-some', 'have-none']);
    expect(listed[0]!.have.sort()).toEqual(['Chicken breast', 'Garlic', 'Rice']);
    expect(listed[0]!.missing).toBe(0);
  });

  /** Twice what is left of the day is not a suggestion, it is a different day. */
  it('sinks a recipe that blows the day', async () => {
    await seedLibrary([
      recipe({ slug: 'huge', kcal: 1800, keywords: ['chicken breast'] }),
      recipe({ slug: 'fits', kcal: 300, keywords: ['chicken breast'] }),
    ]);
    await addPantryItems(user.id, 'free', named('Chicken breast'));
    await addMeal(user, { date: await todayFor(), kcal: 1600 });

    const listed = await listLibrary(user.id, user.ctx);
    expect(listed.map((r) => r.slug)).toEqual(['fits', 'huge']);
    expect(listed[0]!.fits_today).toBe(true);
    expect(listed[1]!.fits_today).toBe(false);
  });

  it('searches by title and by ingredient', async () => {
    await seedLibrary([
      recipe({ slug: 'a', title: 'Baked Trout', keywords: ['trout'] }),
      recipe({ slug: 'b', title: 'Omelette', keywords: ['egg', 'spinach'] }),
    ]);

    expect((await listLibrary(user.id, user.ctx, { q: 'trout' })).map((r) => r.slug)).toEqual(['a']);
    expect((await listLibrary(user.id, user.ctx, { q: 'spinach' })).map((r) => r.slug)).toEqual(['b']);
  });

  it('honours the limit', async () => {
    await seedLibrary(['a', 'b', 'c', 'd'].map((slug) => recipe({ slug })));
    expect(await listLibrary(user.id, user.ctx, { limit: 2 })).toHaveLength(2);
  });
});

describe('saving', () => {
  beforeEach(async () => {
    await seedLibrary([recipe({ slug: 'keeper' })]);
  });

  it('saves and unsaves, and filters to saved', async () => {
    expect(await setLibrarySaved(user.id, 'keeper', true)).toBe(true);
    expect((await getLibraryRecipe(user.id, 'keeper', user.ctx))!.saved).toBe(true);
    expect(await listLibrary(user.id, user.ctx, { savedOnly: true })).toHaveLength(1);

    await setLibrarySaved(user.id, 'keeper', false);
    expect(await listLibrary(user.id, user.ctx, { savedOnly: true })).toHaveLength(0);
  });

  it('saves twice without complaint', async () => {
    await setLibrarySaved(user.id, 'keeper', true);
    await expect(setLibrarySaved(user.id, 'keeper', true)).resolves.toBe(true);
  });

  it('reports an unknown recipe rather than saving nothing quietly', async () => {
    expect(await setLibrarySaved(user.id, 'nope', true)).toBe(false);
  });

  /** The recipe is shared; who kept it is not. */
  it('keeps one account’s saves out of another’s', async () => {
    const other = await createUser();
    await setLibrarySaved(user.id, 'keeper', true);
    expect((await getLibraryRecipe(other.id, 'keeper', other.ctx))!.saved).toBe(false);
  });
});

describe('cookLibraryRecipe', () => {
  beforeEach(async () => {
    await seedLibrary([
      recipe({ slug: 'trout', title: 'Baked Trout', kcal: 192, protein_g: 25.6, carbs_g: 4, fat_g: 8 }),
    ]);
  });

  /**
   * One item, not one per ingredient. The USDA measured the dish per serving
   * and published no per-ingredient split, so itemising it would mean inventing
   * the parts of a number that is already right as a whole.
   */
  it('logs one item carrying the published macros', async () => {
    const entry = await cookLibraryRecipe(user.id, 'trout', { ctx: user.ctx });

    expect(entry).toMatchObject({ description: 'Baked Trout', source: 'quick', confidence: 'high' });
    expect(entry!.items).toHaveLength(1);
    expect(Math.round(entry!.kcal)).toBe(192);
    expect(entry!.items[0]!.quantity_desc).toBe('1 serving');
  });

  it('moves the day', async () => {
    await cookLibraryRecipe(user.id, 'trout', { ctx: user.ctx });
    const day = await buildDaySummary(user.id, await todayFor());
    expect(day.consumed.kcal).toBe(192);
  });

  it('scales to the portions eaten', async () => {
    const entry = await cookLibraryRecipe(user.id, 'trout', { portions: 2, ctx: user.ctx });
    expect(Math.round(entry!.kcal)).toBe(384);
    expect(entry!.items[0]!.quantity_desc).toBe('2 × 1 serving');
  });

  /**
   * Half a portion is what is left at nine o'clock, and the stepper on the card
   * offers it — so the arithmetic has to survive a fraction rather than
   * rounding it to a whole serving nobody ate.
   */
  it('handles half a serving', async () => {
    const entry = await cookLibraryRecipe(user.id, 'trout', { portions: 0.5, ctx: user.ctx });
    expect(Math.round(entry!.kcal)).toBe(96);
    expect(entry!.items[0]!.quantity_desc).toBe('0.5 × 1 serving');
  });

  it('returns null for a recipe that is not there', async () => {
    expect(await cookLibraryRecipe(user.id, 'nope', { ctx: user.ctx })).toBeNull();
  });
});

async function todayFor(): Promise<string> {
  const { localDateFor } = await import('../src/time.ts');
  return localDateFor(new Date(), user.ctx);
}
