# SEO audit — daysofar.com

> **Re-audited 2026-09-20.** The 2026-09-12 audit below (scored 24/100) is kept as
> an appendix. Every Critical item it raised is fixed. This document leads with the
> new audit; skip to [Appendix](#appendix--the-2026-09-12-audit-superseded) for the
> old one.

Next.js 15.5.23 App Router, `output: 'standalone'`, self-hosted behind Caddy at
204.168.249.73 (Hetzner, Helsinki). 223 URLs in the sitemap, all 200, no redirects.

**SEO Health Score: 61 / 100** (was 24).

| Category | Weight | Then | Now |
|---|---|---|---|
| Technical SEO | 22% | 20 | **66** |
| Content quality | 23% | 34 | **61** |
| On-page SEO | 20% | 15 | **60** |
| Schema / structured data | 10% | 0 | **62** |
| Performance (CWV) | 10% | 55 | **68** |
| AI search readiness | 10% | 10 | **55** |
| Images | 5% | 45 | **42** |

The site is no longer absent. It renders, it is crawlable, it has 223 real pages,
eight structured-data types and a genuinely good blog. What holds it at 61 is one
technical defect that hides the `<head>` of 191 pages from the main Googlebot
crawler and every AI crawler, one structured-data policy violation replicated 99
times, and the fact that nothing links to it from anywhere on the internet.

---

## 1. Everything the last audit asked for is done

| 2026-09-12 finding | Status | Proof |
|---|---|---|
| Every URL served an empty body (`AuthGate` returned `null` in SSR) | **Fixed** | All 223 URLs render server-side. `/` 1,628 words, median blog post 1,126, median recipe 255. No zero-word pages |
| No `robots.txt` | **Fixed** | `Allow: /`, `Disallow: /api/ /c/`, plus `Host:` and `Sitemap:` |
| No `sitemap.xml` | **Fixed** | 223 URLs, all 200, zero redirects |
| No canonical anywhere | **Fixed** | 223/223, every one self-referential (0 mismatches) |
| No structured data anywhere | **Fixed** | Organization + WebSite ×223, BreadcrumbList ×204, Recipe ×99, Article ×91, SoftwareApplication + FAQPage ×13, CollectionPage ×1. 867 nodes, zero parse errors |
| `www.daysofar.com` a dead hostname | **Fixed** | `dig www` → 204.168.249.73; `https://www/` → 301 → apex. HSTS `max-age=63072000; includeSubDomains; preload` |
| `/admin` publicly crawlable | **Fixed** | `x-robots-tag: noindex, nofollow` on `/admin`, `/today`, `/login`, `/c/*`, absent on public pages. `middleware.ts:73` → `lib/seo.ts:66` is default-deny, so a route added tomorrow is private automatically |
| 99 recipe pages live and wasted | **Fixed** | All 99 public and indexable with Recipe schema |
| Duplicate metadata across 12+ routes | **Mostly fixed** | 0 duplicate meta descriptions across 223 pages. 12 duplicate titles remain (§11) |
| Landing page targeted no query | **Fixed** | `Day So Far — the calorie counter you just talk to`, FAQPage, 13 locales |
| No content at all | **Fixed** | 91 blog posts, `/about`, `/accuracy`, `/how-it-works` |

Also verified correct and worth not breaking: `/about/` → one clean 308 to `/about`;
`/About` and `/cook/library/2-Step-Chicken` → 404 (no case-duplicate surface);
bogus slugs → real 404s, no soft-404s; `?utm_source=` canonicalises without a
redirect; `x-default` correctly points at the bare English path and `/en` 308s to
`/` (`lib/landing.ts:35`, `lib/blog.ts:62`, `middleware.ts`); HTTP/2 with HTTP/3
advertised; `/_next/static/*` served `public, max-age=31536000, immutable`; **zero
third-party scripts** — no analytics, no tag manager, no trackers anywhere.

---

## 2. Critical — the `<head>` of 191 pages is empty for the crawlers that matter

On `/cook/library`, all 99 recipes and all 91 blog posts, the `<title>`,
`<meta description>`, `<link rel=canonical>` and all 14 hreflang links are flushed
**after** `</head>` closes, tens of kilobytes into the body.

| Page | `</head>` at byte | `<title>` at byte |
|---|---|---|
| `/cook/library/2-step-chicken` | 3,796 | 35,384 |
| `/blog/weekends-ruin-calorie-deficit` | 3,565 | 61,362 |
| `/bg/blog/uikendat-provalya-dietata` | 3,578 | 69,928 |
| `/cook/library` | 3,562 | 78,616 |
| `/` (control) | 9,082 | 4,153 — correct |

### Who actually sees which version

Next.js decides per request. `shouldServeStreamingMetadata()`
(`node_modules/next/dist/esm/server/lib/streaming-metadata.js`) tests the
User-Agent against `HTML_LIMITED_BOT_UA_RE`
(`.../shared/lib/router/utils/html-bots.js`); a match gets a blocking render with
metadata resolved into `<head>`, everything else gets the streamed version.
Measured live against `/cook/library/2-step-chicken`:

| User agent | bytes | `</head>` at | `<title>` at | in `<head>`? |
|---|---|---|---|---|
| **Googlebot/2.1** (both classic and smartphone UA) | 38,166 | 3,729 | 16,531 | **no** |
| **GPTBot/1.2** | 38,166 | 3,729 | 16,531 | **no** |
| **ClaudeBot/1.0** | 38,166 | 3,729 | 16,531 | **no** |
| PerplexityBot, CCBot | 38,166 | 3,729 | 16,531 | **no** |
| Chrome 153 | 38,166 | 3,729 | 16,531 | **no** |
| bingbot/2.0 | 36,561 | 5,539 | 1,994 | yes |
| **Google-InspectionTool/1.0** | 36,561 | 5,539 | 1,994 | yes |

The regex matches `Google-[\w-]+` and `[\w-]+-Google` — so `Google-Extended`,
`Google-InspectionTool` and `AdsBot-Google` match, but **plain `Googlebot` does
not**, because it has no hyphen next to "Google". Bing, Facebook, Twitter, Slack,
Discord, WhatsApp and Applebot are all on the list and are fine. Googlebot, every
AI crawler and every plain browser are not.

**The trap worth naming on its own:** `Google-InspectionTool` is the agent behind
Search Console's URL Inspection. Inspect a recipe page there and it looks perfect.
The crawler that actually indexes it does not see the title in `<head>`.

Googlebot's second-wave Chromium render will most likely recover the title (React
hoists it on hydration), and Google does in practice read a `<title>` from outside
`<head>`, so this is a fragility and an AI-crawler blackout rather than a
guaranteed indexing failure. But it is a blackout on the only substantial content
the site has, and the fix is small.

### Root cause and fix

`force-dynamic` **plus an async fetch inside `generateMetadata`** is the trigger —
not `force-dynamic` alone. The blog *index* pages are also `force-dynamic` but
their `generateMetadata` is synchronous (`app/blog/page.tsx:21`), and they render
their titles in `<head>` correctly.

- `app/cook/library/[slug]/page.tsx:39` — `export const dynamic = 'force-dynamic'`; `generateMetadata` awaits `publicRecipe(slug)`
- `app/blog/[slug]/page.tsx:20` — same, awaits `blogPostMetadata('en', slug)`
- `app/[locale]/blog/[slug]/page.tsx:23` — same
- `app/cook/library/page.tsx:24` — same

For the three `[slug]` routes: **delete `export const dynamic = 'force-dynamic'`,
add `export const revalidate = 3600`, and add a `generateStaticParams` that returns
`[]`.** All three parts are needed.

> **Correction.** This section first said `revalidate` alone was enough and that
> `generateStaticParams` should not be added. That is wrong, and measuring it is
> what showed why. A/B in one production build, one server: the recipe route with
> an empty `generateStaticParams` served its title inside `<head>` under
> `s-maxage=3600, stale-while-revalidate`; `/blog/[slug]` with `revalidate` alone
> stayed `ƒ (Dynamic)` and kept answering `no-store` with the title in the body.
> `generateStaticParams` is the function Next asks whether a route has any static
> shape at all, so a dynamic segment only becomes static-capable once it exists.
> Returning `[]` says "static-capable, nothing known at build time" — which keeps
> the property `force-dynamic` was protecting, because the build still calls no API
> and bakes no pages. `dynamicParams` defaults to true, so each slug renders on its
> first request and is cached after it.

The code comment's reason for forcing dynamic ("the build runs in a container with
no API… the empty result was baked into the image", commit `a0c5664`) is real, and
still applies to the routes with no dynamic segment — which is why `/cook/library`,
`/blog` and `/{locale}/blog` keep the flag.

`/cook/library` (no dynamic segment) is the one place `force-dynamic` may genuinely
need to stay until the build can reach the API, or until the fetch failure is caught
and handled with a fallback.

This one change also fixes §3.

---

## 3. Critical — 204 of 223 pages are uncacheable

Direct consequence of the same flag. Measured:

```
/                              cache-control: s-maxage=31536000   x-nextjs-cache: HIT   x-nextjs-prerender: 1
/bg /about /accuracy /privacy  cache-control: s-maxage=31536000   x-nextjs-cache: HIT
/blog  /bg/blog  /cook/library  /blog/<slug>  /cook/library/<slug>
                               cache-control: private, no-cache, no-store, max-age=0, must-revalidate
```

No browser cache, no CDN cache, no Next Full Route Cache on every blog index, every
blog post, every recipe and the library index. Today the cost is hidden — server
render is fast (TTFB 0.235s static vs 0.248s dynamic, 5 samples each) — but there is
no cache to absorb a spike. A post that gets attention takes every concurrent
visitor straight through a full SSR render.

Fix: the ISR change in §2. Then a CDN in front becomes possible, which is the only
way to fix the geography: single Helsinki origin, 3 round-trips to first byte
(TCP → TLS → request), so TTFB ≈ 3×RTT. From Varna that is 0.23s; for US-West,
Singapore and Sydney visitors it is an estimated 0.5s–0.9s before render work
starts, on pages whose LCP is a text node.

---

## 4. Critical — 99 recipe pages carry a structured-data policy violation

Every one of the 99 recipes emits an `aggregateRating` imported from the USDA
MyPlate source:

```json
"aggregateRating": { "@type": "AggregateRating", "ratingValue": "3.94", "ratingCount": "510" }
```

Values are per-recipe and real — on myplate.gov. They appear **nowhere on
daysofar.com**. Stripping every `<script>` and tag from
`/cook/library/2-step-chicken` and searching the visible text: `3.94` → not found,
`510` → not found, `star` → not found. There is no review mechanism on the site at
all.

Google's review-snippet guidelines require ratings to come from the site's own users
and to be visible on the page. This is a sitewide pattern across 99 pages, so the
exposure is the whole `/cook/library` section losing Recipe rich results, or a
structured-data manual action.

**Remove `aggregateRating` from all 99 blocks. Do not replace it with a value.**

The same section is also missing what the Recipe rich result actually rewards — on
all 99: no `prepTime`, `cookTime`, `totalTime`, `datePublished`, `keywords`,
`recipeCuisine`; `recipeInstructions` is a plain string array rather than
`HowToStep`; and `author.name` holds a 130-character attribution sentence where a
name belongs (the real citation is already correctly in `citation`). Only ~16 of 99
recipes state a duration in their instructions, so times must be filled per-recipe
or omitted — not templated.

`/cook/library/quick-chili` is missing `description` entirely.

---

## 5. High — 108 non-English pages declare themselves English

`app/layout.tsx:62` hardcodes `<html lang="en">`. All 223 pages serve it, and it is
wrong on 108 of them: the 12 non-English locale homepages, the 12 non-English blog
indexes and the 84 non-English blog posts. It is
corrected client-side only, by `lib/i18n.ts:111` and `:240` via the inline
`LOCALE_INIT_SCRIPT`. Browsers self-correct before paint; curl, most AI crawlers and
anything reading the static document do not.

The locale is already known server-side from the `[locale]` segment. Move
`<html lang={locale}>` into a locale-aware layout so the attribute is right in the
first byte, and keep the inline script only for the authenticated shell where the
locale genuinely is not resolvable until a session loads.

## 6. High — 13 blog index pages are an hreflang cluster with no hreflang

`/blog` and the 12 `/{locale}/blog` pages are exact equivalents. `<link
rel="alternate">` count on each: **0**. `/` and the locale homes carry 14 each; the
91 blog posts carry 14 each. Only the indexes were missed.

Separately, `app/sitemap.ts` applies `alternates` to the 13 landing pages only —
182 `xhtml:link` entries, exactly 13 × 14 — and never to the 91 blog posts, even
though the comment at `sitemap.ts:42` states the rule it is skipping and
`hreflangFor()` in `lib/blog.ts:54` already computes the data. On-page hreflang is
the signal Google weights most, and that is present on posts, so this is secondary —
but it is a bug, not a decision.

The 99 recipes and 7 marketing/legal pages legitimately have no hreflang:
`/bg/how-it-works`, `/bg/about`, `/bg/cook/library` all 404, because no such route
exists under `[locale]`. English-only is a product decision there, not a markup gap.

## 7. High — `lastmod` is stamped at request time for 132 of 223 URLs

`app/sitemap.ts` is itself `force-dynamic`, so `sitemap()` re-runs on every fetch and
every `new Date()` (lines 35, 51, 62, 68) stamps the moment the crawler asked. Two
fetches nine minutes apart gave different `lastmod` values for the same unchanged
homepage. The 91 blog posts are the exception and do it correctly — real distinct
`post.updated_at` values spanning 2026-09-12 to 2026-09-20 — and a domain that lies
about `lastmod` on 59% of its URLs teaches Google to ignore the field everywhere,
including where it is true.

Also in `sitemap.ts`: `changefreq` and `priority` are dead weight (Google has ignored
both since 2023) across a six-tier priority scheme nothing reads, and
`publicLibrary()` / `publicPostSitemap()` are awaited with no try/catch — both
null-coalesce to `[]`, so an API blip silently drops 99 or 91 URLs from the sitemap
rather than failing loudly.

## 8. High — one fact, two numbers, across 44 pages

The energy density of body fat is stated as **7,700 kcal/kg** on 30 pages —
including `/how-it-works`, the methodology page — and **7,000 kcal/kg** on 14.
Every German page says 7,000. So do the Bulgarian, Czech, Croatian, Slovak and
Ukrainian weekend posts and two Spanish ones.

Cause is structural: each locale's article is written independently by a model
(`feat(blog): thirteen languages, each writing its own article rather than
translating ours`) with no shared constants table. In YMYL content, a number that
contradicts your own methodology page across locales is the kind of thing that
erodes exactly the trust `/accuracy` is built to earn. Pin the constants the
generator is allowed to use.

## 9. High — nothing carries an author, on a health site

`Article.author` on all 91 posts resolves to `{"@id": ".../#organization"}`. No post
has a visible byline, and `grep -liE 'written by|reviewed by|medically reviewed'`
across all 223 pages matches only `/about`, `/privacy`, `/terms`.

> **Correction — do not add a human byline.** This section originally recommended a
> `Person` entity for Nikolay Lyutov as `Article.author`. That is wrong, and
> `components/blog/pages.tsx` already says why in a comment I should have read
> before recommending against it: the posts are written by a model, one per language
> per topic, not translated and not written by him. "Attributing a generated article
> to a named human would be the one dishonest thing on the page." Organization as
> author is the honest answer and it stays.
>
> What the finding correctly identifies is a *transparency* gap, and the fix is the
> opposite of a byline: say on the page that the articles are model-written and what
> that means for the numbers in them. `/accuracy` and `/how-it-works` set the
> standard for that kind of disclosure; the blog does not meet it yet.

`/about` already names a real person — "built, run and paid for by Nikolay Lyutov,
an independent developer" — and `/about`, `/accuracy` and `/how-it-works` are honest
that this is a developer, not a dietitian. That honesty is the asset to build on.

Also missing: a visible "Last updated" line on posts (the three marketing pages
already do this well), and outbound citations in post bodies — the load-bearing
numbers (7,700 kcal/kg, kcal per pint) have no source link, even though
`/how-it-works` and `/accuracy` cite USDA FoodData Central, Open Food Facts and
Nutrition5k properly.

*Note: the post dates are real and stable, not generated per request — `/blog/weekends-ruin-calorie-deficit` returns `2026-09-20T08:54:58.473Z` identically across fetches hours apart, and the 7 English posts run one per day from 09-12 to 09-20. That is a genuine launch cadence.*

## 10. High — the 99 recipes are thin, reproductive and near-orphaned

Median 255 words, 84 of 99 under 300. Content per page is one marketing sentence,
macros, an ingredient list, numbered method and an attribution line. The method is
reproduced close to verbatim from USDA MyPlate Kitchen — step 1 on every sampled
recipe is "Wash hands with soap and water.", a USDA house-style tell — and the same
text is already live on myplate.gov, nutrition.gov, foodhero.org, NDSU Extension and
several state health sites, all of which will outrank a new marketing domain for
identical text. The attribution is honest and prominent, which avoids a plagiarism
problem but caps the standalone value.

Structurally they are worse off than they look: **exactly 2 internal links on every
one of the 99**, `/cook/library` is the only page that links to them, and they carry
no site footer — no path to `/blog`, `/how-it-works` or `/accuracy` from any recipe.
0 of 99 link anywhere but the library index and Google Play.

The honest recommendation: `noindex, follow` the 99 individual recipes, keep
`/cook/library` indexed as one consolidated resource, keep the pages live for in-app
use, and cite 3–5 recipes as worked examples inside
`/blog/count-calories-homemade-food`. Do not build out "calories in X" ingredient
pages — every recipe states "Measured for the finished dish, as published — so there
are no per-ingredient numbers to show", so the data for that play does not exist, and
the SERP is owned by Healthline, CalorieKing, FatSecret and USDA FDC.

If the recipes stay indexed instead, they need original value per page (why the
macros suit a deficit, swaps, timing notes) and a footer — not more of them.

---

## 11. On-page

| group | n | title len min/med/max | desc len min/med/max |
|---|---|---|---|
| home (en) | 1 | 49 | 151 |
| home (locale) | 12 | 49 / 54 / 58 | 149 / 158 / 160 |
| marketing/legal | 7 | 18 / 21 / 29 | 100 / 137 / 183 |
| recipe | 99 | 22 / 34 / 70 | 54 / 131 / 396 |
| blog index | 13 | 17 / 17 / 22 | 64 / 76 / 93 |
| blog post | 91 | 56 / 69 / 84 | 123 / 146 / 172 |

- **85 titles over 60 characters**, 83 of them blog posts, up to 84. The titles
  themselves are good; the ` — Day So Far` suffix is what pushes them past
  truncation. Drop the suffix on posts whose title already exceeds ~55 characters.
- **The marketing pages waste their titles.** `About — Day So Far`,
  `Accuracy — Day So Far`, `Support — Day So Far`, `Recipes — Day So Far`,
  `How it works — Day So Far` — 18 to 29 characters, no query in any of them, and the
  H1s match: `About`, `Accuracy`, `Recipes`, `How it works`. These sit on 537–3,529
  words of the best trust content on the site. `/accuracy` in particular should say
  what it is: *"How accurate is calorie tracking? Measured error rates — Day So Far"*.
- **12 duplicate titles**: `Blog — Day So Far` ×9, `Блог — Day So Far` ×3. Partly a
  loanword coincidence, still worth differentiating per locale — and it is a chance
  to put a query in a title that currently has none.
- **30 meta descriptions over 160 characters**, 25 of them recipes, longest 396 —
  the USDA blurb passed straight through.
- Clean otherwise: exactly one H1 on all 223 pages, no skipped heading levels, and
  **0 duplicate meta descriptions across 223 pages**, which says the localisation
  pipeline works.

Internal links per page: recipe 2/2/2 · marketing 14/16/112 · blog index 19 ·
blog post 26 · home 41. **`/support` has zero inbound internal links** from any of
the 223 pages — it is in the sitemap and indexable but reachable only from inside the
authenticated app. Put it in the footer.

## 12. Performance

No field data: no Google API key is configured, so no CrUX and no PageSpeed. LCP, INP
and CLS as Google measures them are **unknown**. Lab measurements below.

Good: TTFB 0.234s static / 0.248s dynamic (5 samples each, EU client). CSS is 20.4 KB
gzip across two files. Zero third-party scripts. **Measured CLS 0** on 4 pages × 2
viewports via `PerformanceObserver`, including the recipe page — the raw `<img>` has
no `width`/`height` but sits in an `aspect-[4/3]` container that reserves the space,
and `next/font` is the CLS-safe pattern. No horizontal overflow at 390px or 1440px.
Static assets `immutable`.

Worth fixing:
- **The homepage ships the most JavaScript on the site — 515 KB gzip across 28 chunks
  — for a page with zero images, one H1 and a CTA.** Blog posts ship 388 KB, recipes
  399 KB. Run `ANALYZE=true next build` in `apps/web`; the thing to look for is
  authenticated-journal code leaking into the public bundle.
- **No brotli, and zstd is supported but not selected.** `Accept-Encoding: br` alone
  returns uncompressed. Sending Chrome's real header still gets gzip. zstd already
  works and is 11.6% smaller than gzip on the homepage (24,215 vs 27,383 bytes). One
  Caddy line: `encode zstd br gzip`.
- Recipe pages preload **11 woff2 files** for 4 font groups — not a CLS risk, but 11
  high-priority fetches competing with the image on every request.
- LCP is a text node on `/`, blog posts and `/cook/library` (0 `<img>` on all three),
  so it is gated by TTFB + render-blocking CSS, which is why §3's geography matters.
- The 5.87s outlier in the crawl was `/bg/blog/tryabva-li-da-merya-hranata-na-kantar`;
  it does not reproduce (0.38–0.56s over 5 tries). A `force-dynamic` route with no
  cache is structurally capable of tail spikes — check server logs if it recurs.

Missing headers: no `Content-Security-Policy`, no `Permissions-Policy`, no COOP/CORP.
`x-powered-by: Next.js` is still advertised (`poweredByHeader: false` is unset).
`http://www` takes 2 hops (308 → 301 → apex) — rare entry point, cheap Caddy fix.

## 13. Images

103 of 223 pages have an `og:image`: `/`, the 99 recipes (their own photo), `/privacy`,
`/support`, `/terms`. **Missing on 120** — all 91 blog posts, all 12 locale
homepages, all 13 blog indexes, and `/about`, `/accuracy`, `/how-it-works`,
`/cook/library`.

The cause on three of those is precise: `app/about/page.tsx:12`,
`app/accuracy/page.tsx:12` and `app/how-it-works/page.tsx:12` each set
`openGraph: { title, description, url }` with no `images` key, which drops the
inherited file-based `app/opengraph-image.png`. `/privacy`, `/support` and `/terms`
set no `openGraph` object and keep the image. Add `images` to those three.

The site has exactly 99 `<img>` elements in total — one hero per recipe, every one
with a real alt. Zero on the homepage, the 12 locale homes, all 91 blog posts, all 13
indexes and all 7 marketing pages. That buys real speed, and it costs: no Image
Search presence, no `Article.image` (so no Discover eligibility and no rich result),
and a bare social card for every blog post the site wants shared. The recipe `<img>`
is raw, not `next/image` — no `srcset`, so mobile downloads the desktop file.

The homepage has no app screenshot either — it renders a coded interactive demo
instead. Defensible as design; it means there is no "here is what it looks like on
your phone" proof anywhere, and nothing for a product unfurl.

## 14. Mobile and UX (Playwright, 24 screenshots, live render)

- **`maximum-scale=1` blocks pinch-zoom on every page.** Read back identically on 8
  loads: `width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover,
  interactive-widget=resizes-content`. That is a WCAG 1.4.4 failure, not just an SEO
  nit. Drop `maximum-scale=1`.
- **On iPhone the homepage's primary CTA is a dead end** — it reads "iPhone app
  coming soon" with nowhere to go, above the fold, device-detected. The only working
  link is the small secondary Google Play one. Across all 223 pages: **223 link to
  play.google.com, 0 link to apps.apple.com.** At minimum make it a notify-me.
- **Recipe pages have no CTA above the fold and 2 tap targets on the whole page.**
  The only one, "Google Play", sits at `top: 1913px` on an 844px viewport — 2.3
  screens down. That is 99 of 223 URLs.
- **Blog posts throw React error #418 (SSR/client text mismatch)** on both desktop
  and mobile renders — not on `/`, `/accuracy` or recipes. Worth root-causing in the
  91-page blog template; it is separate from the metadata issue.
- The "Google Play" badge renders **24px tall** everywhere — half the 48px minimum,
  on one of the two real conversion links on the site.
- No hamburger menu: on mobile the nav collapses to logo + language + CTA, and
  `How it works / Features / Pricing / FAQ / Blog / For coaches` are all `hidden`
  with no toggle. Content pages offer only a breadcrumb back.
- Three homepage feature blocks with real copy start at `opacity-0` pending a
  scroll-reveal — a content-gating risk if a renderer never triggers the observer.
  Unmeasured whether Google's renderer does.
- Dark mode is right: the inline theme script is synchronous in `<head>`, and forcing
  dark gave `body` background `rgb(26, 21, 18)`, an exact match to the dark
  `theme-color` `#1a1512`, on all 4 pages. A sub-frame flash on a throttled device
  was not measurable.

## 15. AI search readiness

Structurally the blog is close to ideal for citation. `/blog/weekends-ruin-calorie-deficit`
opens with a self-contained 45-word answer — *"Yes, easily — because the maths isn't
symmetrical. Five days at a 500 kcal deficit puts 2,500 kcal in hand, and two
unmeasured days out can spend that in a single Saturday"* — with question-shaped H2s
and concrete numbers throughout. That is the AI-Overview answer shape.

What blocks it:

- **§2 hits every AI crawler.** GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot and
  CCBot all get the streamed version on all 191 pages. Bing and Google-Extended do
  not. So the best-served AI surface is Bing Copilot and the worst-served is ChatGPT
  search, which is also the one that reads llms.txt.
- **`/llms.txt` exists and is well-formed, and links the wrong 5% of the site.** It
  lists Home, Recipes (index only), Support, Privacy, Terms. It omits the entire
  blog — 91 posts on exactly the question-shaped queries an answer engine wants —
  and omits `/accuracy`, `/how-it-works` and `/about`. Four lines in
  `app/llms.txt/route.ts` fixes the highest-leverage gap on the site.
- **`Organization.sameAs` holds one URL** (the Play listing). No Wikipedia, Wikidata,
  Reddit, YouTube, LinkedIn or X link appears in any of the 223 pages. The site's own
  llms.txt says "'Day So Far' is also an ordinary English phrase, a reporting term in
  some business-intelligence tools, and the title of an unrelated 2026 album" — the
  team knows it has an entity-disambiguation problem and `sameAs` is the mechanism
  that solves it.
- **No comparison content at all.** `grep -icE "vs-|alternativ|compar|best-"` over the
  223 URLs returns 0.

**Keep robots.txt allowing AI crawlers.** The generic advice to block CCBot and
training crawlers is wrong here: the site's problem is name ambiguity, and training
exposure that pairs "Day So Far" with "calorie app, Nikolay Lyutov" is the thing that
fixes it. There is no paywalled content to protect — the recipes are public-domain
USDA text, the blog is marketing, the journal is behind auth.

## 16. Where the traffic can actually come from

A web search for the exact brand string returns nothing for daysofar.com or the app.
Category head terms are owned by editorial roundups (Healthline, Forbes, Fortune,
Garage Gym Reviews) and the incumbents' own domains.

**Winnable in 6 months:**

1. **"calorie tracker you talk to" / "voice calorie tracker" / "AI calorie counter
   from text".** The SERP here is small product landing pages — Talk-to-Track,
   TalkFood, CalChat — no bigger than this app. daysofar is the closest literal match
   (`h1` is "Just say what you ate.") and does not appear at all. The phrase is not
   in any heading on the page. **This is the wedge.** Put it in the homepage H2s and
   title variants.
2. **The exact long-tail the blog already targets.** "do weekends ruin calorie
   deficit" ranks NBC (syndicated), a Medium post, a dietitian's blog, a PT's
   Squarespace and a CrossFit gym. The existing post beats most of that on format.
   The gap is E-E-A-T (§9), not content.
3. **"MyFitnessPal alternative" — after building the page.** That SERP is made of
   comparison pages from single-product sites (foodnoms.com, mynetdiary.com) plus
   roundups. daysofar has zero. "The only calorie app that publishes its own measured
   error rate" is a sharper wedge than "ad-free", and nothing in that SERP uses it.

**Not winnable in 6 months:** "calorie counting app" (Forbes/Fortune editorial — the
route in is being *included* in someone else's listicle, which is outreach, not SEO);
"AI calorie counter" (the SERP is store listings, so it is an ASO problem, and the
iOS listing does not exist); "counting calories not losing weight" (Harvard Health,
Zoe, Hers); recipe-name queries (Allrecipes tier, against duplicate text).

**Trust is the weakest axis in all three personas scored** — a churned MFP user
(68/100), a mid-diet searcher (73/100) and an App-Store-bound visitor (58/100). No
testimonials, no ratings, no download count, no press anywhere on the site, while
`/accuracy` holds exactly the credibility content that would fix it and is linked
from 120 pages of boilerplate but surfaced in none of them.

## 17. Content architecture: 7 spokes, no hub

The 7 English posts pull genuinely distinct SERPs — checked pairwise on the two
closest pairs, zero shared URLs — so there is no cannibalisation. The problem is
isolation: the only in-body anchor in all seven posts is the Google Play link. No
post links to another post, to `/how-it-works`, to `/accuracy` or to a recipe.

Build `/blog/how-to-count-calories` as the pillar (2,800–3,500 words, a summary
section per spoke with a "full guide →" link), targeting "how to count calories
without weighing everything" rather than the bare head term Healthline owns. Then
retrofit links both ways before writing anything new.

**The 12-language bet is sound — keep it.** The same seed query was run in Bulgarian,
Czech, Hungarian, Greek, Romanian, Ukrainian and Croatian: no DR-90 site appears in
any of them. The competition is local niche blogs, forums and calorie-database
utilities with no long-form content. That is a materially easier fight than English,
and it is presumably why the 13 locales exist. Two caveats: sequence new posts
English-first and translate the winners, rather than minting 195 pages before one is
validated; and `/how-it-works`, `/accuracy` and `/about` — the pages carrying the
trust argument — are English-only, so a Bulgarian reader who clicks through from a
translated post lands in English.

## 18. Off-page: one edge, and it points at Google Play

No Moz or Bing Webmaster key is configured, and the Common Crawl web graph cannot
answer this question even at full tier — its domain-edges file uses numeric vertex IDs
with no ID→domain mapping shipped, so `top_referring_domains` is hardcoded empty
regardless. A direct stream of the current release (`cc-main-2026-apr-may-jun`, 2.4 GB
gz) did not finish in budget and was abandoned. Treat referring domains as
**effectively zero** — a domain that was unindexed eight days ago will not appear in a
quarterly crawl graph, and the brand search returns nothing.

What *can* be measured is the owned citation surface, and it is one edge wide:

| Surface | State |
|---|---|
| Google Play (`com.daysofar.app`) | Linked — the only `sameAs` entry, and 399 outbound links across the 223 pages |
| Apple App Store (`id6807134161`) | Not published yet (`apps.apple.com` 404s), correctly not linked. **Day-of-launch checklist item:** set the App Store listing's developer-website field to daysofar.com *and* add the link here the same day |
| GitHub, LinkedIn, X, Reddit, YouTube, Wikidata | Absent from `sameAs` and from every page |
| Product Hunt, AlternativeTo, SaaSHub, G2 | Unverifiable at this tier — check manually |

Fix the entity graph before doing any outreach: there is currently nothing for an
external citation to consolidate onto except the Play listing. Then, in rough
effort-to-value order: confirm the Play Console developer-website field points at the
apex; batch the free app directories (AlternativeTo, SaaSHub, Slant) in one sitting;
launch on Product Hunt with a demo GIF of natural-language entry (a solo-built
app with a published error rate is exactly what that audience rewards); pitch
`/accuracy` directly to the handful of writers who publish the MyFitnessPal-alternative
roundups; participate honestly in r/loseit and r/CalorieCounting where logging friction
is the standing topic; pitch the builder story to an indie-hacker outlet.

`/accuracy` is the only genuinely linkable asset on the site. Nobody in this category
publishes a measured error rate against an independent weighed dataset. One caveat on
the pitch: 66% MAPE is a high number to lead with unframed — position it against
comparable photo-estimate and manual-logging error rates, or explicitly as the first
honest number in a category that publishes none, or it gets covered as "app admits it
is often wrong."

Explicitly not worth doing: directory-blast services, paid link packages, PBNs. On a
young health-adjacent domain with no toxicity tooling at this tier, that is downside
with no upside.

### One broken outbound link

`/es/blog/calorias-de-mantenimiento-reales` links in body copy to
`https://daysofar.app` — a domain that does not resolve (NXDOMAIN). The Spanish
generator invented the product's own URL. Every other external host on the site is
legitimate (`play.google.com` ×399, `myplate.gov` ×3, `world.openfoodfacts.org` ×2,
`fdc.nal.usda.gov`, plus the legal/support links). Fix the link, and add a
known-hosts allowlist to the generator so it cannot mint another.

---

## Action plan

### This week — Critical

1. **Delete `force-dynamic` from the three `[slug]` routes, add `revalidate = 3600`.**
   `app/cook/library/[slug]/page.tsx:39`, `app/blog/[slug]/page.tsx:20`,
   `app/[locale]/blog/[slug]/page.tsx:23`. Fixes the `<head>` blackout on 190 pages
   for Googlebot and every AI crawler, and restores HTTP caching on them. Verify with
   `curl -A "…Googlebot/2.1…"` and check `<title>` lands before `</head>`.
2. **Remove `aggregateRating` from all 99 Recipe blocks.** Do not substitute a value.
3. **Fix `<html lang>`** — serve the real locale from a locale-aware layout
   (`app/layout.tsx:62`).
4. **Add hreflang to the 13 blog index pages**, and `alternates` to the 91 blog posts
   in `app/sitemap.ts`.
5. **Add `images` to the `openGraph` object** in `app/about/page.tsx:12`,
   `accuracy/page.tsx:12`, `how-it-works/page.tsx:12`.
6. **Drop `maximum-scale=1`** from the viewport meta.
7. **Add the blog, `/accuracy`, `/how-it-works` and `/about` to `/llms.txt`.**
8. **Fix the dead `https://daysofar.app` link** in
   `/es/blog/calorias-de-mantenimiento-reales`, and allowlist the hosts the blog
   generator may link to.

### This month — High

9. Pin the fat-energy constant and re-generate or correct the 14 pages that say 7,000.
10. Visible byline + `Person` schema as `Article.author` on all 91 posts; add "Last
   updated"; add 1–2 outbound citations per post for the load-bearing numbers.
11. Real `lastmod` in `sitemap.ts`; drop `changefreq`/`priority`; wrap the two API
    awaits in try/catch.
12. Rewrite the 7 marketing titles and H1s to carry a query.
13. Trim the 83 over-length blog titles (drop the brand suffix where it overflows).
14. Truncate the 25 over-length recipe descriptions to ~155 characters.
15. Decide the recipe question: `noindex, follow` the 99 (recommended) or invest
    original content per page. Either way, restore the site footer on them and add one
    contextual link to `/blog/count-calories-homemade-food`.
16. Ship an `Article.image` + `og:image` for blog posts, and `og:image` for the 12
    locale homepages.
17. Fix the iOS dead-end CTA (notify-me), enlarge the 24px store badge, add a mobile
    nav toggle, and put a topic-tied CTA mid-article rather than only at the end.
18. Root-cause React #418 on the blog template.
19. `encode zstd br gzip` in Caddy; `poweredByHeader: false`; add CSP and
    Permissions-Policy; collapse the `http://www` double hop.
20. Link `/support` from the footer.
21. Add `BreadcrumbList` + a page `@type` to the 19 pages lacking them, and
    `CollectionPage`/`ItemList` to the 13 blog indexes (the `/cook/library` one is
    already correct — copy it).
22. Fill in the Recipe gaps that can be filled honestly: `datePublished`,
    `recipeCuisine`, `keywords`, `HowToStep`, and times only where the instructions
    state them.

### Next quarter — Medium

23. Build `/blog/how-to-count-calories` as the pillar and retrofit internal links.
24. Build `/myfitnesspal-alternative`, positioned on the published error rate.
25. Rewrite the homepage H2s around "a calorie tracker you talk to".
26. Surface `/accuracy` on the homepage and in blog CTAs instead of leaving it in
    boilerplate nav.
27. Bundle-analyse the homepage's 515 KB gzip / 28 chunks.
28. CDN in front of the now-cacheable pages.
29. Localise `/how-it-works`, `/accuracy`, `/about` into the 13 locales.
30. IndexNow ping on blog publish (nothing implements it today) — after `lastmod` is
    trustworthy.
31. Set up Search Console and a GOOGLE_API_KEY so the next audit has field data
    instead of lab estimates. Right now nobody knows what Google actually sees.

### Not worth doing

- Blocking CCBot or training crawlers (§15).
- A "best calorie apps" roundup on your own domain — that page type belongs to
  Forbes/Fortune-tier editorial.
- "Calories in X" ingredient pages — the per-ingredient data does not exist (§10).
- Splitting the sitemap for size — 223 URLs is 0.4% of the 50,000 cap.
- `speakable` schema; a standalone `Product` type for the subscription (`Offer` inside
  `SoftwareApplication` is already the right pattern).

---

## Unverified

- **Field data.** No CrUX, no Search Console, no GA4 — no API key configured. Actual
  LCP/INP/CLS and Lighthouse scores are unknown, and so is whether Google has indexed
  any of this yet. This is the single biggest blind spot in the audit.
- **Backlink data.** No Moz or Bing Webmaster key; Common Crawl could not be queried
  from here. The profile is assumed near-zero on the strength of the brand search
  returning nothing.
- Whether Google's renderer triggers the homepage's scroll-reveal blocks (§14).
- Whether the `/cook/library` index's `generateMetadata` awaits a network fetch —
  inferred from the identical pattern and the confirmed byte offsets, not read
  line-by-line.
- Annual subscription prices in `SoftwareApplication.offers` ($99.99 / $249.99) were
  not found in the static text — likely behind a client-rendered toggle, not a
  confirmed contradiction. Monthly ($9.99 / $24.99) matches the visible copy exactly.
- German and the other non-English locales were not read for translation quality; the
  Bulgarian spot-check was native-quality transcreation, not machine translation, with
  natural idiom and no calque tells.
- Whether the Play listing has enough reviews to show a public rating — if it does,
  wire it into `SoftwareApplication.aggregateRating` from the Play Developer API. If
  not, leave it out; the rich result stays dark, which is the honest outcome.

---

## What shipped — 2026-09-20

Verified against a production build (`pnpm build` in `apps/web`, then the standalone
server), requested with `Googlebot/2.1`. The dev server cannot be used to check any
of this: in development every route is dynamic and the metadata lands wherever the
compiler happens to flush it.

### Critical

| Fix | Verified by |
|---|---|
| `force-dynamic` → `revalidate = 3600` + empty `generateStaticParams` on the three `[slug]` routes | `<title>` now at byte 3,370 with `</head>` at 6,681 — inside the head, for Googlebot. Route manifest shows `●` for all three, with **zero** paths prerendered, so the build calls no API |
| The same change restores caching on those 190 pages | `private, no-cache, no-store` → `s-maxage=3600, stale-while-revalidate=31536000`. First request for an unseen slug `x-nextjs-cache: miss`, second `hit` |
| `aggregateRating` removed from all 99 Recipe blocks | `'aggregateRating' in page` → False. `recipe.rating` / `rating_count` are now deliberately unread |
| hreflang added to the 13 blog indexes | 14 `rel="alternate"` links on `/blog` and `/bg/blog`, where there were 0 |
| `og:image` on the pages that were dropping it | present on `/about`, `/accuracy`, `/how-it-works`, `/cook/library`, the 13 blog indexes and all 91 posts |
| `maximum-scale=1` removed | viewport is now `width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content` |
| `/llms.txt` now points at the content | Blog (with all 13 locale indexes), `/accuracy`, `/how-it-works`, `/about` added |

### High

- **Sitemap `lastmod` is real.** `new Date()` gone from every entry: hand-kept
  constants for copy that changes on deploy (`INDEXABLE_ROUTES[].updated`,
  `LIBRARY_UPDATED` in `lib/seo.ts`), `post.updated_at` per post, newest-of-set for
  each blog index. Five distinct values across the file, none of them a request time.
- **`changefreq` and `priority` dropped** — 0 of each in the output.
- **Post and blog-index hreflang in the sitemap.** `xhtml:link` count 182 → 194 on
  the local data set; clusters rebuilt by grouping on `topic_id`, which
  `publicSitemap()` now returns.
- **One failing subsystem can no longer empty the other** — the two API calls in
  `sitemap.ts` are settled independently with their own `.catch`.
- **Titles.** `withBrand()` adds ` — Day So Far` only when the whole thing still fits
  in 60 characters, so the 83 over-length blog titles keep their own last words. The
  marketing pages carry a query instead of a category noun: `Who builds Day So Far`,
  `How accurate is AI calorie counting? The measured error`, `How Day So Far counts
  calories from a sentence`, `Recipes with calories and macros per serving`, `Help
  with billing, refunds and your account`.
- **Blog index titles are no longer 12-way duplicates.** New `blog.indexTitle` key in
  all 13 catalogues, taken from each locale's own existing description vocabulary:
  `Calories and portions`, `Калории и порции`, `Kalorien und Portionen`, and so on.
- **Descriptions clamped** to 155 characters at a word boundary (`clampDescription`),
  which is what the 25 over-length recipe summaries needed.
- **`documentSchema`** adds a page `@type` (`AboutPage` / `ContactPage` / `WebPage`),
  `dateModified` and a `BreadcrumbList` to the six document pages that had none.
- **`CollectionPage` + `ItemList`** on the 13 blog indexes, mirroring `/cook/library`.
- **The 99 recipes are no longer near-orphans.** An anonymous reader now gets links to
  `/cook/library`, `/blog`, `/how-it-works` and `/accuracy`: 2 links per page → 6.
- **`/support` is linked** from the `PublicShell` footer and the `LegalPage` footer.
- **The store link is a 40px tap target** rather than 24px.
- **`poweredByHeader: false`.**
- **The blog generator can no longer mint either bug it shipped.** `SYSTEM_PROMPT` in
  `apps/api/src/ai/content.ts` gains a FIXED NUMBERS section pinning fat at 7,700
  kcal/kg (the value `KCAL_PER_KG` uses) and a LINKS section allowlisting
  daysofar.com's real paths — the Spanish post's `https://daysofar.app` was the model
  inventing an address from the product's name.

### Not done, and why

- **The 14 index pages** (`/blog`, the 12 `/{locale}/blog`, `/cook/library`) keep
  `force-dynamic` and stay uncacheable. The `generateStaticParams` trick needs a
  dynamic segment; these have none, so `revalidate` there would prerender them at
  build time in a container with no API — the original bug. 204 uncacheable pages
  down to 14.
- **`<html lang>`** is still `en` on all 223. Next allows one root layout and it
  cannot see the route's locale; fixing it properly means splitting `app/` into route
  groups with two root layouts, which is a large move for a signal Google says it
  does not read (it uses visible content and hreflang). The pre-paint script already
  corrects it for real browsers, so screen readers get the right value too.
- **The 7,000 kcal/kg on 14 published pages** is data in the production database. The
  generator is fixed; the existing rows need a content edit, which is yours to make.
- **The dead `https://daysofar.app` link** is likewise one row in `content_posts`.
- **Per-post images** — the 91 posts now share the sitewide card, which is better than
  no card. A real `Article.image` needs an asset pipeline.
- **H1s** are untouched. `Accuracy`, `About`, `Recipes` waste the strongest on-page
  signal, but they are the visible design of a site with a deliberate voice, and
  rewriting them is your call rather than mine.
- **brotli/zstd, CSP and `Permissions-Policy`** live in the Caddyfile on the box
  (`/srv/site_maker_prod/caddy/Caddyfile`), not in this repo. `encode zstd br gzip`
  is the one-line win; zstd already works and is 11.6% smaller than gzip.
- **React #418** on the blog template is unreproduced and unfixed.
- **The iOS dead-end CTA** needs a notify-me mechanism, which is product work.

---

# Appendix — the 2026-09-12 audit (superseded)


> **Status:** the five Critical items were implemented on 2026-09-12 and are
> verified in a production build. See "What shipped" at the foot of this
> document. The findings below describe the site *as audited*, before the fix.

Audited 2026-09-12. Next.js 15.1.6 App Router, `output: 'standalone'`, self-hosted
behind Caddy at 204.168.249.73.

**SEO Health Score: 24 / 100.**

| Category | Weight | Score |
|---|---|---|
| Technical SEO | 22% | 20 |
| Content quality | 23% | 34 |
| On-page SEO | 20% | 15 |
| Schema / structured data | 10% | 0 |
| Performance (CWV) | 10% | 55 |
| AI search readiness | 10% | 10 |
| Images | 5% | 45 |

The site is not penalised, mis-configured or slow. It is *absent*. Every URL
returns an empty document, there is no `robots.txt`, no `sitemap.xml`, no
canonical tag, and no structured data anywhere. `site:daysofar.com` returns
nothing.

---

## 1. The one line that blanks the whole site

`apps/web/components/AuthGate.tsx:228`

```ts
if (loading || strandedSession) return null;
if (!status?.authenticated && !isPublic) return null;
```

`loading` initialises to `true` and only flips inside a `useEffect`, which never
runs on the server. So during SSR `AuthGate` returns `null`, and because it wraps
`{children}` in `app/layout.tsx`, **every page in the app renders to nothing.**

Measured consequence — the served HTML of every URL:

| URL | HTTP | `<body>` markup | Visible words |
|---|---|---|---|
| `/` | 200 | 382 chars | **0** |
| `/privacy` | 200 | 382 chars | **0** |
| `/terms` | 200 | 382 chars | **0** |
| `/support` | 200 | 382 chars | **0** |
| `/cook/library/2-step-chicken` | 200 | 382 chars | **0** |

Only `<title>` and `<meta description>` survive.

(An earlier draft of this document blamed the client-side `useT()` i18n hook for
this as well. That was wrong: `Landing.tsx` and all three document pages carry
hardcoded English and are perfectly renderable on the server. `AuthGate` was the
only cause.)

A headless Chrome render of `/` recovers **1,285 words** and the `<h1>` *"Just say
what you ate."* So Googlebot's second-wave render does eventually see the page.
Nothing else does: Bingbot, GPTBot, ClaudeBot, PerplexityBot, CCBot,
Google-Extended, and every social unfurl bot (Slack, Discord, WhatsApp, LinkedIn)
get a title and a 38-word tagline.

**Fix.** Do not simply delete the early return — it exists to stop a frame of
someone's journal flashing. Render public routes server-side and gate only the
authenticated shell:

- `/`, `/privacy`, `/terms`, `/support`, `/cook/library/*` should render their
  content regardless of auth state; `AuthGate` should return `null` only for
  routes that actually require a session.
- `app/page.tsx` is `'use client'`. Split it: a server `page.tsx` that renders
  `<Landing />` for anonymous visitors, with the journal branch behind a client
  child.
- No i18n work is needed. The landing page and the three documents are
  hardcoded English; nothing on the public side of the site goes through
  `useT()`.

Everything else in this document is worth less than this one fix.

---

## 2. Critical

### `www.daysofar.com` is a dead hostname

```
daysofar.com      A  204.168.249.73          (Caddy, direct)
www.daysofar.com  A  172.67.212.102, 104.21.69.194   (Cloudflare)

https://www.daysofar.com/  ->  525   Cloudflare cannot TLS-handshake the origin
http://www.daysofar.com/   ->  403
http://daysofar.com/       ->  308 -> https://daysofar.com/   (correct)
```

Anyone who types or links `www.` gets an error page. Either drop the `www` DNS
record, or point it at the same origin and let Caddy 308 it to the apex.

### No `robots.txt`, no `sitemap.xml`, no canonical

All 404 (served as the app's HTML 404 page). There is no `app/robots.ts` and no
`app/sitemap.ts` anywhere in `apps/web`. No page emits `<link rel="canonical">`.

### Unbounded crawlable URL space

- `/cook/library/<any-string>` → **200**. The client does look the slug up and
  sets a `missing` flag, but the HTTP status was already sent. Genuine soft-404.
- `/c/<any-string>` → **200**. No lookup at all by design (client-side formatting
  only), so any string is a valid page.

With no `robots.txt` and no sitemap to bound it, that is infinite crawl space.

---

## 3. High

### 99 recipe pages are live and completely wasted

`/cook/library/<slug>` — all 99 return 200, all have images, ingredients, steps,
portions and full macros. Every one of them serves `<title>Day So Far</title>`,
no description, no OG tags, no content, no `Recipe` schema.

This is the single largest organic opportunity on the site: real, unique,
nutrition-bearing content of exactly the type Google still gives rich results to.

### Duplicate metadata across 12+ routes

`/today`, `/history`, `/progress`, `/achievements`, `/exercise`, `/cook`, `/plan`,
`/setup`, `/admin`, `/coach`, `/login`, `/verify`, `/reset`, `/unsubscribe` all
share the identical generic title and description. Only `/privacy`, `/terms` and
`/support` have their own.

22 of 25 `page.tsx` files are `'use client'`, so they cannot export `metadata` at
all.

### `/admin` is publicly crawlable

200, no `noindex`, no HTTP-layer auth redirect.

### The landing page targets no query

Every heading is brand voice, none is query-shaped. Zero occurrences anywhere in
`Landing.tsx` of: `calorie tracker`, `calorie counter`, `count calories`,
`track calories`, `food diary`, `food journal`, `nutrition tracker`,
`weight loss`, `macro tracker`, `AI calorie`.

It converts a visitor who already arrived. It cannot acquire one.

Plausibly winnable, because the mechanic is genuinely differentiated:
"AI calorie counter from text", "calorie tracker you talk to",
"adaptive calorie target" / "TDEE recalibration app",
"calorie tracker without barcodes", "MyFitnessPal alternative no ads".

---

## 4. Core Web Vitals

Lighthouse 13, real Chrome, 2026-09-12. **No CrUX field data** — the PSI API
returned `429 rateLimitExceeded` on the keyless quota, so whether the origin has
a field record at all is unconfirmed.

| Page | Device | Perf | LCP | TBT (INP proxy) | CLS | FCP | TTFB |
|---|---|---|---|---|---|---|---|
| `/` | Mobile | 79 | **4101 ms FAIL** | 77 ms | 0 | 1708 ms | 103 ms |
| `/` | Desktop | 100 | 782 ms | 0 ms | 0 | 302 ms | 68 ms |
| `/privacy` | Mobile | 85 | **3914 ms FAIL** | 60 ms | 0 | 1515 ms | 74 ms |
| `/privacy` | Desktop | 100 | 636 ms | 0 ms | 0 | 253 ms | 74 ms |

TTFB is excellent (68–103 ms). The entire mobile LCP failure is client JS: on a
throttled mid-tier phone the page is **blank white for ~4.0 seconds** before
anything paints. Same root cause as §1.

Payload: 583.8 KB over 32 requests — 464.4 KB of script across 24 files. Largest
chunk `1816-d287….js` at 177.6 KB transferred / 581.7 KB raw, 17.6% unused, ~1027 ms
of scripting time on throttled mobile. Fonts are fine in practice (3 woff2,
93.3 KB) though the `next/font` config declares 9 weights where 3–4 would do.

`cache-control: s-maxage=31536000` + `x-nextjs-cache: HIT` means the *empty shell*
is being served from a one-year edge cache. Fast delivery of nothing.

---

## 5. Structured data — none, anywhere

Zero JSON-LD, microdata or RDFa on any route. Priority order:

1. **`Recipe` + `NutritionInformation`** on `/cook/library/[slug]` — 99 pages,
   real data, best-supported rich result. Requires the server split (below).
2. **`Organization` + `WebSite`** in `app/layout.tsx` — already a server
   component, zero refactor.
3. **`BreadcrumbList`** on recipe pages — rides the same refactor as #1.
4. **`SoftwareApplication`** on `/` — pricing is confirmed and consistent across
   `SUBSCRIPTIONS.md`, `plans.ts` and `Landing.tsx` (Free $0; Plus $9.99/mo or
   $99.99/yr; Coach $24.99/mo or $249.99/yr).
5. **`FAQPage`** — Info only. Google restricted FAQ rich results to government
   and healthcare in Aug 2023; value here is AI/LLM citation, nothing else.

Two blockers found for the `Recipe` block:

- `aggregateRating` needs both value and count. The DB has `rating_count`
  (migration 012, and `apps/api/data/library-recipes.json`), but `toRecipe()` in
  `apps/api/src/services/library.ts` never copies it out and `LibraryRecipe` in
  `packages/shared/src/index.ts` has no such field. Backend change needed first.
  Do not ship a fabricated rating.
- `getLibraryRecipe(userId, slug, …)` requires a session to compute
  `saved`/`have`/`missing`/`fits_today`. A crawlable server-rendered page has no
  session — needs an anonymous accessor that reads `library_recipes` by slug with
  no user join.

`SearchAction` is **not** applicable: there is no URL-addressable site search,
only client-side filtering inside the authenticated `/cook` UI.

---

## 6. AI search readiness

A `GPTBot/1.2` fetch returns byte-identical HTML to a browser fetch — no cloaking,
so there is no server-side shortcut. Total extractable copy: **~40 words**, all
meta boilerplate.

Brand presence, all confirmed absent: Wikipedia, Product Hunt, Reddit, YouTube,
LinkedIn. Google Play **is** live and indexed as "Day So Far: Calorie Counter"
with proper `SoftwareApplication` JSON-LD (developer: FornaxElit). The App Store
returns nothing from the iTunes Search API in any country — expected, the listing
is still in review (`StoreLinks.tsx` has `href: null`).

Zero YouTube mentions matters more than it looks: YouTube presence is the
strongest known correlate with AI-engine citation. A roundup video literally
titled "The 3 Best AI Calorie Tracking Apps" (Aug 2025) does not mention it.

**Name ambiguity is a real problem.** "Day So Far" is a common English phrase and
an existing BI/reporting term, and there is an unrelated 2026 Bandcamp album by
the same name. Bare-brand queries surface Dayforce, Daystar, "dayful", an Oracle
Commerce field, and an openHAB variable. Entity disambiguation via structured data
and consistent "Day So Far — calorie tracker app" phrasing is not optional.

Live AI-answer testing for the target queries was **not run** — no query tool
available this session. Competitors that do surface for adjacent queries:
MyFitnessPal, Cronometer, MyNetDiary.

---

## 7. E-E-A-T — health-adjacent, and thin

Weighted ~37/100. Trustworthiness is genuinely strong (75): named GDPR controller,
vendor-by-name privacy policy, explicit retention and deletion, a real support
inbox, and a good medical disclaimer in Terms §2 including an eating-disorder
helpline. Expertise (15) and Authoritativeness (10) are near zero.

Missing:

- No public About or founder page. Nikolay Lyutov appears only as the GDPR
  controller in legal boilerplate.
- No methodology page. The actual explanation — *"A language model reads what you
  wrote, decides what you probably meant, and looks the nutrition up"* — exists
  only in `terms/page.tsx` clause 3, framed as liability, not as trust content.
- No accuracy disclosure. An LLM-estimated calorie count is the whole product and
  there is no published error margin anywhere.
- Numeric health guidelines shown with no cited source: fiber 31 g, sodium
  2300 mg, saturated fat 24 g, sugar 55 g. These look like DRI/AHA/WHO values but
  nothing says so. Same for the 7,700 kcal/kg conversion in the adaptive-target
  math.
- The medical disclaimer is three clicks deep and not linked from the footer.
- `content/` and `CONTENT_ENGINE.md` are a **social-video** pipeline
  (TikTok/Reels via ComfyUI), not a web-content pipeline. There is no `/blog`
  route and no CMS. Good long-form drafts in `content/copy/posts.md` are being
  written for Reels and never published anywhere indexable.

---

## 8. Everything else

**Security headers.** Present: HSTS (preload), X-Content-Type-Options,
X-Frame-Options SAMEORIGIN, Referrer-Policy strict-origin-when-cross-origin.
Missing: CSP, Permissions-Policy, COOP, CORP. All of these come from Caddy —
`next.config.ts` has no `headers()`.

**Viewport.** `maximumScale: 1` in `app/layout.tsx` disables pinch-to-zoom — a
WCAG 2.1 SC 1.4.4 failure that Lighthouse flags. The comment justifies it as
stopping iOS auto-zoom on input focus; the correct fix for that is `font-size:
16px` on focusable inputs, not disabling zoom globally.

**hreflang.** 13 locales (en, bg, de, es, fr, ro, uk, sr, hr, cs, hu, el, sk) all
switch client-side via `localStorage`. There are no localized URLs, so there is
nothing to mark up — hreflang is moot until locale is in the URL. `<html lang>` is
hardcoded `en` server-side and rewritten by an inline script, so every crawler
sees English.

**IndexNow.** Not implemented, and nothing to key off until a sitemap exists.

**OG / social.** The one genuinely good part. Complete OG and Twitter cards,
valid 1200×630 image (42 KB, 200 OK), icons and apple-touch-icon all present.
OG title *"Day So Far — just say what you ate"* is better than the `<title>`,
which is bare "Day So Far".

---

## Action plan

### Critical — this week

1. **Server-render public routes.** Fix `AuthGate` so `/`, `/privacy`, `/terms`,
   `/support` and `/cook/library/*` render without a session. Split
   `app/page.tsx` into a server component + client journal branch. Give the
   default-locale copy a server-readable path. *Nothing else matters until this
   ships.*
2. **Fix or remove `www`.** It currently 525s.
3. **Add `app/robots.ts` and `app/sitemap.ts`.**
4. **Add canonicals**, at minimum on `/`, the three legal pages, and the 99
   recipe pages.
5. **`noindex` the app routes.** Simplest path given 22 client pages is a
   `middleware.ts` setting `X-Robots-Tag: noindex, nofollow` on `/today`,
   `/history`, `/progress`, `/achievements`, `/exercise`, `/cook`,
   `/cook/recipe/*`, `/plan`, `/setup`, `/admin`, `/coach`, `/login`, `/verify`,
   `/reset`, `/unsubscribe`, `/c/*` — deliberately excluding `/cook/library/*`.

### High — this month

6. **Ship the recipe library properly.** Server-split
   `app/cook/library/[slug]/page.tsx` for `generateMetadata`, add `Recipe` +
   `NutritionInformation` + `BreadcrumbList`, build a `/cook/library` index page
   (there isn't one), list all 99 in the sitemap, and make a bad slug return a
   real 404 via `notFound()`. Add the `rating_count` passthrough so
   `aggregateRating` becomes possible.
7. **Fix the homepage `<title>`.** "Day So Far" → something carrying the head
   term. The OG title is already better.
8. **`Organization` + `WebSite` schema** in `layout.tsx`. Ten minutes, no
   refactor.
9. **Publish `llms.txt`.**
10. **Trim the 1816 chunk** (177.6 KB, 17.6% unused) behind `next/dynamic` —
    zxing/barcode and icon sets do not belong on first paint.

### Medium — next quarter

11. **About / founder page**, publicly naming the person behind it.
12. **Methodology + accuracy page** — how a sentence becomes a calorie count, with
    worked examples and a stated error margin. Best AI-citation asset available.
13. **Cite the health numbers** (sodium, fiber, saturated fat, sugar, 7,700
    kcal/kg) and link the medical disclaimer from the footer.
14. **Stand up a blog.** The drafts already exist in `content/copy/posts.md` and
    are being spent entirely on video.
15. **Comparison pages** — vs MyFitnessPal, vs Cronometer, vs Cal AI. Real
    differentiators exist to substantiate them.
16. **Public coach landing page.** "For coaches" currently goes straight to
    `/login?coach=1` — a shipped feature with no public page.
17. **Split `/support` into indexable help articles.** It is already the
    best-structured, most quotable content on the site.
18. Restore pinch-to-zoom; add CSP and Permissions-Policy.

### Not worth doing yet

- hreflang — needs localized URLs first.
- IndexNow — needs a sitemap first.
- `FAQPage` schema — no Google rich-result value for a commercial site since
  Aug 2023.
- `SearchAction` — no public search endpoint exists.
- `aggregateRating` on `SoftwareApplication` — no real Play rating is exposed to
  the web app; fabricating one risks a manual action.

---

## Unverified

- CrUX field data — PSI API quota exhausted, no key configured. Whether the origin
  has a field record is unknown.
- Live AI-answer visibility on ChatGPT / Perplexity / AI Overviews — no query tool
  available.
- Real INP — lab TBT used as proxy; needs field data or a scripted interaction
  test.
- AlternativeTo listing status.
- Caddy config (lives outside this repo).
- Whether `/cook/recipe/[id]` behaves like `/cook/library/[slug]`.

---

## What shipped — 2026-09-12

The five Critical items, implemented and verified against a production build
(`next build` + `next start`, port 3001).

### Code

| File | Change |
|---|---|
| `apps/web/lib/routes.ts` | `/support` folded into `LEGAL_ROUTES`; new `isPrerenderableRoute()` naming the four routes that may be drawn before the session resolves. |
| `apps/web/components/AuthGate.tsx` | The blanket `if (loading …) return null` now applies only to routes that are *not* prerenderable. Behaviour for every other route is unchanged. |
| `apps/web/app/page.tsx` | Now a server component declaring `alternates.canonical`. |
| `apps/web/components/Home.tsx` | New — the former client body of `app/page.tsx`. |
| `apps/web/app/{privacy,terms,support}/page.tsx` | `alternates.canonical` added. |
| `apps/web/lib/seo.ts` | New — `ORIGIN`, `INDEXABLE_ROUTES`, `isNoindexPath()`. One source of truth for robots, sitemap and middleware. |
| `apps/web/app/robots.ts` | New. |
| `apps/web/app/sitemap.ts` | New. |
| `apps/web/middleware.ts` | New — `X-Robots-Tag: noindex, nofollow` on everything outside the four public routes. |

### Measured before → after

Server-rendered HTML, no JavaScript executed:

| URL | Words before | Words after | H1 in HTML | Canonical |
|---|---|---|---|---|
| `/` | 0 | **1,305** | "Just say what you ate." | `https://daysofar.com` |
| `/privacy` | 0 | **2,170** | "Privacy Policy" | `https://daysofar.com/privacy` |
| `/terms` | 0 | **1,244** | "Terms of Service" | `https://daysofar.com/terms` |
| `/support` | 0 | **559** | "Support" | `https://daysofar.com/support` |

`/robots.txt` and `/sitemap.xml` now return `text/plain` and `application/xml`
respectively instead of a 17 KB HTML 404. All four public pages are still
statically prerendered (`○` in the build output), so none of this costs TTFB.

`X-Robots-Tag: noindex, nofollow` verified present on `/today`, `/admin`,
`/login`, `/c/*`, `/cook/library/*` and absent from the four public pages,
`/robots.txt`, `/sitemap.xml` and `/opengraph-image.png`.

`pnpm typecheck` clean; `node scripts/literals.cjs` clean; `pnpm build` clean.

### Two things the fix also repaired

- **`/support` was behind the login wall.** It was never in `LEGAL_ROUTES`, so
  `AuthGate` bounced anonymous visitors to `/login` — and Apple requires that URL
  on the listing and a reviewer opens it cold. It also got the app shell, which
  is a fixed-height box that does not scroll, rather than the document chrome the
  page is written for.
- **Nothing had a canonical.** Now the four public pages do.

### One accepted regression

`/` is drawn before the session is known, so a signed-in admin sees one paint of
the landing page before the journal replaces it. The audience is the handful of
accounts the web journal is still open to, and the page is statically prerendered
so the swap is a single round trip.

### Still outstanding — Critical #2, `www`

**Not a code change, and not a Caddy change.** The Caddyfile on the box
(`/srv/site_maker_prod/caddy/Caddyfile`, mounted into `project-maker-caddy-1`)
already has a correct block:

```
www.daysofar.com {
	import security_headers
	redir https://daysofar.com{uri} permanent
}
```

The record was un-proxied from Cloudflare on 2026-09-12, which removed the 525
but did not fix it, because `www` does not point at the origin at all. It is a
CNAME to Resend's click-tracking host:

```
www.daysofar.com  CNAME  links1.resend-dns.com
                       -> dnimfezcq57tg.cloudfront.net
                       -> 3.165.206.11/.17/.42/.114
```

CloudFront holds no certificate for that name, so https now fails the TLS
handshake outright and http still answers 403.

Resend's own API confirms what the record is and that nothing needs it:

| Record | Name | Status |
|---|---|---|
| DKIM (TXT) | `resend._domainkey` | verified |
| SPF (MX) | `send` | verified |
| SPF (TXT) | `send` | verified |
| Receiving (MX) | apex | verified |
| **Tracking (CNAME)** | **`www`** | **failed** |

`click_tracking` and `open_tracking` are both **false** on the domain, so the
tracking CNAME is doing nothing but breaking the website's `www`. Deleting it
cannot affect delivery — DKIM, SPF and receiving are separate records and all
verified.

**Fix, in Cloudflare DNS:**

1. Delete the `www` CNAME to `links1.resend-dns.com`.
2. Add `www` as an **A** record to `204.168.249.73`, **DNS only** (grey cloud),
   matching `daysofar.com` and `api.daysofar.com`.

Caddy then issues a certificate over HTTP-01 and the existing redirect starts
working. No deploy needed.

Resend will keep reporting the domain as `partially_failed` while the tracking
record is absent. That is cosmetic unless click tracking is ever wanted, and if
it is, it belongs on its own subdomain (`links.daysofar.com`) rather than on
`www` — Resend lets you choose the subdomain.

### Next, in order

Everything under "High" above, starting with the 99 recipe pages — they are the
only real content the site has, and they are still `noindex` because the page
fetches its recipe through a session-gated endpoint. Making them public is
backend work (an anonymous accessor), not frontend work.
