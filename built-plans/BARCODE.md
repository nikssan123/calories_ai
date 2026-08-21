# Barcode scanning

Nothing here is built. This is the plan for reading a barcode off a packet and turning it
into a food entry, written down while the shape of the thing is still clear.

It assumes one decision has been made: **a scan produces a candidate, never a log.** A
barcode tells you what is in 100g of a product. It does not tell you how much of it
somebody ate, and the gap between those two is the whole feature — the same gap
`4469f34 feat(kitchen): say how much of it you actually ate` was about. Every phase below
keeps the lookup and the portion as two separate steps, because folding them together is
how a scanner ends up logging a whole 500g jar of peanut butter as one snack.

## The short version

Two independent halves. Decoding the barcode is a solved browser problem with one awkward
edge (Safari). Resolving it to nutrition is a data-sourcing question, and the answer is
free but uneven: Open Food Facts covers the EU well and the US patchily, USDA FoodData
Central covers the US branded shelf and nothing else.

Neither half is hard. What determines whether the feature feels good is the miss path —
what happens when the barcode is a supermarket own-brand nobody has catalogued. Most apps
dead-end there. This one already has a vision model that can read a nutrition panel off a
photo, so a miss becomes "snap the label instead" and stays inside a flow that works.

## Phase 1 — Lookup and cache

API only. No camera, no UI, and every test is real without touching the network.

### The migration

`apps/api/migrations/014_barcode.sql`. Two things happen in it.

A cache table, keyed by the barcode itself:

```sql
CREATE TABLE barcode_products (
  barcode        TEXT PRIMARY KEY,        -- normalised to GTIN-13
  found          BOOLEAN NOT NULL,
  brand          TEXT,
  name           TEXT,
  kcal_100g      NUMERIC(7,1),
  protein_100g   NUMERIC(6,1),
  carbs_100g     NUMERIC(6,1),
  fat_100g       NUMERIC(6,1),
  serving_g      NUMERIC(7,1),            -- null when the label does not say
  serving_desc   TEXT,                    -- "1 bar (45g)"
  source         TEXT NOT NULL CHECK (source IN ('off','fdc')),
  source_url     TEXT,
  fetched_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

`found` is what makes this a cache rather than a product table. A scan of something nobody
has catalogued is the most likely single outcome in a supermarket, and without a negative
row every one of those rescans hits Open Food Facts again. The two need different
lifetimes, though: a correct product effectively never changes, so ninety days is fine,
while "not found" has to expire inside a week or so because OFF gains products daily and a
permanent miss is a permanently broken scan.

Second, and easy to miss until the first insert fails — `food_entries.source` carries a
CHECK constraint that will reject a new value. Verified against the running dev database:

```
food_entries_source_check | CHECK (source = ANY (ARRAY['text','photo','quick','manual']))
```

So the migration drops that constraint and re-adds it with `'barcode'` included.

### The shared types

`packages/shared/src/index.ts`: add `'barcode'` to `ENTRY_SOURCES` (line 17) and add a
`BarcodeProduct` schema next to the other read shapes.

`ENTRY_SOURCES` is shared with `ExerciseEntry`, so this widens that type too, and the zod
enum will now accept a value `exercise_entries_source_check` would reject. Harmless —
nothing writes a barcode to an exercise row and nothing can — but it deserves a comment,
because the alternative is somebody discovering the mismatch later and "fixing" it by
splitting the enum in two.

### The service

`apps/api/src/services/barcode.ts` holds all of the provider knowledge, so that the routes,
the tool and the tests all see one normalised shape and none of them know which upstream
answered.

- `normaliseBarcode(raw)` — UPC-A comes off the scanner as 12 digits and zero-pads to
  GTIN-13, so that the same physical product is not two cache rows. Validate the check
  digit here, before any network call: a mis-scan is then a free local rejection rather
  than a round trip that returns nothing.
- `lookupBarcode(code)` — cache, then Open Food Facts, then USDA FDC when a key is
  configured. Out comes one per-100g shape regardless of which one answered.

`apps/api/src/env.ts` gains an optional `FDC_API_KEY` and a User-Agent string for OFF,
which asks for `AppName/Version (contact)` and throttles generic agents.

### The tests

`apps/api/test/barcode.test.ts`, with `vi.stubGlobal('fetch', ...)` over recorded payloads.
The cases that matter: a bad check digit never reaches the network, a cache hit does not
refetch, a negative row expires on its own shorter clock, a kJ-only product converts, and a
product with no usable macros is treated as a miss.

That last one is the important test. Open Food Facts rows are crowd-sourced and some of
them carry a name and nothing else. Logging that as a zero-calorie food is far worse than
finding nothing at all, because a miss sends the user to the label photo and a zero quietly
corrupts the day's total.

## Phase 2 — Routes and portion

```
GET  /barcode/:code       -> BarcodeProduct, or 404
POST /barcode/:code/log   -> { grams | servings, meal?, when? } -> createFoodEntry
```

The log route writes with `source: 'barcode'` and otherwise goes through `createFoodEntry`
unchanged, so history, corrections and the day summary need to know nothing about any of
this.

`apps/api/src/routes/limits.ts` gains a `BARCODE_BURST` sitting next to `RECIPE_BURST`, and
deliberately not a `planLimit`. Every other ceiling in that file guards either money or a
password. This one guards neither — a lookup costs nothing to serve and is usually a cache
read. The limit exists to be a polite Open Food Facts client and to stop a stuck scanner
from looping. Charging for it would be charging for something free.

**Since built:** the limiter's counters moved to Redis (`REDIS_URL`, added with the
scaling work — see SCALING.md). That matters more for this ceiling than for the others in
the file, because this is the only one whose subject is somebody else. The others are
promises to our own users, and a replica enforcing its own copy of a per-account ceiling
is merely wrong; politeness to a third party is a property of the whole deployment, so
in-process counters would have meant N replicas each granting thirty lookups a minute and
Open Food Facts seeing N times what the plan says it agreed to. One shared counter is the
only version of this limit that means anything from the outside.

Two consequences worth carrying. The cache was never the problem — `barcode_products` is
in Postgres and every replica already shares its hits, so the limiter was the only
per-process part of the politeness story. And the limiter **fails open**: if Redis is
unreachable the request is served unthrottled rather than refused, which is the right
trade for a ceiling guarding spending or a password, and the one place in this file where
it deserves a second thought — a Redis outage during a stuck-scanner loop is the case
where OFF, not the user, pays. The catalogue's own throttling is the backstop there, and
the `found` row means a repeated scan of one product stops reaching them at all.

Client methods go in `packages/api-client/src/index.ts` beside `scanFridge` (line 271).

## Phase 3 — The scanner

`apps/web/lib/barcode.ts`, sibling to `lib/image.ts` and for the same kind of reason: both
exist to turn a camera into something the API can use, and both hold numbers tuned to a
decoder rather than to any one screen.

`decodeBarcode(source)` uses `BarcodeDetector` where it exists and lazy-imports
`zxing-wasm` where it does not. That fallback is not an edge case — `BarcodeDetector` is
Chrome and Android; Safari on iOS does not have it, and on a food app that is not a
rounding error. The wasm build is around 300KB and only ever loads for the users who
actually need it.

`apps/web/components/BarcodeScanner.tsx` is a sheet over a live `<video>`, decoding frames
until one locks. Entry point is a third item in the dropdown `Composer.tsx` already has,
beside Camera and Photo Library, because a barcode is a way of describing a meal and
belongs where the other two are rather than in a tab of its own.

Then the card, which is where the portion gets resolved: **1 serving / 100g / custom
grams**, defaulting to the serving when `serving_g` came back and to 100g when it did not.

And the miss: *"Couldn't find it — snap the label instead"*, dropping into the photo flow
that already exists. This is the part worth building carefully. It is the difference
between a scanner that works on branded cereal and one that works in a real shop.

## Phase 4 — The agent tool

A `lookup_barcode` tool in `apps/api/src/ai/tools.ts`, beside `log_food` (line 213), so
that "about half this packet" resolves in conversation instead of against a slider.

Last on purpose. The card handles the common case with no model call and no waiting, and
this is the fallback for the portions a picker cannot express — not the primary path. Built
first, it would put a paid turn in front of every scan of a cereal box.

## Telling people about it

The landing page currently sells the opposite of this feature, in two strings, one of
which is also what unfurls when somebody pastes the link.

### Undoing the promise

`apps/web/app/layout.tsx:35` — the `DESCRIPTION` constant, which feeds the meta
description, the Open Graph card and the Twitter card from one place:

> Say what you ate. No forms, no food database, **no barcodes** — describe the meal in
> your own words and the day adds itself up.

`apps/web/components/landing/Landing.tsx:179` — the hero lede, saying it again with a
sharper edge: *"no barcode to hunt for"*.

The instinct is to delete both. It is the wrong instinct, because the claim underneath is
still true and it is still the good one. What the page is selling is not the absence of a
scanner — it is the absence of *hunting*: the search box, the forty results for "chicken
breast", the picking. A scanner that reads a packet in one motion is on the same side of
that argument. It is the search box it replaces, not the sentence.

So keep the shape — three refusals and a promise — and swap out the one clause you are
about to contradict:

> A calorie journal you talk to. No forms, no database to search, no forty results for
> "chicken breast" — describe the meal in your own words and the day adds itself up.

One edit in each file, and `DESCRIPTION` carries itself to all three social surfaces.

### A fourth way in

`ThreeWaysIn` (`Landing.tsx:230`) is a `WAYS` array of three under the headline *"Three
ways in. None of them is a form."*, laid out on `sm:grid-cols-3`. A scan is a fourth way
in, and it breaks both the headline and the grid.

The cheap option is to fold it into the camera card, which already says "the back of a
packet" (`Landing.tsx:221`) and is halfway there. Don't. Phase 3 puts the scanner in the
`Composer` dropdown as a peer of Camera and Photo Library, and something that is a peer
in the product should be a peer on the page; buried in the photo card it reads as a
footnote to a feature rather than a feature.

So: four cards, "Four ways in", `sm:grid-cols-2 lg:grid-cols-4`, and `ScanBarcode` from
lucide, which is already a dependency.

```tsx
{
  Icon: ScanBarcode,
  title: 'Or scan the packet',
  body: 'Point at the barcode and the label comes back. You say how much of it you ate — and if nobody has catalogued it, photograph the panel instead.',
}
```

That sentence is doing two jobs on purpose. It says the scan produces a candidate and not
a log, which is the decision the whole plan rests on, and it puts the miss path in the
shop window rather than in the FAQ.

### The band that is actually worth writing

Every calorie app has a scanner. None of them has a good answer for the own-brand oat
milk that nobody has ever catalogued, and that is most of a real trolley. The claim worth
making is the one from the top of this document: *"Couldn't find it — snap the label
instead."*

A band of its own, in the two-column shape `Corrections` and `WeeklyRead` already use —
prose left, card right. The card animates the miss: a barcode, then "Not in the
catalogue", then the label photo resolving into the same item row a hit would have
produced. The prose says plainly that a scanner is only as good as its worst case, and
that this one's worst case is a feature the app already had.

Place it after `ThreeWaysIn` and before `Corrections`. It is a story about getting food
in, so it belongs beside the other ways in.

And leave the hero alone. The headline is "Just say what you ate"; the scan is a
shortcut into that same conversation. Promote it to the top of the page and the product
becomes another tracker with a slightly better search box, which is a category it loses.

### Attribution, which is a licence question before it is a copy question

ODbL requires a visible "Data from Open Food Facts" wherever OFF data is shown. The
product card carries it (Phase 3). The landing page only inherits the obligation if its
demo card shows a real product — so invent one, the way `HeroDemo`, `Corrections` and
`WeeklyRead` already invent everything they display. Plausible numbers, no real GTIN, no
obligation, and nothing on the page that goes stale when a crowd-sourced row is edited.

### Sequencing

None of this ships before Phase 3. Phases 1 and 2 are a route nobody can reach from the
UI, and "scan the packet" on the landing page with no scanner in the composer is a
promise that arrives before the thing it promises. The copy change is part of Phase 3's
diff, not a follow-up to it.

### The other two surfaces

`README.md:723` still lists barcode scanning under "Not built (deliberately)". When it is
built it comes out of that list and gets a section, the way weekly reviews and adaptive
targets did.

`StoreLinks` (`StoreLinks.tsx:16`) has `href: null` on both stores. Whenever those
listings do exist, "barcode scanner" is one of the highest-volume queries in the stores'
nutrition category and belongs in the subtitle and the keyword field — even though it has
no business in the hero headline. Different surfaces, different jobs: a store listing is
answering a search, the landing page is making an argument.

## What will bite

**Open Food Facts energy fields are inconsistent.** `energy-kcal_100g` is frequently absent
with only `energy_100g` in kJ. Needs the `/4.184` fallback, and a product with neither has
to fail closed — see the zero-calorie note above.

**Coverage is uneven.** OFF is excellent in the EU, patchier for the US and for supermarket
own-brands anywhere. FDC's branded set answers the US half. Both are free; the service seam
takes either or both.

**ODbL attribution.** The OFF licence requires it. The product card needs a visible "Data
from Open Food Facts", which is also honest about where a wrong number came from.

**iOS Safari `getUserMedia`** wants HTTPS and a user gesture, and has a history of being
awkward in standalone PWA mode. If Phase 3 fights, the still-photo decode path is the
fallback that always works: the user photographs the barcode and it decodes from the
bitmap, no camera stream involved.

**Decode before re-encode.** On any path that goes through a photo, decode from the
full-resolution bitmap. `preparePhoto` in `lib/image.ts:38` re-encodes at JPEG q0.82, and
thin parallel bars are precisely what those artifacts eat first.

## Decisions still open

**Live scanner, or photo-still?** The still path is a couple of hours and reuses everything;
the live one is about a day. Live, though — a scanner you have to frame twice does not get
used a third time.

**OFF only, or OFF and FDC?** OFF alone is right for an EU userbase. Add FDC before any US
push. The service seam in Phase 1 takes both either way, so this is reversible and does not
need answering now.
