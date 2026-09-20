import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { publicRecipe } from '@/lib/public-api';
import { breadcrumbSchema, jsonLd, recipeSchema } from '@/lib/schema';
import { clampDescription, withBrand } from '@/lib/seo';
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

/*
 * Rendered on demand, then cached for an hour.
 *
 * This used to be `force-dynamic`, and that was over-correction. The bug it was
 * reacting to is real but belongs to pages with *no* dynamic segment: those a
 * revalidate window makes Next prerender at build time, and the build runs in a
 * container with no API, so an empty result got baked into the image. See
 * `app/cook/library/page.tsx`, where `force-dynamic` is still load-bearing for
 * exactly that reason.
 *
 * A `[slug]` route is not in that position. With no `generateStaticParams` there
 * are no paths to prerender, so the build never calls anything whether this flag
 * is here or not — and `force-dynamic` bought nothing while costing two things
 * that mattered:
 *
 * 1. `generateMetadata` awaits the recipe, and on a dynamic route Next answers
 *    such a request by *streaming* the metadata — `<title>`, the description,
 *    the canonical — into the body, after `</head>` has already closed. It only
 *    blocks and puts them back in the head for user agents matching its own
 *    `HTML_LIMITED_BOT_UA_RE`, which lists `Google-[\w-]+` and so covers
 *    `Google-InspectionTool` (Search Console's URL Inspection, which therefore
 *    showed a perfect page) but *not* plain `Googlebot`, and not GPTBot,
 *    ClaudeBot, PerplexityBot or CCBot. Ninety-nine recipes and ninety-one posts
 *    served their title tens of kilobytes down the body to every one of them.
 * 2. `Cache-Control: private, no-cache, no-store` on every response, so nothing
 *    could be cached by the browser, by Next, or by a CDN in front of it.
 *
 * `revalidate` fixes both: the first request for a slug renders with the recipe
 * in hand and the metadata resolved before a byte ships, and the result is then
 * served from the route cache. The fetch in lib/public-api.ts keeps its own hour
 * as well, which is what makes a revalidation cheap rather than a round trip.
 */
export const revalidate = 3600;

/*
 * Empty, and that is the whole trick.
 *
 * `revalidate` on its own was not enough: Next classified this route as fully
 * dynamic and kept answering `Cache-Control: private, no-cache, no-store` with
 * the metadata still streamed into the body. A dynamic segment only becomes
 * static-capable — renderable on demand and then *cached* — once
 * `generateStaticParams` exists, because that is the function Next asks whether
 * a route has any static shape at all.
 *
 * Returning `[]` says: static-capable, with nothing known at build time. The
 * build therefore calls no API and bakes no pages, which is the property the old
 * `force-dynamic` was protecting; `dynamicParams` defaults to true, so every
 * slug is rendered on its first request and served from the route cache after.
 */
export async function generateStaticParams() {
  return [];
}

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const recipe = await publicRecipe(slug);
  if (!recipe) return { title: 'Recipe not found — Day So Far' };

  const path = `/cook/library/${slug}`;
  // The source's summary is an introduction, not a description — clamped so a
  // result shows a whole sentence rather than a cut one. See lib/seo.ts.
  const description = clampDescription(
    recipe.summary ??
      `${recipe.title}: ${Math.round(recipe.kcal)} kcal and ${recipe.protein_g} g of protein per serving, with the ingredients and method.`,
  );

  return {
    title: withBrand(recipe.title),
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
