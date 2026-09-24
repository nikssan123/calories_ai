/*
 * The brand's own accounts, and why they live in a module of their own.
 *
 * `lib/seo.ts` would be the natural home, and was, until three footers needed
 * this list: `PublicShell` is a server component, `Landing` and `LegalPage` are
 * client ones. Importing `lib/seo` from a client component pulls `ORIGIN` into
 * the browser bundle, where `process.env.APP_URL` does not exist and the literal
 * fallback silently takes over — the same trap `components/legal/DocumentSchema`
 * exists to avoid. Nothing here reads the environment, so nothing can drift.
 */
/**
 * The brand's own accounts, in one list because four places have to agree.
 *
 * `sameAs` in the Organization node says these profiles are this entity, and
 * the footers show them — `lib/schema.ts` opens with the rule that structured
 * data may only claim what the page also shows, and a `sameAs` nobody can click
 * is exactly the half-claim that rule is about. That rule was broken within a
 * day of shipping: the links went into `PublicShell` only, which is the blog and
 * the recipe library, while the root layout emits `sameAs` on all 275 pages — so
 * the 13 landing pages and the 6 document pages claimed four URLs they never
 * showed. Every footer that exists renders this list now.
 *
 * Why it is worth the footer space at all: `SEO.md` §18 measured the off-page
 * surface at one edge wide — the Play listing — and the brand string is
 * ambiguous enough to compete with an album and a reporting term. Four
 * resolving profiles under one handle are four more places the same entity is
 * named, and the only ones this project owns outright.
 *
 * Handles verified against Buffer's connected channels and the YouTube channel
 * in `ADS.md` §4, and every URL fetched before it was written down. Nothing
 * goes in this list on the strength of a guessed handle.
 */
export const SOCIAL_PROFILES = [
  { name: 'Instagram', href: 'https://www.instagram.com/daysofarapp/' },
  { name: 'TikTok', href: 'https://www.tiktok.com/@daysofarapp' },
  { name: 'X', href: 'https://x.com/daysofarapp' },
  { name: 'YouTube', href: 'https://www.youtube.com/@daysofarapp' },
] as const;
