# Ad script — BG — "Картофите бяха малка порция"

Written 2026-09-21. The Sofia cut of `ad-fr.md`, same fifteen seconds and same
claim, built by `scripts/content/ad.mts --locale bg`.

**Read ADS.md §1 before this gets a budget.** Bulgaria's campaign ran from
2026-09-13 and was paused: €13.01 for 22 installs at €0.59 each, CTR 8.5% — and
on 2026-09-14 its **fourteen installs made zero accounts**. The founder's read
in that document is that Bulgaria is unlikely to pay, and that the budget goes
to Germany and France. Nothing here argues with that. A better ad does not fix
a funnel that loses everybody between install and account, and §7's own gate
says to stop when 20+ installs make no accounts. **This exists so the asset is
ready if BG is reopened — check the Funnel tab first.**

The tagline is not written for this ad. It is `captions[1]` of the published
`store/listings/bg.json`, word for word:

> **Промени ли решението си?** — Кажи го — записаното хранене се обновява.

---

## 0. The voice, and why Bulgarian gets its own section

`apps/api/src/ai/prompt.ts` carries an analysis of 159 real Bulgarian replies
(2026-09-03), and it exists because three rules written in English turned out to
be rules *about* English. Every line below is checked against it:

| Trap | What production actually did | What this script does |
|---|---|---|
| Status-word opener | **33%** opened with one, and none was on the English ban list: `Записах` (13), `Готово` (10), `Поправено` (4), `Сложих` (3) | Neither reply opens with a verb of recording |
| Closing remainder | **43%** carried one — "остават ти 884 kcal и 64g протеин за деня" | Said once, in words, only where it changes what they do next |
| Grading the plate | **17%** graded the food, 13% opened with the grade — "Хубава вечеря", "Солиден протеин" | No adjective whose subject is the meal |
| Officialese | Terse English shapes land as form-speak — "Both in" became "Вечерята е вкарана", *dinner has been inserted* | Full, ordinary sentences; warmth outranks brevity |

> **The published listing breaks three of these.** `shots.replyLog` in
> `store/listings/bg.json` is *"**Записах** вечерята — 715 kcal, 59g протеин.
> Денят ти е на 2065 от 2200, **остават 135**…"* — the exact status-word opener
> `prompt.ts` names first, plus a closing remainder. `shots.replyCorrection`
> opens "Оправено —". That copy predates the voice rules. The ad follows
> `prompt.ts`, not the screenshots.

---

## 1. The capture — two turns

Free is a guest day of **4 messages**, then a 3-day trial of **9**
(`plans.ts`), so a four-turn demo is a depiction of the entire free allowance.

### Turn 1 — the lunch

```
кюфтета с пържени картофи и една бира на обяд
```

> Кюфтета с пържени картофи и бира — сметнах картофите за средна порция.
> За вечерята остава по-малко от обикновено.

Opens with the food. States the **assumption**, which `prompt.ts` sanctions and
which is the thing turn 2 corrects. The remainder is in its allowed form — where
the day stands, in words, not a figure read back.

**Why kyufte.** `COMPETITION.md` picks home-cooked, non-English food as the
wedge precisely because a barcode database is weak there, and names kyufte. A
Sofia office lunch that no American chain database has a row for is the argument
the ad is making, in one sentence.

### Turn 2 — the correction. This is the ad.

```
картофите бяха малка порция
```

> Малка порция, значи. Така за вечерята остава доста повече.

No `Оправено`, no `Готово`, no restatement, no arithmetic in the prose. The card
redraws from **~950** to **~820** and the header ring walks 650 → 780 остават.

---

## 2. The cut — 15s, 9:16

| t | Shot | On screen |
|---|---|---|
| 0.0–2.6 | Sofia café table; her hand lifts the dark Android phone toward her. No face. | **Преядох на обяд.** |
| 2.6–4.4 | Composer types turn 1 | — |
| 4.4–7.2 | Send. Cast hop into the reply row, card lands at ~950, Plum flies onto it and sparks the ring | — |
| 7.2–11.6 | **The correction.** Card redraws to ~820, ring to 780 | — |
| 11.6–13.6 | Walking away down a Sofia street. No face. | **Промени ли решението си?** / Кажи го — записаното хранене се обновява. |
| 13.6–15.0 | End card | Day So Far · Брояч на калории · в Google Play |

### Type

**Literata, not Fraunces.** `apps/mobile/theme/typography.ts` swaps the serif by
script because Fraunces has no Cyrillic — a BG cut set in it falls back per
glyph to a system serif on the largest words in the film. The bundled
`Nunito_*.woff2` in `apps/mobile/assets/` are **Latin-subset too**, so body text
comes from the full Nunito TTFs rather than the repo's web copies. Both live in
`content/fonts/`; `ad.mts`'s header says how to fetch them.

### Macro initials localise

`36П 58В 38М`, not `36P 58G 38L` — `macro.{protein,carbs,fat}Initial` in
`apps/mobile/messages/bg.ts`.

---

## 3. The B-roll, and the trap in it

Modern, sophisticated Sofia professionals: the same woman in a tailored camel
wool coat in both shots — at an empty design café, then on the cobblestones
with other people in business coats behind. **No folk costume, no embroidery, no heritage
styling** — this is the business capital.

**That nearly went wrong twice, and the reason generalises.** The first two
passes put a background figure in full national dress with a red headscarf into
the café, *despite* "folk costume, traditional embroidery, headscarf" being in
the prompt's avoid-list. The cause:

> **Z-Image Turbo is DMD-distilled with CFG baked in, so there is no negative
> channel. Every token in the prompt is positive conditioning, and an
> "Avoid: folk costume, headscarf, user interface" list summons all three.**

The fix is to describe absence as presence — *an empty room, bare chairs pushed
in at clean vacant tables, a phone held with its switched-off screen toward
her* — and to put no avoid-list in the prompt at all. WAN 2.2 runs at
cfg 5.0 and **does** have a working negative channel, so the avoid-list belongs
in the motion pass and nowhere in the stills pass. See `scripts/content/broll.py`.

The same bug explains the French pass's stray face and fabricated camera UI.

**The phone is an Android, and it faces her.** This is a Google Play install ad
(ADS.md §2), and "a phone" to this model means an iPhone: early renders put a
clear Apple logo on the table, then a square triple-lens island in a plain case
— held back-to-camera in a point-of-view shot, so she was looking at the back of
her own phone. The cut now uses a Galaxy-style handset held screen-toward-the-
viewer, switched off, with even bezels and one centred punch-hole. Asked for a phone's
front generically, the model draws an iPhone notch instead — name the Android
model. The lessons are at the top of `scripts/content/broll.py`.

**One person, both shots.** An earlier café pass gave her a broad hand, a
chunky steel watch and a charcoal suit cuff, then cut to a woman in a camel
coat on the street — two people. And asking the motion pass for "her thumb
moves up toward the screen" grew a second thumb out of the hand while the
first kept gripping. The café hand is now slender, in the same camel coat over
a cream knit, and the motion moves the hand as one with the grip unchanged.
Both clips are committed at `content/ads/broll/bg-*.webm`.
