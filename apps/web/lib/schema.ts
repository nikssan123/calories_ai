import type { PublicLibraryRecipe } from '@ct/shared';
import { ORIGIN } from '@/lib/seo';

/**
 * Schema.org JSON-LD, built from data the app already holds.
 *
 * One rule runs through all of it: a property is emitted only when there is a
 * real value behind it. Google treats structured data that disagrees with the
 * page as a reason to distrust the page, and an invented `aggregateRating` is
 * the specific version of that which earns a manual action — so `rating` is
 * emitted only alongside the `rating_count` the source published, and the whole
 * block is dropped when either is missing.
 */

/** Serialisable JSON-LD, for `dangerouslySetInnerHTML`. */
export function jsonLd(value: unknown): string {
  /*
   * `<` escaped so a title containing one cannot close the script tag early.
   * JSON.stringify does not do this, and a recipe called "Soup < 300 kcal"
   * would otherwise end the block mid-object.
   */
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

const absolute = (path: string) => `${ORIGIN}${path.startsWith('/') ? path : `/${path}`}`;

/**
 * The site's publisher identity, on every page via the root layout.
 *
 * `@id` so the recipe and application blocks can point at this one node rather
 * than restating the organisation, which is what lets a crawler treat the whole
 * site as one entity instead of a set of unrelated pages. That matters more
 * than usual here: "Day So Far" is a common English phrase, and the brand
 * competes for its own name against a Bandcamp album and a BI reporting term.
 */
export function organizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${ORIGIN}/#organization`,
        name: 'Day So Far',
        url: ORIGIN,
        logo: absolute('/apple-icon.png'),
        description:
          'Day So Far is a calorie journal you talk to: describe a meal in plain language and it logs the calories and macros, with no food database to search.',
        // No `SearchAction` on the WebSite node below: there is no public,
        // URL-addressable search on this site, and declaring one that resolves
        // to nothing is worse than declaring nothing.
        sameAs: ['https://play.google.com/store/apps/details?id=com.daysofar.app'],
      },
      {
        '@type': 'WebSite',
        '@id': `${ORIGIN}/#website`,
        name: 'Day So Far',
        url: ORIGIN,
        publisher: { '@id': `${ORIGIN}/#organization` },
      },
    ],
  };
}

/**
 * The product itself, on the landing page.
 *
 * Android only, and deliberately: `StoreLinks` still carries `href: null` for
 * the App Store because the listing is in review. Claiming iOS before Apple
 * lists it would be a link a crawler follows to nothing. Add the platform and a
 * second `installUrl` the day it goes live.
 *
 * No `aggregateRating`. Nothing in this codebase reads a real Play rating, and
 * the field is required for the star snippet — so the snippet waits until there
 * is a number to put in it.
 */
export function softwareApplicationSchema(
  description = 'A calorie journal you talk to. Describe the meal in your own words — or photograph it, scan the packet, or say "my usual" — and the day adds itself up.',
  prices: {
    currency: string;
    plus: { monthly: string; annual: string };
    coach: { monthly: string; annual: string };
  } = {
    currency: 'USD',
    plus: { monthly: '9.99', annual: '99.99' },
    coach: { monthly: '24.99', annual: '249.99' },
  },
) {
  const { currency } = prices;
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Day So Far',
    url: ORIGIN,
    applicationCategory: 'HealthApplication',
    operatingSystem: 'Android',
    installUrl: 'https://play.google.com/store/apps/details?id=com.daysofar.app',
    publisher: { '@id': `${ORIGIN}/#organization` },
    description,
    offers: [
      { '@type': 'Offer', name: 'Free', price: '0', priceCurrency: currency },
      offer('Plus — monthly', prices.plus.monthly, 'P1M', currency),
      offer('Plus — annual', prices.plus.annual, 'P1Y', currency),
      offer('Coach — monthly', prices.coach.monthly, 'P1M', currency),
      offer('Coach — annual', prices.coach.annual, 'P1Y', currency),
    ],
  };
}

function offer(name: string, price: string, billingDuration: string, priceCurrency: string) {
  return {
    '@type': 'Offer',
    name,
    price,
    priceCurrency,
    priceSpecification: {
      '@type': 'UnitPriceSpecification',
      price,
      priceCurrency,
      billingDuration,
    },
  };
}

/**
 * One library recipe.
 *
 * `recipeInstructions` is an array of plain strings rather than `HowToStep`
 * objects. Both are valid for the property, and the plain form keeps the page
 * clear of anything resembling the standalone `HowTo` type, which Google
 * deprecated in September 2023.
 *
 * `prepTime`, `cookTime`, `totalTime` and `datePublished` are absent because
 * the source data has no such columns — see migration 012. Omitted rather than
 * estimated: a wrong cook time is worse than no cook time to the person who
 * followed it.
 */
export function recipeSchema(recipe: PublicLibraryRecipe, path: string) {
  const ingredients = recipe.ingredients.map((i) =>
    i.note ? `${i.text} (${i.note})` : i.text,
  );

  return {
    '@context': 'https://schema.org',
    '@type': 'Recipe',
    '@id': `${absolute(path)}#recipe`,
    name: recipe.title,
    url: absolute(path),
    ...(recipe.summary ? { description: recipe.summary } : {}),
    // Google's one hard requirement for a Recipe rich result. Every seeded row
    // has one; the guard is for the row that some day does not.
    ...(recipe.image_path ? { image: absolute(recipe.image_path) } : {}),
    recipeCategory: recipe.category,
    recipeYield: `${recipe.portions} servings`,
    recipeIngredient: ingredients,
    recipeInstructions: recipe.steps,
    nutrition: {
      '@type': 'NutritionInformation',
      calories: `${Math.round(recipe.kcal)} calories`,
      proteinContent: `${recipe.protein_g} g`,
      carbohydrateContent: `${recipe.carbs_g} g`,
      fatContent: `${recipe.fat_g} g`,
      ...(recipe.serving_size ? { servingSize: recipe.serving_size } : {}),
    },
    author: { '@type': 'Organization', name: recipe.source },
    ...(recipe.source_url ? { citation: recipe.source_url } : {}),
    // Both halves or neither — see the note at the top of this file.
    ...(recipe.rating !== null && recipe.rating_count !== null && recipe.rating_count > 0
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: String(recipe.rating),
            ratingCount: String(recipe.rating_count),
          },
        }
      : {}),
    isPartOf: { '@id': `${ORIGIN}/#website` },
  };
}

export function breadcrumbSchema(trail: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((step, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: step.name,
      item: absolute(step.path),
    })),
  };
}
