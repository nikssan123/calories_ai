# Web Glow-Up

`GLOW-UP.md` said it plainly and then we did not do it: *"The tokens are ported
from `apps/web/app/globals.css`. Retheme both places together, or the app and
the site will drift apart."* The app was rethemed on 2026-09-04 and the site was
not, so for a fortnight the landing page has been advertising the app we used to
have. The hero demo is built out of the app's own components precisely so it
cannot lie about the product — and because the components it is built from are
the *web's*, it has been telling the truth about the wrong app.

So this is not a landing-page job. The site looks old because the web app looks
old, and the demo is only where it shows.

## The direction, in one line

Depth stops being an edge and becomes light. The 2px tan outline and the solid
brown ledge under every surface go; what replaces them is a long warm shadow
held inside the surface's own footprint, a one-pixel lit edge along its top, and
fills that are a tint of the ink rather than a second colour of card.

## Where the spec lives

`apps/mobile` is the reference implementation, and it was written to be read
back this way — every glow-up value in `apps/mobile/theme/colors.ts` carries a
comment saying it has no twin in `globals.css` yet and is the value to port.
Four files are the whole specification:

| What | Mobile | Web
| --- | --- | ---
| Palette | `theme/colors.ts` | `app/globals.css` `:root` / `.dark`
| The lit surface | `components/Chunk.tsx` (`light()`) | `@utility chunk`
| Glass, fields, wells, chips | `components/Glass.tsx`, `components/Field.tsx` | new utilities
| Serif type | `theme/typography.ts` | `@theme inline` + `app/layout.tsx`
| The sky | `theme/sky.ts` | new `lib/sky.ts`

Nothing here is a fresh design decision. Anywhere the two could disagree, the
app is right — it is the thing in the stores and in the screenshots.

## Stages

1. **Tokens and utilities.** `--glass`, `--glass-strong`, `--glass-edge`,
   `--hairline`, `--shadow`, `--ambient`, `--sky-ink`, `--primary-ramp`.
   `--secondary`, `--muted` and `--accent` become wells — a faint tint of ink
   rather than opaque beige — with `--muted-wash` and `--muted-field` keeping
   the old tan for the two places that were `bg-muted/40` and `/60`. `chunk`,
   `chunk-sm` and `chunk-press` keep their API and their 160 call sites, and
   change underneath from a ledge to light, exactly as `Chunk.tsx` did.

2. **Type.** Fraunces for Latin and Literata for Cyrillic and Greek, loaded the
   way the display face already is, with the same `:lang()` swap.
   `text-large-title`, `text-title-2`, `text-section-title` and `text-display`
   move to the serif at regular weight. Figures stay in Baloo — that is the
   whole point of the split.

3. **The mechanical sweep.** `bg-muted/40|50|60` to the two new tokens;
   `border-2` on surfaces down to a hairline; the shadcn primitives (button,
   card, input, textarea, select, dialog, tabs, badge, switch, toggle).

4. **The app's own surfaces.** Journal, ChatCard, Composer, DayRail, Sidebar,
   InsetGroup, MacroBars as lit capsules, and the sky header on Today.

5. **The landing.** Which by then has mostly happened: the hero demo is the
   app's components, so it moves when they do. What is left is the headlines
   and the ambient wash behind the sections.

## What landed

All five stages, in one pass on 2026-09-20.

- **Tokens.** `--glass`, `--glass-strong`, `--glass-edge`, `--hairline`,
  `--shadow`, `--ambient`, `--sky-ink`, `--primary-ramp`, plus `--chunk-glow`
  and `--glow-primary` — the shadow tints, spelled with their alpha baked in
  because `color-mix(…, transparent N%)` is premultiplied and would only make a
  colour that already carries one fainter. `--secondary`, `--muted` and
  `--accent` became wells; `--muted-wash` and `--muted-field` keep the old tan
  for the two fills that were never a tint of the ink.
- **Utilities.** `chunk`, `chunk-sm` and `chunk-press` kept their API and
  changed underneath, so none of their call sites moved. `chunk-slot` is inert.
  New: `glass`, `glass-strong`, `field`, `well`, `ambient`, `bubble-sent` and
  `glow-button`. Each sets a fill and a shadow and leaves the border to the call
  site, so `focus:border-ring` is never fighting a shorthand.
- **Type.** Fraunces and Literata, with the `:lang()` swap — Greek included,
  which the display face's swap deliberately omits because neither rounded face
  can draw it and Literata can. `text-large-title`, `text-title-2`,
  `text-display` and `text-section-title` are serif at 400; `text-hero`,
  `text-greeting`, `text-serif-title` and `text-serif-italic` are new. Figures
  stay in Baloo, and the Cyrillic weight bump now applies to figures alone.
- **The sweep.** 122 `border-2` down to a hairline, 180 `border-border` to
  `border-hairline`, 53 `bg-muted/40|50|60` to the two new tokens, and every
  hand-written ledge — the popovers, the hero demo's frame, the switch's knob —
  to light.
- **Icons.** `components/icons/Glossy.tsx` is the app's file with the
  react-native-svg elements lowercased; the paths, ramps and viewBox are
  unchanged. Fifteen section titles across thirteen catalogues lost the emoji
  they carried inside the translated string, and `<InsetGroup>` grew an `icon`
  slot to take the drawing instead. `workouts.logTitle`, `plan.howToTitle` and
  `shopping.title` keep their emoji, because the app kept theirs.
- **The sky.** `lib/sky.ts` is `theme/sky.ts` minus `sceneSkyAt` — there are no
  illustrated scenes here — and `<Sky>` and `<Haze>` are split, because the band
  is pinned to the top of the page and the light belongs to the ring, which is
  centred on a phone and in the left column on a wide screen.

Not done, and deliberately: the greeting. Today still opens with the date in a
glass pill rather than "Good *afternoon*, Nik", because that is a change to what
the page says and not to how it looks.

## Rules

- **Never set type in a fill.** Unchanged from `globals.css` rule 2, and the
  reason `--calories-text` and friends exist. The glow-up does not touch it.
- **A field still looks like a field.** `--border` and `--input` stay; the
  hairline is for dividers *inside* a surface, not for the edge of a control
  somebody has to find and type into.
- **Going over target is still not an alarm.** Rule 4 is untouched.
- **One definition per thing.** If the app and the site both draw it, it is a
  token or a utility, not two hand-tuned values.
