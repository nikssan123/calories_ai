# Content Engine

A production pipeline for TikTok / Reels / carousel content for the app.
Mac (this repo) orchestrates and assembles. The Windows PC + RTX 4080 renders.

---

## 0. The one thing to get right

**The hero asset is the app's own screen, not AI-generated food.**

Every calorie app that broke out recently (Cal AI, MacroFactor) grew on
screen recordings of something satisfying happening, plus a face, plus real
food. Diffusion-generated food reads as fake to this audience specifically,
because they are looking at food critically — that is the whole point of the
app. Comments will say "this is AI" and the video dies.

So the 4080 does **not** produce the hero footage. It produces everything
around it: stills, carousels, backgrounds, ad creative, and frame
interpolation on real capture. That is still a lot of value — it just isn't
"generate a video of a salad."

### On sourcing food photos from the internet

Scraping images off the web for marketing use is a licensing problem, and it
is also unnecessary. Three clean sources, in order of preference:

| Source | License | Use for |
|---|---|---|
| Your own camera / screen capture | Yours | Anything with a calorie number on it |
| Pexels API / Unsplash API | Free, commercial use OK | Calorie-guessing content, backgrounds |
| ComfyUI on the 4080 | Yours | Carousels, abstract/brand art, ad creative |

**Rule: never put a calorie number on a generated food image.** The food
isn't real, so the number is fiction, and for a nutrition app that is the
one credibility hit you cannot take. Generated imagery is for texture and
branding. Real or licensed photos carry the numbers.

**§10 changes what the hero asset is for**, not this rule. The recipe library's
photographs are real and its numbers are USDA's, so they carry numbers exactly
as this table allows. Nothing below §10 relaxes the sentence in bold above.

---

## 1. Architecture

```
  Mac (this repo)                        Windows PC (RTX 4080)
  ─────────────────                      ──────────────────────
  content/ scripts + assets              ComfyUI  --listen 0.0.0.0:8188
  ffmpeg assembly            ───POST──▶  /prompt      (queue a workflow)
  whisper.cpp captions       ◀──GET────  /history/id  (poll for result)
  Kokoro TTS voiceover       ◀──GET────  /view        (fetch the PNG/MP4)
  variant batch export
        │
        ▼
  content/out/*.mp4  →  AirDrop to phone  →  post manually
```

Mac stays the orchestrator because that's where the repo, the simulator
recordings, and ffmpeg already live. The PC is a pure render server.

---

## 2. PC setup

### 2.1 Start ComfyUI as a render server

In the ComfyUI folder:

```powershell
python main.py --listen 0.0.0.0 --port 8188
```

Portable build:

```powershell
.\python_embeded\python.exe -s ComfyUI\main.py --listen 0.0.0.0 --port 8188
```

### 2.2 Firewall

Allow 8188 inbound on **Private networks only**:

```powershell
New-NetFirewallRule -DisplayName "ComfyUI LAN" -Direction Inbound `
  -LocalPort 8188 -Protocol TCP -Action Allow -Profile Private
```

> `--listen 0.0.0.0` has **no authentication**. Fine on the home LAN.
> Never port-forward 8188 to the internet.

### 2.3 Get the PC's LAN IP

```powershell
ipconfig | findstr /i "IPv4"
```

Then from the Mac, confirm reachability:

```bash
curl -s http://<PC-IP>:8188/system_stats | python3 -m json.tool
```

That should print the GPU name and VRAM. Once it does, the Mac can drive
every render.

### 2.4 Custom nodes (via ComfyUI Manager)

- **ComfyUI-VideoHelperSuite** — video load/save/combine nodes
- **ComfyUI-Frame-Interpolation** — RIFE, for the interpolation workflow
- **ComfyUI-Custom-Scripts** — quality of life, optional

---

## 3. Models to download (RTX 4080, 16GB VRAM)

| Purpose | File | Goes in |
|---|---|---|
| Stills, best quality | `flux1-dev-fp8.safetensors` | `models/checkpoints/` |
| Stills, fast bulk | any SDXL checkpoint | `models/checkpoints/` |
| Image→video, 5s clips | `wan2.2_ti2v_5B_fp16.safetensors` | `models/diffusion_models/` |
| ↳ its text encoder | `umt5_xxl_fp8_e4m3fn_scaled.safetensors` | `models/text_encoders/` |
| ↳ its VAE | `wan2.2_vae.safetensors` | `models/vae/` |

Flux fp8 is a single all-in-one checkpoint — simplest starting point.
The Wan 2.2 files are in the `Comfy-Org/Wan_2.2_ComfyUI_Repackaged` repo on
HuggingFace, under `split_files/`.

### Expected speed on a 4080

| Job | Ballpark |
|---|---|
| SDXL still, 1024² | 3–5 s |
| Flux fp8 still, 1024², 20 steps | 15–25 s |
| Wan 2.2 TI2V 5B, 5s @ 720p | 2–4 min |
| Wan 2.2 I2V 14B fp8, 5s @ 480p | 5–10 min |
| RIFE 2x interpolation, 10s clip | under a minute |

Skip the 14B I2V models at first. The 5B is the right speed/quality point
for 16GB, and for background texture the difference doesn't show.

---

## 4. ComfyUI workflows to build

Build each in the GUI, then **Settings → enable dev mode → Save (API
Format)**. Save the JSON into `content/workflows/` in this repo so the Mac
can template and POST it.

### W1 — `still_food.json`
Flux checkpoint → CLIPTextEncode → KSampler → VAEDecode → SaveImage.
Parameterised: positive prompt, seed, width/height.
**Use:** carousel panels, ad creative, App Store screenshot backgrounds.

### W2 — `still_to_motion.json`
LoadImage → Wan 2.2 TI2V 5B image-to-video → VHS_VideoCombine.
Short prompts describing *camera* motion, not subject motion — "slow push
in, steam drifting" not "person eats salad." 5s, 720p, 24fps.
**Use:** the moving background layer behind hook text.

### W3 — `interpolate.json`
VHS_LoadVideo → RIFE VFI (multiplier 2 or 4) → VHS_VideoCombine.
**Use:** the sleeper feature. Feed it a real screen recording of the barcode
basket scan and get buttery 60/120fps slow-mo on the satisfying moment.
This is the highest-ROI thing the 4080 does for you.

### W4 — `upscale.json` (optional)
Load → 4x-UltraSharp ESRGAN → Save. For rescuing low-res source stills.

---

## 5. Content formats, ranked

Ranked by expected return for a solo dev with no audience. This ranking assumes
content built from the app's own screens; for the library-driven formats that
need neither a screen recording nor a camera, see §10.

### 1. "Scan my grocery haul" — the hero format
Screen recording of the multi-packet barcode basket scan. Fast cuts, counter
ticking up, satisfying completion. This feature is genuinely differentiated
and nobody else demos it well. **Make 20 versions of this before anything
else.**

### 2. Build-in-public / founder POV
"MyFitnessPal wanted $20/month so I spent 6 months building my own." Talking
head or screen-record with voiceover. Zero production cost, and it is true.
Works on TikTok *and* r/loseit, r/SideProject, r/apple.

### 3. Calorie-guessing game
Licensed real food photo → "guess the calories" → 3s pause → reveal in the
app. Comment bait, high completion rate. **Real photos only** — see the rule
in §0.

### 4. "What I eat in a day, logged in 8 seconds"
Your own food, your own phone, app overlay. Cheap and evergreen.

### 5. Streak / before-after
Needs real users first. Park it until there are some.

Formats to avoid: generated food b-roll with voiceover; anything that looks
like a stock-footage ad; comparison callouts naming competitors by name.

---

## 5b. Instagram stills: the cast is the format

Written 2026-09-18, after looking at what the field actually posts.

| Account | What the grid is |
|---|---|
| **Cal AI** | Creator video, real plates, a white caption hook burned into frame 1. Three pinned 3D phone mockups ("Scan / Track / Improve"). Almost no graphic design. |
| **MacroFactor** | White science cards: condensed uppercase headline, a diagram, wordmark at the foot. Authoritative and cold. |
| **Lifesum** | Editorial. Big sans headline with one accent colour on cream or a photo, a paragraph of body copy *inside* the image, carousels. |
| **Yazio** | Memes. Cut-out food on paper grounds, "which potato is joining your dinner?", "would u rather, 600 kcal", stick figures, before/after UGC. |
| **Duolingo** | The mascot, and nothing else. Flat colour, one line, no logo, and fake app screens as jokes. The character *is* the brand asset. |

Four of those five need either a creator budget, a photo licence, or a
photographer. The fifth is the one this app can already do — the cast exists,
is drawn from geometry rather than bought from a library, and is tied to the
three macros, so a character in a post is the product explaining itself rather
than decoration. **Duolingo's format, Yazio's playfulness, and a mechanic
neither of them has.**

### The generator

    pnpm cards:cast                      # every post, 1080x1350, to content/out/cast/
    pnpm cards:cast -- --size story      # 1080x1920
    pnpm cards:cast -- --only journal    # one layout

Deck: `content/copy/cast-posts.ts`. Code: `scripts/content/cast-cards.ts`.
Four layouts:

- **solo** — one of them, big, one line over their head. Ink, cream or their
  own colour as the ground, so the grid has a rhythm.
- **trio** — all three, for "who are these".
- **journal** — the signature: a typed sentence in a bubble, the food card it
  became, and whoever the meal is mostly made of cheering over its top edge.
  Nobody else in the category can draw this, because nobody else has the cast.
- **guess** — a meal, the three of them, and a question with a right answer.

Two things it is strict about, and both are `CAST.md`'s rules rather than this
file's: who carries a meal is decided by the meal's own macros (the same three
lines as `dominant()` in `Presence.tsx` — a post that gives a meal to the wrong
character contradicts the app), and a figure with its arms up gets no paws on
the card's rim, because the app's own hands lift away as the carrier pops up.

**Why it draws in two passes.** The figures go through librsvg (via `sharp`),
which is the only rasteriser here that can take the cast's paths. Text does
not: fontconfig on this machine has no config file at all, so librsvg resolves
every family — Baloo, Nunito, Fraunces — to a Helvetica fallback, silently.
ffmpeg's `drawtext` takes a font *file* straight to FreeType, which is why
`cards.mjs` has always used it. So sharp draws the scene and ffmpeg writes on
it, and the script reads `cmap`/`hhea`/`hmtx` itself to know how wide a line
will be before it asks for a bubble to wrap around it.

## 6. The assembly line (Mac, no GPU needed)

The actual growth mechanic is **one capture × many hooks**. Record the
barcode scan once, ship 20 variants, let the algorithm pick the winner.
Post 3–5/day.

```
content/
  raw/            # screen recordings, phone footage — the source of truth
  stock/          # Pexels/Unsplash pulls, with a licenses.csv
  gen/            # ComfyUI output pulled from the PC
  hooks/          # hooks.txt — one hook line per row
  music/          # licensed beds
  workflows/      # *.json API-format ComfyUI graphs
  out/            # finished 1080x1920 mp4s, ready to post
  posted.csv      # what shipped, when, where, and how it did
```

Pipeline per variant:

1. **Canvas** — scale/crop source to 1080×1920, 30fps (60 if interpolated).
2. **Hook overlay** — big text, top third, heavy stroke, first 3 frames.
3. **Captions** — `whisper-cli` with word timestamps → ASS → burn in.
   Word-by-word karaoke captions measurably lift retention.
4. **Voiceover** — Kokoro TTS, or your own voice (better).
5. **Music** — bed at -18dB, ducked under VO.
6. **Export** — h264, yuv420p, ~8Mbps, `+faststart`.

Install the two missing Mac tools:

```bash
brew install whisper-cpp
pip install kokoro-onnx soundfile
```

The batch driver script is the next thing to write — it loops `hooks.txt`
against one source clip and writes N files into `content/out/`.

---

## 7. Publishing — the honest state

| Channel | API reality | Plan |
|---|---|---|
| **TikTok** | Content Posting API exists, but *Direct Post* needs an app audit most solo devs don't clear. Unaudited apps can only push to the user's **drafts/inbox** — you still tap publish in the app. | Built — `scripts/tiktok/`. Uploads to drafts; you write the caption and tap post. The win is the file transfer, not automation. |
| **Instagram** | Reels publishing works via the Graph API, but needs a Meta app + review for `instagram_content_publish`. | Post manually for now. See note below. |
| **Metricool** | API is on the paid tiers only. | Skip, or keep using the UI. |
| **Postiz** | Open source, self-hostable — could run on the PC. Supports TikTok/IG scheduling. | The option worth exploring if manual posting becomes the bottleneck. |

**Correction worth acting on:** the "I don't have a real business" blocker
for Instagram is probably not real. A Facebook Page and an Instagram
Creator/Business account are both free and require no registered legal
entity — you make a Page for the app, not for a company. The actual gate is
Meta's app review for the publishing permission, which wants a working app
and a privacy policy. You have both. Worth 30 minutes to test.

**But:** at 3–5 posts/day, manual posting is about 5 minutes of work. The
API approval friction costs far more than it saves. **Automate production,
post by hand.** Revisit only past ~15 posts/day across channels.

### Track what you ship

`content/posted.csv` — `date, file, hook, platform, views, likes, comments, installs`

Pull install numbers from App Store Connect / Play Console daily. After ~30
posts the hook patterns that work will be obvious, and everything after that
is just making more of those.

---

## 8. Build order

1. **PC** — start ComfyUI with `--listen`, open the firewall, confirm
   `/system_stats` answers from the Mac. *(blocks everything on the PC side)*
2. **Mac** — `brew install whisper-cpp`; write the hook-variant batch script.
   *(needs no GPU — can happen in parallel with 1)*
3. **Record** 60s of real barcode-basket-scan footage. *(the actual
   bottleneck — everything downstream needs this)*
4. **W3 interpolate.json** first, not the image workflows. Slow-mo on real
   footage is the fastest win.
5. Ship 20 variants of format #1. Post 5/day for 4 days. Read `posted.csv`.
6. Only then build W1/W2 for carousels and backgrounds.

Do not build the AI video generator until steps 1–5 have run once and you
know which hooks land.

---

## 9. Accounts

Created 2026-09-04. Handle is `daysofarapp` everywhere it was available.

| Platform | Handle | State |
|---|---|---|
| Facebook Page | [facebook.com/daysofarapp](https://facebook.com/daysofarapp) | Live. Name, bio, website, support email, icon all set. Page ID `61594106339199`. |
| TikTok | [@daysofarapp](https://www.tiktok.com/@daysofarapp) | Live. Icon + bio set. **Display name still reads `daysofarapp`.** |
| Instagram | [@daysofarapp](https://instagram.com/daysofarapp) | Live. Icon + bio + name set. **Still a personal account, not linked to the Page.** |

Shared profile copy:

- **Display name:** `Day So Far`
- **Bio:** `Just say what you ate. AI food diary, macro tracker and calorie counting.` (73 chars — fits TikTok's 80 and IG's 150)
- **Website:** `https://daysofar.com`
- **Support email:** `support@daysofar.com`
- **Avatar:** `apps/mobile/assets/icon.png`

### Open items

- **TikTok display name** — locked by cooldown until **2026-09-11**. Set it to `Day So Far` then; it is the only name a viewer actually reads on TikTok.
- **TikTok username** — locked until **2026-10-04**, irrelevant unless you want to change it.
- **Facebook cover photo** — none. Wants a 1640x856; a job for W1 once the PC is up.
- **Instagram website field** — empty. Instagram says outright that links are
  editable only in the mobile app; the web field is inert.
- **Instagram is still a personal account.** Switching it to **Creator** and
  linking it to the Day So Far Page are both phone-only flows — searching
  Instagram's web settings for "professional" returns no results at all. Until
  that link exists, Reels publishing through the Graph API is impossible however
  the Meta app is configured, so this is the gate on §7's Instagram row.

  Choose **Creator**, not Business: Instagram Business accounts lose the general
  music library the same way TikTok Business accounts do, and trending audio is
  worth more than anything Business adds here.

### Do not switch TikTok to a Business account

It unlocks a website link field, and costs you the commercial music library —
Business accounts can only use royalty-free "Commercial Sounds". Trending audio
is a major distribution input on TikTok, so that trade is heavily negative at
your stage. Stay on a personal/Creator account and put the link in the bio text
if you need one.

---

## 10. The library is the content engine

Everything above §10 makes content *about the app*. This section is the
correction, and it changes what gets posted rather than how it gets made.

### The pivot

**Posts sell meal logging as an idea. Not the app, and not from its screens.**

Read `content/hooks/hooks.txt`, `content/copy/cards.txt` and
`content/copy/scripts.md` end to end and every asset has the same subject: the
software. That is fine content for somebody comparing trackers, and nobody on
TikTok is comparing trackers. `content/copy/posts.md` already makes this
argument — it parks the language post because it "only lands for somebody who
has already decided to track their food, and none of the people this content
has to reach has decided that yet." That test was applied to one post. It
condemns the whole library, this section included if it ever drifts back.

So: food, numbers and habits are the subject. The app is what you find in the
bio, not what you watch.

### The asset that was already here

`apps/api/data/library-recipes.json` — 99 dishes, seeded by `pnpm setup`, and
until now used only by `/cook/library`. Every row carries what a post needs:

| Field | Use |
|---|---|
| `title`, `image_path` | the photo, in `apps/web/public/recipes/`, 800px wide |
| `kcal` | the number the post is built around |
| `protein_g`, `carbs_g`, `fat_g` | the macro split — and the cast, see below |
| `serving_size`, `portions` | portion-reality content |
| `food_groups` | what a balanced plate is |
| `rating`, `rating_count` | ordering, and "the internet's favourite X" angles |
| `source_url` | a `.gov` citation under every claim |

The text and the photographs are USDA MyPlate Kitchen, a work of the US
government and **public domain** — the one source in §0's table with no licence
to clear and no attribution burden.

### Why this satisfies §0 rather than dodging it

§0's rule is that a calorie number may never sit on a generated food image,
because the food is fake so the number is fiction. Here the photograph is real,
the number is USDA's, and the post can link to the page it came from. This is
the rare nutrition claim that is fully defensible — most of the category is
publishing estimates it cannot source.

The photographs are a mix: some are studio work (`avocado-breakfast-bruschetta`),
some are plainly somebody's kitchen (`2-step-chicken`). Do not filter for the
studio ones. §0's whole argument is that this audience rejects food that looks
fake, and the unstyled photographs are the ones that read as real.

### The cast is the macro split

Ember is protein, Skye is carbs, Plum is fat (CAST.md). Every row carries
`protein_g`, `carbs_g` and `fat_g`. So the three figures can show a real dish's
split, driven by the row, using poses that already exist — no new rig work, and
none of the walk cycles the cast cannot do (`legs` is empty unless sitting;
there is one independent arm; a turn is a mirror).

A post is a function of a JSON row. That is the whole mechanic.

### The five formats

1. **Guess the calories.** §5 already ranks this third and already specifies
   "real photos only". The photographs and the numbers were both in the repo;
   nothing connected them.
2. **"Same calories. Completely different day."** Already a line in
   `cards.txt`. The pairs can be *found* — match two rows on `kcal`, take the
   widest gap in macro split, let the cast draw the difference.
3. **Protein per 100 kcal**, ranked across all 99.
4. **Serving-size reality** — `serving_size` against `portions`.
5. **What a balanced plate is** — `food_groups`.

All five are about food and numbers. The app appears in none of them.

### What to build

A generator beside `scripts/content/cards.mjs`, same output contract, driven by
data instead of a text file: read `library-recipes.json`, composite photograph +
number + cast into 1080×1920, write to `content/out/`.

`cards.mjs` is the precedent for the rendering; `@ct/shared/cast` is the
geometry, already free of React and React Native so a script can import it.

### Limits, stated so nobody is surprised

- **99 is finite.** Across five formats that is a few hundred posts — months at
  3–5/day — and then it needs Pexels, or a camera.
- **800px** is small for a 1080×1920 canvas. Put the photograph in a band
  rather than full-bleed, or run `W4 upscale.json` on the 4080, which finally
  gives that workflow a job.
- **USDA's number is per USDA's serving**, not per anybody's plate. Say the
  serving or say nothing; do not imply it is what someone ate.
- **These are American institutional recipes** and the corpus this app was
  written against is Bulgarian. Watch whether that shows in the numbers.

### Ruled out, so it is not relitigated

- **Scheduling tools (Buffer and the rest).** §7 stands, and there is now a
  second reason: neither the TikTok Content Posting API nor the Instagram Graph
  API can attach a trending sound, so anything auto-published loses the audio
  library — the same trade §9 refuses for a TikTok Business account. Post video
  by hand. A scheduler is worth having only for the analytics pull into
  `posted.csv`, and for formats where audio is irrelevant.
- **AI-generated humans.** Rejected in favour of the cast: the cast is
  consistent by construction, already appears inside the product, and never
  invites the "this is AI" comment §0 is about.
- **Cast-led narrative video.** The rig is sticker-tier — six eye states, six
  mouth states, one swinging arm, front-facing only. It can carry a 2–5s loop
  or a reaction over real capture. It cannot carry a 15s story, and extending
  it to do so is an animation project, not a render harness.

### The poster builder, and where it stopped

`scripts/content/post.mts` renders a finished post: a generated gradient from
`content/gen/`, one cast figure drawn from `packages/shared/src/cast.ts`, and
type in the app's own two faces. `npx tsx scripts/content/post.mts`, with
`--size post|story|square` and `--only <concept>`.

Headless Chrome rasterises it. That is not a preference: `sharp` is not
installed and ffmpeg reads neither SVG nor a webfont, so Chrome is the only
thing on the render box that can do both.

**Nunito is now vendored** beside Baloo2 in `apps/mobile/assets/fonts` (400,
600, 700; SIL OFL, the same licence Baloo2 ships under). It is the face
`apps/web/app/layout.tsx` already names, so this adds no new brand decision —
it only makes the pairing available outside the app.

Four things were got wrong first, and each is a rule in the file's header now:

- **A lineup is not a composition.** Three figures at 25% of the frame, centred,
  evenly spaced and labelled underneath is a slide. One figure at 55–75%,
  cropped by an edge, with the type ranged left into the space it leaves, is a
  poster.
- **A mood needs its scene.** `stir` draws the ladle and not the pot, because it
  was written for the kitchen in `Scenes.tsx`. On a bare gradient it reads as
  waving a spoon at nothing.
- **One face at one weight is the amateur tell**, ahead of any layout mistake.
  Baloo2 800 for the headline, Nunito 600 for everything else.
- **A 6% ellipse is not a shadow.** The figure needs a halo of its own macro
  colour and a blurred contact shadow, or it floats on the wash like a sticker.

**Nine templates, not one.** The first pass had a single shape — figure in a
bottom corner, type top left, gradient behind — and nine of those in a feed
read as one post. The builder now holds nine layouts that fail differently from
each other, and a `POSTS` entry is copy poured into one of them:

| | Template | Character | What it is for |
|---|---|---|---|
| 01 | `statement` | none | one claim on a flooded field; reads at thumbnail size |
| 02 | `typed-day` | none | a day as a document, mono timestamps, no numbers |
| 03 | `macro-bar` | none | the app's own macro bar as the whole image |
| 04 | `glyph` | as punctuation | a figure set inline as the full stop |
| 05 | `pair` | as a unit | two figures standing in for two macro profiles |
| 06 | `carousel` | as a cue | frame 1 of 5, with the swipe affordance drawn |
| 07 | `crop` | leads | cropped off two edges; only the prop and part of a face |
| 08 | `split` | leads | dark half for type, lit half for the figure |
| 09 | `staged` | leads | under half the frame, in its own pool of light |

Three carry no character at all. That is deliberate: it is what makes the cast
mean something on the six posts where it does appear.

Two things each layout had to be taught, because the copy depends on them:
**a crop cannot lose the subject of its own sentence** (the toast in 07 is what
the headline is about, and a held prop reaches to about 0.93 of the figure's
box, so the placement has to be prop-aware or the square crops it off), and
**the wordmark takes whichever corner the figure and its prop are not reaching
into**.

**Three sizes off one set of coordinates.** `--size post|story|square`. The
composition lives in a *stage* rather than the frame: on story the stage stays
the 4:5 composition, centred, while the ground fills the whole 9:16 — which
puts every element inside Instagram's safe area by construction instead of by a
table of insets. Square reflows, so figures are sized as a share of the stage
height and capped against the frame width; without the cap a tall frame grows a
figure until it runs out of the sides, and without the height share a square
frame keeps a figure sized for a taller one and swallows the type.

**The signature is the app icon**, `store/icon-512.png` — the jade ring with
the three macro dots the cast came out of (CAST.md), so the mark and the
characters read as one family. It is set as a rounded tile because its ground
is cream rather than transparent, which works on a light field or a dark one.

`IBM Plex Mono` joins Baloo2 and Nunito in `apps/mobile/assets/fonts` (400/500,
SIL OFL) — a utility face for timestamps and labels, which 02, 05 and 06 are
built on. Three roles, not three brands: display, text, utility.

**Where it stops.** The remaining gap is art direction rather than code, and
that was a deliberate call rather than a limit of the tool. Three things are
open:

1. **The grounds are CSS fields.** Pass `ground` on an entry to lay a ComfyUI
   render under one instead — 09 already does. The richer direction is the
   `Scenes.tsx` environments, the kitchen and the park path and the porch, each
   already lit by hour, so a character stands somewhere rather than on a wash.
2. **Baloo2 stays.** A high-contrast serif or a tight grotesque would read more
   premium, and the store ads do use a serif; keeping Baloo2 is a decision to
   match the app rather than out-dress it. Do not reopen it casually — it is
   the face `cards.mjs`, the store cards and the app all share.
3. **The cast is cute by construction.** Blush, dot eyes, a smile. Framing can
   make it serious; it cannot make it austere, and that ceiling is not a craft
   problem to solve.

A designer picking this up needs `CAST.md` for the character rules, this
section for the composition ones, and the knowledge that the figures are
geometry rather than artwork: they are drawn from `figureMarkup()` at any size,
in any of eighteen moods, and must never be redrawn by hand or regenerated by a
model.

### content/social/ — the one committed payload

`content/out/` is ignored because renders are reproducible (§6). `content/social/`
is the exception, and it exists for one reason: **Buffer's API has no upload
endpoint.** Its schema offers `createPost`, `editPost` and `createIdea` and
nothing for media, so every asset has to be a URL Buffer's own servers can
fetch. This repository is public, so a committed file is reachable at
`raw.githubusercontent.com/<owner>/<repo>/<branch>/content/social/<file>` the
moment it is pushed, and that is the shortest path from a local render to a
scheduled post.

Only the 4:5 feed renders live here. Story and square stay in `content/out/`
until something needs a URL for them too.

### The reel builder

`scripts/content/reel.mts` renders a promotional film the same way the posters
are made — from the cast's own geometry, a frame at a time.
`npx tsx scripts/content/reel.mts`, with `--fps` and `--out`.

The first film is `02-typed-day` in motion: a day arriving one sentence at a
time, each closed by whichever character the meal is mostly made of, standing
in as the full stop. It is the one idea off the layout board that works only
because the mascots *are* the macros, so the punctuation carries information
rather than decoration.

**Why not a video model.** ComfyUI has Wan 2.2 TI2V and it is the wrong tool
here: the cast is exact geometry and a diffusion model would redraw it as its
own guess at a cute blob. Every frame of this is the same `figureMarkup()` the
phone, the widget and the site draw. Keep Wan for grounds and texture (§10),
never for the characters.

**What the rig can and cannot do.** `legs` is empty unless sitting and there is
one independent arm, so there are no walk cycles in here — only scale, hop,
squash and type. That is not a limitation being worked around; it is the
vocabulary the drawing actually supports, and the film is built inside it.

**How it runs.** Each frame is a deterministic HTML document — the pose is
computed for frame N rather than left to a CSS animation — screenshotted by
headless Chrome and assembled by ffmpeg. Chrome start-up dominates, so a
~8-second film is a few minutes of wall clock.

**Frames go in the OS temp dir, not `content/out/`.** They lived in the output
tree first, and because that tree cannot always be cleared, a stale Chrome
profile survived between runs; every launch then died on the profile lock with
exit status 21 and no stderr, which the loop reported as "0 frames rendered"
rather than as the real fault. Only the finished mp4 belongs in `content/out/`,
and the renderer now prints the exit status instead of counting to zero
quietly.

**One timing rule, learned the hard way.** At 1.5s a beat, an in and out of
0.4s each leaves under half a second at full opacity and the film reads as a
flicker rather than a sentence. The transitions are deliberately quick.

### Ground and music

`--ground content/gen/<clip>` lays a ComfyUI render under the type. Frames then
render on transparency (Chrome needs `--default-background-color=00000000`) and
ffmpeg loops, crops and composites. **Tried once and not kept:** Wan read
"billowing plumes" literally and produced hard orange streaks with a visible
waterline, hanging exactly where the headline sits. Softened enough to stop
fighting the type it is indistinguishable from the CSS field it replaced. A
typographic film wants a quiet ground, and CSS gives that for free — save the
generated motion for posts where the ground *is* the image.

`--music <file>` replaces the synthesised bed, and **the music sets the film's
length**: the closing card absorbs whatever is left after the sentences, so the
picture ends exactly when the track does. It refuses a track too short to leave
a sensible close.

That rule exists because of the failure it prevents. Cutting the picture to a
fixed length and looping a track into it chopped the music at an arbitrary
point — and the first track tried builds to its loudest in its final second and
opens with 0.3s of silence, so each loop slammed a peak into a gap. Lap a short
track to length first and hand over the result:

```
ffmpeg -i t.mp3 -i t.mp3 -filter_complex \
  "[0:a]atrim=start=0.3,asetpts=PTS-STARTPTS[a];\
   [1:a]atrim=start=0.3,asetpts=PTS-STARTPTS[b];\
   [a][b]acrossfade=d=0.9:c1=tri:c2=tri[o]" -map "[o]" bed.wav
```

**Licensing, and what it costs.** `content/music/` is ignored, so tracks live
only on the machine that rendered — the credit has to live here. Of 180 Free
Music Archive candidates, **three** were usable: FMA is overwhelmingly `BY-NC-*`
(non-commercial, wrong for a brand) and `BY-ND` (no derivatives, which forbids
even trimming to length). Verify every track against its own page; the search
filter is not trustworthy. FMA also gates downloads behind a login, while its
stream endpoint serves the file openly.

| Track | Artist | Licence | Length | Credit required |
|---|---|---|---|---|
| Chill | American Darlings (S.A.D.) | CC BY 4.0 | 0:08 | yes |
| Freezing but warm | Meydän | CC BY 4.0 | 4:09 | yes |
| Auto Ran Star Tropic | Piano & Elektron | CC0 | 0:15 | no |

A CC BY track without its credit is an unlicensed use. Wherever a cut using
*Chill* is posted, the caption carries:

```
Music: "Chill" by American Darlings (S.A.D.), CC BY 4.0
```

Pixabay and Uppbeat have better catalogues and cleaner terms. They refuse
*scripted* requests — `fetch`/`curl` get 403 and 429 — but that is a block on
the client, not on the catalogue: **Playwright driving the installed Chrome
(`channel: 'chrome'`) loads Pixabay normally and returns 200.** The browsers
Playwright downloads for itself may be a version behind what npm installs, so
point it at the system Chrome rather than running `playwright install`.

The Pixabay Content License is the reason to bother: commercial use with **no
attribution required**, where every usable FMA track is CC BY and has to carry
its credit wherever the cut is posted.

**Search order matters more than the query.** `?order=trending` surfaces an SEO
farm — one uploader, titles in the shape *"Ambient - Ambient Music"*, all of it
generic. Browse `/music/search/genre/<genre>/` instead, drop titles matching
`/^(.+?) - \1 Music$/`, and cap the list at two tracks per uploader.

**Pick by measurement, since nobody in this pipeline can hear.** Download a
handful and compare spectral centroid (lower is warmer), crest factor in dB
(higher means it still breathes; stock ambient is usually squashed), and the
RMS envelope's variance over a 15s window (lower is steadier under a voice or
a text card). That is how *Cozy Ambience* was chosen for the install ads — 331 Hz
against 520–572 for its rivals. It is not a substitute for listening to the
shortlist, and the shortlist is what should be handed over.

| Track | Artist | Licence | Length | Credit required |
|---|---|---|---|---|
| Cozy Ambience | leberch (Pixabay) | Pixabay Content | 1:54 | **no** |
| Documentary Calm | leberch (Pixabay) | Pixabay Content | 2:50 | **no** |

The files stay out of git with the rest of `content/music/`: the Pixabay
licence forbids redistributing a track on its own. `ad.mts` expects Cozy
Ambience at `content/music/pixabay-leberch-cozy-ambience.mp3` —
<https://pixabay.com/music/ambient-cozy-ambience-603940/>; the runner-up is
<https://pixabay.com/music/ambient-documentary-calm-603945/>.
