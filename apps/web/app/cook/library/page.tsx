import type { Metadata } from 'next';
import Link from 'next/link';
import { publicLibrary } from '@/lib/public-api';
import { breadcrumbSchema, jsonLd } from '@/lib/schema';
import { ORIGIN } from '@/lib/seo';

/**
 * The index the ninety-nine recipe pages never had.
 *
 * Without it every one of them was an orphan: reachable only from inside the
 * authenticated `/cook` shelf, which no crawler can open, and linked from
 * nowhere a visitor could arrive at. A sitemap alone does not fix that — it
 * gets a page discovered, not connected — so this is as much an internal
 * linking fix as a page in its own right.
 *
 * Deliberately plain, and server-rendered whole. It is a list of links to
 * documents, which is the one thing the web has always been good at.
 */
export const revalidate = 3600;

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
    <div className="bg-background min-h-screen">
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

      <div className="mx-auto w-full max-w-3xl px-5 py-12 sm:px-6 sm:py-16">
        <Link href="/" className="text-footnote text-muted-foreground underline underline-offset-2">
          Day So Far
        </Link>

        <h1 className="text-display mt-6 text-balance">Recipes</h1>
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
      </div>
    </div>
  );
}
