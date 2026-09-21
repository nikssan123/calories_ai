# Ad script — FR — "Les frites étaient petites"

Written 2026-09-21. The video asset ADS.md §4 says is missing, for
`Day So Far - FR - Installs` (campaign `24254674928`). Companion to
`scripts.md` §2, which is this same beat in English and at 20s.

**The claim is the correction, not the logging.** Every tracker in the FR
results can log a lunch. The thing none of them can do is change a meal that is
already recorded because somebody said a sentence about it — and that is not a
feature here, it is the storage model (`README.md` §1: food is stored per item
so "there was more rice" mutates the entry rather than appending to it).

The tagline is not written for this ad. It is `captions[1]` of the published
`store/listings/fr-FR.json`, word for word, so the ad and the Play page it
opens say the same thing:

> **Tu as changé d'avis ?** — Dis-le : le repas enregistré se met à jour.

---

## 0. Four rules this script is checked against

Everything below was written against `apps/api/src/ai/prompt.ts`, not invented,
because a mocked reply the agent would never write is a claim the app cannot do
today — the rule ADS.md opens with.

| Rule | Where | What it forbids here |
|---|---|---|
| Never open with a status word | `prompt.ts:369` | "Mis à jour", "C'est noté", "J'ai enregistré". Covers the French first-person verb, not just the seven English words. |
| Never grade the plate | `prompt.ts:381` | "Belle assiette", "un bon déjeuner". The compliment's subject may not be the food. |
| The card carries the numbers | `prompt.ts:365` | Reading the total back in prose. The card animating 950 → 820 **is** the moment; the sentence must not narrate it. |
| No closing remainder by default | `prompt.ts:367` | "Il te reste 650 kcal" stapled to every reply. Allowed only where it changes what they do next — which, after a 950 kcal lunch, it genuinely does. |

**Tutoiement throughout.** The French app is 283 `tu`/`ton`/`toi` against 5
`vous` (`apps/mobile/messages/fr.ts`). A `vous` in the ad is a different app.

> **Note for a separate fix, not for this ad.** `shots.replyLog` in
> `store/listings/fr-FR.json` is "715 kcal, dont 59 g de protéines — **belle
> assiette**. Ta journée est à 2 065 sur 2 200, il te reste 135 pour plus
> tard." That grades the plate *and* carries a closing remainder, and
> `shots.replyCorrection` opens "Mis à jour :". The screenshot copy predates the
> voice rules above and now contradicts them. This ad follows `prompt.ts`.

---

## 1. The capture — three turns, and why not four

Free is a guest day of **4 messages**, then a 3-day trial of **9**
(`plans.ts`). A demo with four user turns in it is a shot-for-shot depiction of
the entire free allowance. Two turns is the ad; the third is the 20s cut.

Record on a real account with history, in French, app language French.

### Turn 1 — the lunch

**User types** (corpus register: lowercase, no final full stop, median 8 words):

```
croque-monsieur, des frites et un verre de vin à midi
```

**Reply to capture:**

> Croque au jambon-fromage. J'ai supposé une portion moyenne de frites et un
> verre de rouge de 150 ml — le dîner a un peu de travail devant lui.

Opens with the food. States the **assumption**, which is sanctioned
(`prompt.ts:365`, "say what you assumed") and is the thing the next turn
corrects. The remainder is in its allowed form — where the day stands, in
words, not a figure read back.

Card: **Déjeuner · ~950 kcal**, three items, the bar well down the day.

### Turn 2 — the correction. This is the ad.

**User types:**

```
les frites c'était une petite portion
```

**Reply to capture:**

> Petite portion, alors. Ça te laisse nettement plus de marge pour ce soir.

No status word, no restatement, no arithmetic in the prose. **The card does the
work**: the same entry redraws at **~820 kcal**, the bar retreats, and nothing
is appended underneath it. Hold this shot — it is the only thing in the video a
competitor cannot film.

### Turn 3 — optional, 20s cut only

**User types:**

```
je mange quoi ce soir pour les protéines ?
```

**Reply to capture:**

> Il t'en manque une cinquantaine de grammes. Du poisson ou des œufs — comme la
> semaine dernière, ça rentre sans forcer.

This turn is in scope and the neighbouring one is not. `KITCHEN_LOCKED`
(`prompt.ts:264`) puts recipes and "what shall I cook tonight" behind Coach and
says outright **not** to improvise one in prose — but names this exact question
as the one that stays: *"'What should I eat to hit my protein?' is a different
question and still yours — that one wants a sentence and a look at their
history."*

**Do not** capture a dinner recommendation. "Poulet grillé, légumes rôtis et
pommes de terre" is precisely the failure `KITCHEN_LOCKED` exists to prevent,
and on the plan being advertised the app will decline to give it.

*Capture requirement:* the demo account needs fish or eggs in the last week of
its history, or "comme la semaine dernière" is fiction.

---

## 2. The cut — 15s, 9:16

| t | Shot | Source | On screen |
|---|---|---|---|
| 0.0–2.5 | Café table after lunch — plate with crumbs, wine, espresso; her hand picks the phone up off the marble. **No face.** | `content/ads/broll/fr-cafe.webm` | **« J'ai trop mangé à midi. »** |
| 2.5–4.5 | Composer, the sentence typed at real speed | Capture | — |
| 4.5–7.0 | Send. Items resolve, card settles at ~950 | Capture | — |
| 7.0–11.5 | **The correction.** Second sentence typed, sent, card redraws to ~820 | Capture | **Tu as changé d'avis ?** |
| 11.5–13.5 | Street, walking away, phone dark in her hand. **No face.** | `content/ads/broll/fr-street.webm` | **Dis-le : le repas enregistré se met à jour.** |
| 13.5–15.0 | End card | Static | Day So Far · Compteur Calories + Play badge |

### Building it

```sh
export PLAYWRIGHT_CORE="$TMPDIR/pw-core/node_modules/playwright-core"   # npm i --prefix "$TMPDIR/pw-core" playwright-core
npx tsx scripts/content/ad.mts --locale fr            # -> content/out/ads/ad-fr.mp4, 60fps, ~3 min;
                                                       #    copy to content/ads/ when it ships
npx tsx scripts/content/ad.mts --locale fr --fps 10   # a fast proof of the timing
npx tsx scripts/content/ad.mts --locale bg            # the Sofia cut (content/copy/ad-bg.md)
```

`scripts/content/ad.mts` renders the whole fifteen seconds on `reel.mts`'s rig
— deterministic HTML per frame, headless Chrome, ffmpeg — with the B-roll
exploded into stills and used as the ground under the hook and the close.

**The screen is read off the source, not off a screenshot.** Two earlier passes
drew it from the palette and then from the store captures, and both read as an
old build. It now comes from the code: `(tabs)/_layout.tsx` for the tab order —
**Journal is the first tab** — `(tabs)/index.tsx` `StatusBar`/`StatusLine` for
the sky band, the serif greeting, `MiniRing` and the serif figure, with the
measurements taken from its own StyleSheet, and `theme/motion.ts` plus
`hooks/useCountUp.ts` for the motion.

**The animation is the argument.** `useCountUp`'s note: "A number that swaps has
changed; a number that travels has *moved*." So figures count over 900ms on a
plain cubic ease-out — deliberately **not** the spring, because a total that
overshoots reads as the number being wrong — while the ring's arc *does* get the
spring with real overshoot over 700ms, and a correction flashes it 140ms up,
700ms down. `CAST.md` §112 supplies the rest: the three sit on the composer,
sending hops them into the reply row where they **are** the typing indicator,
and when the card lands the macro it is mostly made of — Plum, this lunch being
fat-led — flies onto it, cheers, and tosses a spark into the header ring, which
holds its number until the spark arrives.

**Why it no longer reads as laggy.** Three things, fixed separately: it renders at
**60fps** (the app runs at 60Hz or better, and a count-up sampled 24 times a
second is visibly stepped), with the 24fps B-roll motion-interpolated rather
than frame-repeated; the thread **scrolls** to new content on an 85ms ease
instead of snapping ~500px when a card reserves its height; and replies
**stream** word by word. One persistent page via `playwright-core` — the
`compose-shot.cjs` pattern — replaced a Chrome launch per frame, which is what
made 60fps affordable.

**Type.** Fraunces is the app's editorial serif
(`apps/mobile/theme/typography.ts`, `SERIF_FACES`); it sets the figures in the
app and the headline on every store listing, so the overlays are in it too and
the film speaks in the same voice as the page it opens. It is a dependency
rather than a vendored asset, so `content/fonts/` is fetched and gitignored —
the command is at the top of `ad.mts`.

**Sound.** *Cozy Ambience* by leberch, from Pixabay, at 1:21.5 — the steadiest
15s in it. **Pixabay Content License: commercial use, no attribution required**,
so unlike the two CC BY tracks in `content/music/` nothing has to be carried in
the YouTube description. Faded in and out and normalised to −14 LUFS.

It was chosen by measurement, not by ear. Of six downloaded candidates its
spectral centroid is ~331 Hz against 520–572 for the rest, making it markedly
the warmest, and its 17 dB crest factor says it still breathes rather than being
squashed flat the way stock ambient usually is. The runners-up were *Documentary
Calm* (same uploader, brighter and more dynamic) and Meydän's *Freezing but warm*
from 1:42.5 (CC BY, so it would need its credit) — `--music <file> --music-start
<secs>` cuts either in.

**The middle nine seconds are rendered, not captured, and that is the one thing
left to fix.** `CONTENT_ENGINE.md` §0 is unambiguous that the hero asset is the
app's own screen. Shoot turns 1 and 2 on a real French account and swap the
capture in; everything around it — timing, copy, overlays, B-roll, audio, end
card — is finished and can be cut against in the meantime.

**The B-roll is committed** at `content/ads/broll/fr-*.webm`: 704×1280, 49
frames at 24fps, Z-Image Turbo stills animated with WAN 2.2 TI2V 5B on the
4080. `ad.mts` retimes each to its slot and motion-interpolates it to 60fps.
The prompts and seeds behind both clips are in `scripts/content/broll.py`
(`paris`); the start stills themselves stay local in `content/gen/`.

**Two framings were rendered and rejected, and the reason generalises.** A
side-on walking shot put her face in profile in the frame, and a hand-held-phone
shot lit the screen up and drew a colour app UI on it — a fabricated interface in
an ad for a real one, and one that reads as photo logging, which ADS.md §5 keeps
out of the copy deliberately. **Frame the phone dark, small, and turned away, and
crop the head out rather than asking for it to be absent.** A diffusion model
given "her face is not in the frame" will happily render her face.

**20s cut:** insert turn 3 at 11.5 and push the tail back 5s.

### No face, on purpose

`CONTENT_ENGINE.md` §0 is blunt that diffusion reads as fake *to this audience
specifically, because they are looking at food critically*. An AI face in a
UGC-coded ad is the same bet with a worse failure mode, and the tell is that
every prompt written for one ends in "don't let her speak". Framing the B-roll
on the table, the hands and the phone removes the uncanny surface altogether,
costs nothing, and reads as more honestly UGC rather than less.

**The generated plate carries no number.** `CONTENT_ENGINE.md` §0's rule holds:
every calorie figure in this video sits on the app's own card, over real
capture.

### No "gratuit" anywhere in this video

ADS.md §5: *gratuit* goes only on the barcode scanner, macros and the offline
diary — **never** on logging by sentence, which is the entire body of this ad.
The end card is the store badge and the app name. "Essayez gratuitement" under
fifteen seconds of sentence logging is the one line the policy section forbids
by name.

---

## 3. Where this can and cannot run

The FR campaign is a Google **App campaign** (ADS.md §3). Assets go into a pool
and Google assembles them; you do not choose which hook shows, and at €5/day
the campaign may not leave learning. **So this is one asset, not a hook test.**
It still earns its place — §4 notes there is no video at all today, and Google
will otherwise build one from the stills by itself.

Swapping twenty hooks over one demo — `hooks.txt` and `scripts/content/batch.mjs`,
which both already exist — needs a channel with asset-level reporting. That is
Meta or TikTok, neither of which has an account yet, and Meta would also want
the attribution SDK ADS.md §2 says the app deliberately does not ship.

**And the gate in ADS.md §7 comes first.** Bulgaria's fourteen installs made
zero accounts. If the funnel is still losing people between install and
account, a better ad buys more of the same nothing. Check the Funnel tab before
this video gets a budget.
