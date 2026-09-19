#!/usr/bin/env tsx
// Posters, not slides.
//
//   npx tsx scripts/content/post.mts                 # every concept, 1080x1350
//   npx tsx scripts/content/post.mts --only night --size story
//
// The three layers each come from where they are already authoritative:
//
//   ground    ComfyUI, via content/gen/ — CONTENT_ENGINE.md §10. Texture only,
//             never a subject, and never anything a number could sit on (§0).
//   cast      packages/shared/src/cast.ts, the same geometry the phone, the
//             widget and the site draw. Not a redraw and not a diffusion guess.
//   type      the app's own two faces, vendored in apps/mobile/assets/fonts:
//             Baloo2 for the shouting, Nunito for everything else — the pairing
//             apps/web/app/layout.tsx already sets.
//
// The composition rules, learned by getting them wrong first:
//
//   Scale     one figure at 55-75% of the frame, not three at 25%. A character
//             the size of an icon reads as an icon.
//   Crop      it bleeds off an edge. A figure floating whole in clear space
//             reads as a sticker sheet.
//   Asymmetry type is left, ranged left, in the space the figure leaves. A
//             centred stack over a centred figure is a slide.
//   Doing     a mood and a prop, never a lineup. `sleepy`, `puffed` and `hold`
//             are the vocabulary CAST.md already built.
//   Hierarchy two faces and three weights. Setting the headline, the subline
//             and the wordmark all in one 800-weight face is the single
//             loudest amateur tell, ahead of any layout mistake.
//   Ground    a halo and a real contact shadow. Without them the figure floats
//             on the wash like a sticker dropped on a desktop.
//
// Rasterised by headless Chrome: the only renderer on this box that reads both
// SVG and a webfont (sharp is not installed, ffmpeg does neither).

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { figureMarkup, GRID, type CastName, type Mood, type Prop } from '../../packages/shared/src/cast'

const SIZES: Record<string, { w: number; h: number }> = {
  post: { w: 1080, h: 1350 },
  story: { w: 1080, h: 1920 },
  square: { w: 1080, h: 1080 },
}

const FLAGS = new Set(['size', 'out', 'only'])
const argv = process.argv.slice(2)
const opts: Record<string, string> = {}
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (!a.startsWith('--')) continue
  const name = a.slice(2)
  if (!FLAGS.has(name)) {
    console.error(`Unknown flag --${name}. Known: ${[...FLAGS].join(', ')}`)
    process.exit(1)
  }
  opts[name] = argv[++i]
}

const SIZE = opts.size ?? 'post'
const OUTDIR = opts.out ?? 'content/out/posts'
const DISPLAY = 'apps/mobile/assets/fonts/Baloo2_800ExtraBold.ttf'
const TEXT: Record<number, string> = {
  400: 'apps/mobile/assets/fonts/Nunito_400.woff2',
  600: 'apps/mobile/assets/fonts/Nunito_600.woff2',
  700: 'apps/mobile/assets/fonts/Nunito_700.woff2',
}
const ICON = 'store/icon-512.png'

if (!SIZES[SIZE]) {
  console.error(`Unknown --size ${SIZE}. Known: ${Object.keys(SIZES).join(', ')}`)
  process.exit(1)
}

// Sampled from store/feature-graphic.png, as scripts/content/cards.mjs does.
const INK = '#1b1a15'
const MUTED = '#6f6862'

/** Each figure's mid ramp stop, for the halo it sits in (cast.ts FIGURES). */
const HALO: Record<CastName, string> = {
  ember: '#ffa51f',
  skye: '#3b9eff',
  plum: '#b06bff',
}

interface Concept {
  key: string
  ground: string
  name: CastName
  mood: Mood
  prop?: Prop
  headline: string
  subline: string
  /** Which edge the figure bleeds off, and how big it is as a share of height. */
  side: 'left' | 'right'
  scale: number
  /** How far past the bottom edge it sinks, as a share of its own size. */
  sink: number
  /** A dark ground flips the type to cream; ink on indigo is unreadable. */
  dark?: boolean
}

// Each one is an idea about eating that stands on its own. None of them names
// a feature, shows a screen, or puts a number on anything.
const CONCEPTS: Concept[] = [
  {
    key: 'night',
    ground: 'content/gen/dsf3_grad_night_00001_.png',
    name: 'plum',
    mood: 'sleepy',
    headline: 'A 1am snack belongs to yesterday',
    subline: 'Your day ends when you sleep, not at midnight.',
    side: 'right',
    scale: 0.6,
    sink: 0.1,
    dark: true,
  },
  {
    key: 'about',
    ground: 'content/gen/dsf2_01_grad_warm_00001_.png',
    name: 'ember',
    mood: 'hold',
    prop: 'toast',
    headline: 'Nobody weighs the toast',
    subline: 'About a slice is a quantity. It still counts.',
    side: 'right',
    scale: 0.56,
    sink: 0.08,
  },
  {
    key: 'bowl',
    ground: 'content/gen/dsf2_01_grad_warm_00001_.png',
    name: 'skye',
    mood: 'hold',
    prop: 'bowl',
    headline: 'You already know what went in the bowl',
    subline: 'You put it there. That is the hard part done.',
    side: 'left',
    scale: 0.58,
    sink: 0.09,
  },
]

const chosen = opts.only ? CONCEPTS.filter((c) => c.key === opts.only) : CONCEPTS
if (!chosen.length) {
  console.error(`No concept "${opts.only}". Known: ${CONCEPTS.map((c) => c.key).join(', ')}`)
  process.exit(1)
}

const { w: W, h: H } = SIZES[SIZE]
mkdirSync(OUTDIR, { recursive: true })

const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => existsSync(p))
if (!CHROME) {
  console.error('No Chrome or Edge found to rasterise with.')
  process.exit(1)
}
for (const p of [DISPLAY, ICON, ...Object.values(TEXT)]) {
  if (!existsSync(p)) {
    console.error(`Missing asset: ${p}`)
    process.exit(1)
  }
}

const url = (p: string) => pathToFileURL(resolve(p)).href

const faces =
  `@font-face{font-family:'Display';src:url('${url(DISPLAY)}') format('truetype');font-weight:800}` +
  Object.entries(TEXT)
    .map(([w, p]) => `@font-face{font-family:'Text';src:url('${url(p)}') format('woff2');font-weight:${w}}`)
    .join('')

let ok = 0
for (const c of chosen) {
  if (!existsSync(c.ground)) {
    console.error(`  ${c.key}  SKIPPED — missing ground ${c.ground}`)
    continue
  }

  const f = figureMarkup(c.name, c.mood, c.key, c.prop)
  const figurePx = Math.round(H * c.scale)
  const headSize = Math.round(W * 0.097)
  const subSize = Math.round(W * 0.0345)

  // The figure sinks past the bottom so the frame crops it, but it only just
  // kisses its own side: a deeper bleed took the held prop off-frame, and the
  // prop is what the headline is about.
  const sideOffset = Math.round(-figurePx * 0.03)
  const bottomOffset = Math.round(-figurePx * c.sink)

  const headColour = c.dark ? '#f7efe6' : INK
  const subColour = c.dark ? 'rgba(247,239,230,0.7)' : MUTED
  const markColour = c.dark ? 'rgba(247,239,230,0.6)' : 'rgba(27,26,21,0.5)'
  const markSide = c.side === 'left' ? 'right' : 'left'

  const html = `<!doctype html>
<html><head><meta charset="utf-8">
<style>
  ${faces}
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${W}px; height: ${H}px; overflow: hidden; }
  body {
    position: relative;
    background-image: url('${url(c.ground)}');
    background-size: cover;
    background-position: center;
    -webkit-font-smoothing: antialiased;
  }
  /* Depth: the wash alone is flat, so the corners fall away a little. */
  .vignette {
    position: absolute; inset: 0;
    background: radial-gradient(120% 90% at 50% 40%, transparent 55%, ${c.dark ? 'rgba(0,0,0,0.38)' : 'rgba(27,26,21,0.10)'} 100%);
  }
  /* Grounding: the figure's own colour pools behind it, and it casts a real
     contact shadow. A 6% ellipse alone left it floating on the wash. */
  .halo {
    position: absolute;
    ${c.side}: ${Math.round(sideOffset - figurePx * 0.12)}px;
    bottom: ${Math.round(bottomOffset - figurePx * 0.1)}px;
    width: ${Math.round(figurePx * 1.28)}px;
    height: ${Math.round(figurePx * 1.28)}px;
    background: radial-gradient(circle at 50% 50%, ${HALO[c.name]}${c.dark ? '3d' : '2e'} 0%, transparent 62%);
  }
  .shadow {
    position: absolute;
    ${c.side}: ${Math.round(sideOffset + figurePx * 0.1)}px;
    bottom: ${Math.round(bottomOffset + figurePx * 0.055)}px;
    width: ${Math.round(figurePx * 0.62)}px;
    height: ${Math.round(figurePx * 0.1)}px;
    border-radius: 50%;
    background: ${c.dark ? 'rgba(0,0,0,0.42)' : 'rgba(27,26,21,0.17)'};
    filter: blur(${Math.round(figurePx * 0.035)}px);
  }
  .figure {
    position: absolute;
    ${c.side}: ${sideOffset}px;
    bottom: ${bottomOffset}px;
    width: ${figurePx}px;
    height: ${figurePx}px;
  }
  .type { position: absolute; top: ${Math.round(H * 0.082)}px; left: ${Math.round(W * 0.078)}px; right: ${Math.round(W * 0.078)}px; }
  h1 {
    font-family: 'Display', system-ui, sans-serif;
    font-weight: 800;
    font-size: ${headSize}px;
    line-height: 0.99;
    color: ${headColour};
    letter-spacing: -0.02em;
    max-width: 11ch;
  }
  /* Nunito at 600 against Baloo2 at 800: two faces, two weights, real
     hierarchy. Both in one face at one weight was the tell. */
  .sub {
    font-family: 'Text', system-ui, sans-serif;
    font-weight: 600;
    font-size: ${subSize}px;
    color: ${subColour};
    line-height: 1.42;
    letter-spacing: 0.002em;
    max-width: 20ch;
    margin-top: ${Math.round(headSize * 0.42)}px;
  }
  /* The signature is the real mark, not the product name typed out. */
  .mark {
    position: absolute;
    bottom: ${Math.round(H * 0.05)}px;
    ${markSide}: ${Math.round(W * 0.078)}px;
    display: flex; align-items: center; gap: ${Math.round(W * 0.016)}px;
  }
  .mark img { width: ${Math.round(W * 0.052)}px; height: ${Math.round(W * 0.052)}px; border-radius: ${Math.round(W * 0.013)}px; }
  .mark span {
    font-family: 'Text', system-ui, sans-serif;
    font-weight: 700;
    font-size: ${Math.round(W * 0.0275)}px;
    color: ${markColour};
    letter-spacing: 0.005em;
  }
</style></head>
<body>
  <div class="halo"></div>
  <div class="vignette"></div>
  <div class="shadow"></div>
  <svg class="figure" viewBox="0 0 ${GRID} ${GRID}" xmlns="http://www.w3.org/2000/svg" overflow="visible">
    <defs>${f.defs}</defs>
    ${f.shapes}
  </svg>
  <div class="type">
    <h1>${c.headline}</h1>
    <div class="sub">${c.subline}</div>
  </div>
  <div class="mark"><img src="${url(ICON)}" alt=""><span>Day So Far</span></div>
</body></html>`

  const htmlPath = join(OUTDIR, `${c.key}-${SIZE}.html`)
  const pngPath = join(OUTDIR, `${c.key}-${SIZE}.png`)
  writeFileSync(htmlPath, html, 'utf8')

  const r = spawnSync(
    CHROME,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      `--window-size=${W},${H}`,
      `--screenshot=${resolve(pngPath)}`,
      url(htmlPath),
    ],
    { encoding: 'utf8' },
  )

  if (existsSync(pngPath)) {
    ok++
    console.log(`  ${c.key.padEnd(6)} ${(statSync(pngPath).size / 1024).toFixed(0).padStart(4)} KB  ${c.name}/${c.mood}${c.prop ? `+${c.prop}` : ''}  ${c.headline}`)
  } else {
    console.error(`  ${c.key.padEnd(6)} FAILED (status ${r.status})\n    ${(r.stderr ?? '').split('\n').slice(-4).join('\n    ')}`)
  }
}

console.log(`\n${ok}/${chosen.length} written to ${OUTDIR}/ at ${W}x${H}`)
process.exit(ok === chosen.length ? 0 : 1)
