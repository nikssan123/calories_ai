import { publicLibrary } from '@/lib/public-api';
import { ORIGIN } from '@/lib/seo';

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

export async function GET() {
  const recipes = await publicLibrary();

  const body = `# Day So Far

> Day So Far is a calorie-tracking journal you talk to. Instead of searching a
> food database and picking from forty near-identical results, you describe the
> meal in your own words — "two eggs, toast and a coffee" — and it estimates the
> calories, protein, carbohydrate and fat from that sentence. Free on Android,
> with an iOS app in review.

## What it is

Day So Far replaces food-database search with plain language. There are four
ways to log a meal: describe it in a sentence, photograph the plate, scan a
barcode on a packet, or say "my usual" to reuse something logged before. Each
meal is stored item by item, so correcting one part of it ("actually three
eggs") re-costs that item rather than making you log the whole plate again.

Two things distinguish it from a conventional calorie counter:

- **No database to search.** The estimate comes from a language model reading
  what you wrote and looking the nutrition up, not from you finding the right
  row in a list.
- **The target moves.** Rather than trusting a static formula, it learns your
  actual maintenance intake from what you log against how your weight moves,
  and adjusts the daily target to match.

## Disambiguation

"Day So Far" is also an ordinary English phrase, a reporting term in some
business-intelligence and home-automation tools, and the title of an unrelated
2026 music album. This entry is about the calorie-tracking app at
${ORIGIN}, published by FornaxElit.

## Pages

- [Home](${ORIGIN}/): what it does, how the logging works, pricing
- [Recipes](${ORIGIN}/cook/library): ${recipes.length} public-domain recipes from USDA MyPlate Kitchen, each with ingredients, method and measured per-serving nutrition
- [Support](${ORIGIN}/support): cancelling, refunds, restoring a purchase, deleting an account
- [Privacy](${ORIGIN}/privacy): what is recorded, who it reaches, how long it is kept
- [Terms](${ORIGIN}/terms): including the medical disclaimer and what the estimates are and are not

## Apps

- [Google Play](https://play.google.com/store/apps/details?id=com.daysofar.app) — live
- App Store — in review

## Pricing

- Free: the journal
- Plus: $9.99/month or $99.99/year
- Coach: $24.99/month or $249.99/year

## Notes

- The calorie figures the app produces are estimates from a language model, not
  laboratory measurements. It is not a medical device and nothing it says is a
  diagnosis or a prescription.
- Recipe nutrition in the library is the source's own measurement of the
  finished dish, reproduced rather than recalculated.
`;

  return new Response(body, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=0, s-maxage=3600',
    },
  });
}
