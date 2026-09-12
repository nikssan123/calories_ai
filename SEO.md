# SEO audit — daysofar.com

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
