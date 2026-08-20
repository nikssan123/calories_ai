import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isEntrypoint, runAsScript } from './cli.ts';
import { pool, query } from './db.ts';

/**
 * Loads the starter recipe library into the database.
 *
 * The recipes ship as a JSON file in the repo rather than being fetched at
 * install time, for three reasons: the upstream API is rate limited to a
 * hundred full recipes a day, the site it mirrors was retired in January 2026,
 * and a deployment that cannot reach the internet should still get a Cook tab
 * with something in it. The file is the product; the API was how it was made.
 *
 * Idempotent — re-running it updates in place, so correcting the data and
 * re-seeding does not need a truncate first.
 */

const dataFile = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'data',
  'library-recipes.json',
);

export interface LibrarySeedRecipe {
  slug: string;
  title: string;
  summary: string | null;
  category: string;
  portions: number;
  serving_size: string | null;
  ingredients: Array<{ text: string; note: string | null }>;
  steps: string[];
  keywords: string[];
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  food_groups: string[];
  image_path: string | null;
  source: string;
  source_url: string | null;
  rating: number | null;
  rating_count: number | null;
}

export async function readLibrarySeed(): Promise<LibrarySeedRecipe[]> {
  return JSON.parse(await readFile(dataFile, 'utf8')) as LibrarySeedRecipe[];
}

export interface SeedResult {
  written: number;
}

export async function seedLibrary(recipes?: LibrarySeedRecipe[]): Promise<SeedResult> {
  const rows = recipes ?? (await readLibrarySeed());

  for (const r of rows) {
    await query(
      `INSERT INTO library_recipes
         (slug, title, summary, category, portions, serving_size, ingredients, steps,
          keywords, kcal, protein_g, carbs_g, fat_g, food_groups, image_path,
          source, source_url, rating, rating_count)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       ON CONFLICT (slug) DO UPDATE SET
         title = EXCLUDED.title,
         summary = EXCLUDED.summary,
         category = EXCLUDED.category,
         portions = EXCLUDED.portions,
         serving_size = EXCLUDED.serving_size,
         ingredients = EXCLUDED.ingredients,
         steps = EXCLUDED.steps,
         keywords = EXCLUDED.keywords,
         kcal = EXCLUDED.kcal,
         protein_g = EXCLUDED.protein_g,
         carbs_g = EXCLUDED.carbs_g,
         fat_g = EXCLUDED.fat_g,
         food_groups = EXCLUDED.food_groups,
         image_path = EXCLUDED.image_path,
         source = EXCLUDED.source,
         source_url = EXCLUDED.source_url,
         rating = EXCLUDED.rating,
         rating_count = EXCLUDED.rating_count`,
      [
        r.slug,
        r.title,
        r.summary,
        r.category,
        r.portions,
        r.serving_size,
        JSON.stringify(r.ingredients),
        JSON.stringify(r.steps),
        r.keywords,
        r.kcal,
        r.protein_g,
        r.carbs_g,
        r.fat_g,
        JSON.stringify(r.food_groups),
        r.image_path,
        r.source,
        r.source_url,
        r.rating,
        r.rating_count,
      ],
    );
  }

  return { written: rows.length };
}

async function main(): Promise<void> {
  const { written } = await seedLibrary();
  console.log(`seeded ${written} library recipes`);
}

if (isEntrypoint(import.meta.url)) void runAsScript(main, () => pool.end());
