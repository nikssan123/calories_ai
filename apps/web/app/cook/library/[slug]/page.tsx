import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { publicRecipe } from '@/lib/public-api';
import { breadcrumbSchema, jsonLd, recipeSchema } from '@/lib/schema';
import { RecipeClient } from './RecipeClient';

/**
 * The server half of a library recipe page.
 *
 * Its whole job is to have the recipe in hand before anything renders: a title
 * and description of its own, a real 404 for a slug that does not exist, and
 * `Recipe` structured data carrying the measured per-portion nutrition. None of
 * that was possible while the page opened with `'use client'` — `metadata` is
 * server-only, and the existence check ran in an effect long after the 200 had
 * gone out.
 *
 * These ninety-nine pages are the only substantial content the site has. See
 * SEO.md §3.
 */

/**
 * Rendered on demand and cached, not built ahead.
 *
 * `generateStaticParams` would be the obvious move and is the wrong one here:
 * the image builds in a container with no database and no API to ask, so the
 * build would either fail or bake in an empty library. The fetch layer caches
 * for an hour instead, which gets the same result without coupling the build to
 * a running stack.
 */
export const revalidate = 3600;

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const recipe = await publicRecipe(slug);
  if (!recipe) return { title: 'Recipe not found — Day So Far' };

  const path = `/cook/library/${slug}`;
  const description =
    recipe.summary ??
    `${recipe.title}: ${Math.round(recipe.kcal)} kcal and ${recipe.protein_g} g of protein per serving, with the ingredients and method.`;

  return {
    title: `${recipe.title} — Day So Far`,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: 'article',
      title: recipe.title,
      description,
      url: path,
      ...(recipe.image_path ? { images: [{ url: recipe.image_path }] } : {}),
    },
  };
}

export default async function LibraryRecipePage({ params }: Params) {
  const { slug } = await params;
  const recipe = await publicRecipe(slug);
  // A slug with nothing behind it is a 404 with the status to match, rather
  // than a 200 carrying an apology — which is what the client-side `missing`
  // flag could only ever produce.
  if (!recipe) notFound();

  const path = `/cook/library/${slug}`;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(recipeSchema(recipe, path)) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd(
            breadcrumbSchema([
              { name: 'Day So Far', path: '/' },
              { name: 'Recipes', path: '/cook/library' },
              { name: recipe.title, path },
            ]),
          ),
        }}
      />
      <RecipeClient recipe={recipe} />
    </>
  );
}
