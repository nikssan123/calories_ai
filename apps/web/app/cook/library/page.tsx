import type { Metadata } from 'next';
import Link from 'next/link';
import { publicLibrary } from '@/lib/public-api';
import { breadcrumbSchema, jsonLd } from '@/lib/schema';
import { ORIGIN } from '@/lib/seo';
import { PublicShell } from '@/components/PublicShell';

/*
 * Rendered on demand, with the upstream call cached for an hour.
 *
 * `export const revalidate` alone was wrong here and silently so. A page with
 * no dynamic segment and a revalidate window is *prerendered at build time* —
 * and the build runs in a container with no API and no database, so the fetch
 * failed, the empty result was baked into the image, and production served a
 * page saying the library would not load while the API beside it answered all
 * ninety-nine. It would have corrected itself an hour after the first request,
 * which is a long time to be wrong on the pages a crawler reads.
 *
 * `force-dynamic` keeps the build from calling anything. `fetchCache` then puts
 * the caching back where it belongs: on the fetch in lib/public-api.ts, which
 * carries its own hour. The render is cheap; the round trip is what was worth
 * caching.
 */
export const dynamic = 'force-dynamic';
export const fetchCache = 'default-cache';

const DESCRIPTION =
  'Every recipe in the Day So Far starter library — ingredients, method, and measured calories and macros per serving. Public-domain recipes from USDA MyPlate Kitchen.';

export const metadata: Metadata = {
  title: 'Recipes — Day So Far',
  description: DESCRIPTION,
  alternates: { canonical: '/cook/library' },
  openGraph: { title: 'Recipes — Day So Far', description: DESCRIPTION, url: '/cook/library' },
};

export default async function LibraryIndexPage() {
  const recipes = await publicLibrary();

  // Grouped by the source's own category so the page has some shape to it, and
  // so a reader scanning for "Main dish" is not reading an alphabet.
  const byCategory = new Map<string, typeof recipes>();
  for (const recipe of recipes) {
    const list = byCategory.get(recipe.category) ?? [];
    list.push(recipe);
    byCategory.set(recipe.category, list);
  }
  const categories = [...byCategory.entries()].sort(([a], [b]) => a.localeCompare(b));

  return (
    <PublicShell locale="en" wide>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd(
            breadcrumbSchema([
              { name: 'Day So Far', path: '/' },
              { name: 'Recipes', path: '/cook/library' },
            ]),
          ),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd({
            '@context': 'https://schema.org',
            '@type': 'CollectionPage',
            name: 'Recipes',
            url: `${ORIGIN}/cook/library`,
            description: DESCRIPTION,
            isPartOf: { '@id': `${ORIGIN}/#website` },
            mainEntity: {
              '@type': 'ItemList',
              numberOfItems: recipes.length,
              itemListElement: recipes.map((recipe, index) => ({
                '@type': 'ListItem',
                position: index + 1,
                url: `${ORIGIN}/cook/library/${recipe.slug}`,
                name: recipe.title,
              })),
            },
          }),
        }}
      />

      <h1 className="text-display text-balance">Recipes</h1>
      <p className="text-body text-muted-foreground mt-4 max-w-2xl">
        {recipes.length} recipes with the ingredients, the method, and what one serving actually
        comes to. They are public-domain recipes from{' '}
        <a
          href="https://www.myplate.gov/myplate-kitchen/recipes"
          className="underline underline-offset-2"
          rel="noopener"
        >
          USDA MyPlate Kitchen
        </a>
        , and the nutrition is the source&rsquo;s own measurement of the finished dish rather than
        a sum of its parts.
      </p>

      {recipes.length === 0 && (
        <p className="text-body text-muted-foreground mt-10">
          The library is not loading just now. Please try again shortly.
        </p>
      )}

      {categories.map(([category, list]) => (
        <section key={category} className="mt-12">
          <h2 className="text-section-title">{category}</h2>
          <ul className="mt-4 space-y-3">
            {list.map((recipe) => (
              <li key={recipe.slug}>
                <Link
                  href={`/cook/library/${recipe.slug}`}
                  className="group block rounded-[var(--radius)] py-1"
                >
                  <span className="text-body font-semibold underline-offset-4 group-hover:underline">
                    {recipe.title}
                  </span>
                  <span className="text-footnote text-muted-foreground ml-2 whitespace-nowrap">
                    {Math.round(recipe.kcal)} kcal · {recipe.protein_g} g protein
                  </span>
                  {recipe.summary && (
                    <span className="text-footnote text-muted-foreground mt-0.5 block">
                      {recipe.summary}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </PublicShell>
  );
}
