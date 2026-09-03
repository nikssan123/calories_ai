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

Ranked by expected return for a solo dev with no audience.

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
| **TikTok** | Content Posting API exists, but *Direct Post* needs an app audit most solo devs don't clear. Unaudited apps can only push to the user's **drafts/inbox** — you still tap publish in the app. | Not worth the integration. AirDrop → post from phone. |
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
