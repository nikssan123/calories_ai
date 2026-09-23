import type { PublicLibraryRecipe } from '@ct/shared';
import { ORIGIN, SOCIAL_PROFILES } from '@/lib/seo';

/**
 * Schema.org JSON-LD, built from data the app already holds.
 *
 * One rule runs through all of it: a property is emitted only when there is a
 * real value behind it, *and* the page shows the same thing. The second half is
 * the one that had to be learned. An invented `aggregateRating` earns a manual
 * action, which this file guarded against from the start — but so does a
 * truthful one that belongs to another site's readers and appears nowhere on the
 * page, which is what the recipe block shipped ninety-nine times. See the note
 * in `recipeSchema`.
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
 * The one human behind the site, as a node other pages can point at.
 *
 * Not an author credit. `/about` has said since 2026-09-12 that Day So Far is
 * built, run and paid for by one named person, and the privacy policy names the
 * same person as the data controller — this puts that fact where a crawler
 * building an entity graph can read it, which is the same job `sameAs` does for
 * the brand. "Day So Far" competes for its own name with an album and a
 * reporting term; an organisation with a named founder is a sharper entity than
 * one without.
 *
 * Deliberately no `sameAs` on this node. The brand's profiles belong to the
 * brand, and nothing in this repo knows a verified personal profile to point at.
 * An invented one would be the exact failure the file header is about.
 */
export const PERSON_ID = `${ORIGIN}/#person`;

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
        /*
         * Every place this entity is also named. The Play listing was the only
         * one for as long as it was the only one that existed; the four
         * profiles are the brand's own accounts, and they are in the footer too
         * — see `SOCIAL_PROFILES`. The App Store listing joins the list the day
         * Apple publishes it, and not before.
         */
        sameAs: [
          'https://play.google.com/store/apps/details?id=com.daysofar.app',
          ...SOCIAL_PROFILES.map((p) => p.href),
        ],
        founder: { '@id': PERSON_ID },
      },
      {
        '@type': 'Person',
        '@id': PERSON_ID,
        name: 'Nikolay Lyutov',
        url: absolute('/about'),
        description:
          'Independent developer established in the European Union. Day So Far is built, run and paid for by him alone: no company, no investors, no team.',
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
    /*
     * No `aggregateRating`, and `recipe.rating` / `recipe.rating_count` are
     * deliberately left unread.
     *
     * They are real numbers, which is what made this look safe: each is the
     * rating myplate.gov's own readers gave that recipe, carried across with the
     * rest of the row. But Google's review-snippet policy is not about whether a
     * rating is invented — it is about whose rating it is and whether the page
     * shows it. "The aggregateRating must reflect the experiences of users on
     * your website", and this site has no review mechanism at all: strip the
     * scripts from any of the ninety-nine pages and neither the value nor the
     * count appears anywhere in the visible text. Ninety-nine pages claiming
     * stars they never display, for reviews left on somebody else's site, is the
     * shape of a structured-data manual action.
     *
     * So it goes, rather than being replaced with something plausible. The stars
     * come back if this site ever collects its own — or if the source's rating is
     * one day rendered on the page and attributed to it, which would make the
     * claim true and is the other legitimate way out.
     */
    isPartOf: { '@id': `${ORIGIN}/#website` },
  };
}

/**
 * A fixed page: what kind of page it is, when it last changed, and the trail to
 * it.
 *
 * The six document pages — `/about`, `/accuracy`, `/how-it-works`, `/support`,
 * `/privacy`, `/terms` — carried nothing but the sitewide `Organization` and
 * `WebSite` nodes: no page-level type at all, and no breadcrumb, while the
 * recipes and every blog post had one. The `updated` date is the same string the
 * page already prints under its heading, so the markup and the visible text
 * cannot drift.
 *
 * `@type` is passed in because these are not all the same kind of thing:
 * `AboutPage` for `/about`, `ContactPage` for `/support`, `WebPage` for the rest.
 * Google does nothing special with any of them; a crawler building an entity
 * graph does.
 */
export function documentSchema({
  type = 'WebPage',
  name,
  path,
  description,
  updated,
  mainEntityId,
}: {
  type?: 'WebPage' | 'AboutPage' | 'ContactPage';
  name: string;
  path: string;
  description: string;
  updated: string;
  /**
   * The node this page is *about*, where there is one — `/about` is about the
   * person, and saying so is what connects the Person node to a page a reader
   * can check it against. Omitted everywhere else: a page whose subject is
   * itself needs no `mainEntity`.
   */
  mainEntityId?: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': type,
    '@id': absolute(path),
    url: absolute(path),
    name,
    description,
    dateModified: updated,
    inLanguage: 'en',
    ...(mainEntityId ? { mainEntity: { '@id': mainEntityId } } : {}),
    isPartOf: { '@id': `${ORIGIN}/#website` },
    publisher: { '@id': `${ORIGIN}/#organization` },
    breadcrumb: breadcrumbSchema([
      { name: 'Day So Far', path: '/' },
      { name, path },
    ]),
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
