#!/usr/bin/env tsx
// A promotional reel, rendered from the cast's own geometry.
//
//   npx tsx scripts/content/reel.mts
//   npx tsx scripts/content/reel.mts --fps 24 --out content/out/reels
//
// The film is `02-typed-day` in motion: a day arriving one sentence at a time,
// each one closed by whichever character the meal is mostly made of, standing
// in as the full stop. It is the one idea off the layout board that only works
// because the mascots are the macros — Ember is protein, Skye carbs, Plum fat
// (CAST.md) — so the punctuation is carrying information, not decoration.
//
// Why frames rather than a diffusion model: the cast is exact geometry, and a
// video model would redraw it as its own guess at a cute blob. Every frame here
// is the same `figureMarkup()` the phone, the widget and the site draw. It is
// also the only thing the rig can actually do — `legs` is empty unless sitting
// and there is one independent arm, so there are no walk cycles here, only
// scale, hop, squash and type. Motion that the drawing supports, and no more.
//
// How it runs: each frame is a deterministic HTML document (no CSS animation —
// the pose is computed for frame N), screenshotted by headless Chrome, then
// assembled by ffmpeg. Chrome start-up dominates, so a six-second film is a
// few minutes of wall clock.

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { figureMarkup, GRID, type CastName, type Mood } from '../../packages/shared/src/cast'

const FLAGS = new Set(['fps', 'out'])
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

const FPS = Number(opts.fps ?? 24)
const OUTDIR = opts.out ?? 'content/out/reels'
const W = 1080
const H = 1920

const FONTS = {
  display: 'apps/mobile/assets/fonts/Baloo2_800ExtraBold.ttf',
  text600: 'apps/mobile/assets/fonts/Nunito_600.woff2',
  text700: 'apps/mobile/assets/fonts/Nunito_700.woff2',
  mono500: 'apps/mobile/assets/fonts/PlexMono_500.woff2',
}
const ICON = 'store/icon-512.png'

const INK = '#1b1a15'
const MUTED = '#6f6862'
const JADE = '#0f9a5a'

/* ── storyboard ─────────────────────────────────────────────────────── */

interface Beat {
  /** Seconds this beat holds the screen. */
  seconds: number
  time: string
  line: string
  /** Whoever the meal is mostly made of, as the full stop. */
  name: CastName
  mood: Mood
}

const BEATS: Beat[] = [
  { seconds: 1.5, time: '08:10', line: 'Toast, two eggs,<br>black coffee', name: 'ember', mood: 'proud' },
  { seconds: 1.5, time: '13:30', line: 'Leftover rice and<br>whatever was in<br>the fridge', name: 'skye', mood: 'wave' },
  { seconds: 1.5, time: '17:45', line: 'Most of a bar of<br>dark chocolate,<br>standing up', name: 'plum', mood: 'giggle' },
  { seconds: 1.5, time: '21:20', line: 'Beer sausages<br>and a lager', name: 'plum', mood: 'idle' },
]
const CLOSER = 1.8

const TOTAL = BEATS.reduce((n, b) => n + b.seconds, 0) + CLOSER
const FRAMES = Math.round(TOTAL * FPS)

/* ── easing ─────────────────────────────────────────────────────────── */

const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t)
const outCubic = (t: number) => 1 - Math.pow(1 - clamp01(t), 3)
/** Overshoots past 1 and settles — the squash the cast's own springs use. */
function outBack(t: number): number {
  const c = 1.9
  const x = clamp01(t) - 1
  return 1 + (c + 1) * x * x * x + c * x * x
}

/* ── one frame ──────────────────────────────────────────────────────── */

const url = (p: string) => pathToFileURL(resolve(p)).href

const faces =
  `@font-face{font-family:'D';src:url('${url(FONTS.display)}') format('truetype');font-weight:800}` +
  `@font-face{font-family:'T';src:url('${url(FONTS.text600)}') format('woff2');font-weight:600}` +
  `@font-face{font-family:'T';src:url('${url(FONTS.text700)}') format('woff2');font-weight:700}` +
  `@font-face{font-family:'M';src:url('${url(FONTS.mono500)}') format('woff2');font-weight:500}`

function figSvg(name: CastName, mood: Mood, prefix: string): string {
  const f = figureMarkup(name, mood, prefix)
  return `<svg viewBox="0 0 ${GRID} ${GRID}" xmlns="http://www.w3.org/2000/svg"><defs>${f.defs}</defs>${f.shapes}</svg>`
}

function frameHtml(i: number): string {
  const t = i / FPS

  // Which beat owns this frame, and how far into it we are.
  let acc = 0
  let beat: Beat | null = null
  let local = 0
  for (const b of BEATS) {
    if (t < acc + b.seconds) {
      beat = b
      local = t - acc
      break
    }
    acc += b.seconds
  }
  const closerLocal = beat ? -1 : t - acc

  let body = ''

  if (beat) {
    // Type rises and fades in; the figure lands a beat later with a spring.
    // These are deliberately quick: at 1.5s a beat, a slow in and out leaves
    // well under half a second at full opacity and the film reads as a flicker
    // rather than a sentence.
    const typeIn = outCubic(local / 0.3)
    const stampIn = outCubic((local - 0.06) / 0.26)
    const figIn = outBack((local - 0.22) / 0.42)
    // The last 0.16s of a beat carries everything back out.
    const out = 1 - outCubic((local - (beat.seconds - 0.16)) / 0.16)
    const alpha = Math.min(typeIn, out)

    const figScale = Math.max(0, figIn)
    body =
      `<div class="wrap" style="opacity:${alpha.toFixed(3)}">` +
      `<div class="stamp" style="opacity:${(Math.min(stampIn, out) * 0.85).toFixed(3)}">${beat.time}</div>` +
      `<div class="line" style="transform:translateY(${((1 - typeIn) * 46).toFixed(1)}px)">` +
      `${beat.line}<span class="stop" style="transform:scale(${figScale.toFixed(3)})">${figSvg(beat.name, beat.mood, `f${i}`)}</span>` +
      `</div></div>`
  } else {
    // Closer: the line, then the mark under it.
    const lineIn = outCubic(closerLocal / 0.5)
    const markIn = outCubic((closerLocal - 0.45) / 0.5)
    body =
      `<div class="wrap">` +
      `<div class="close" style="opacity:${lineIn.toFixed(3)};transform:translateY(${((1 - lineIn) * 40).toFixed(1)}px)">A day is four sentences.</div>` +
      `<div class="mark" style="opacity:${markIn.toFixed(3)};transform:translateY(${((1 - markIn) * 26).toFixed(1)}px)">` +
      `<img src="${url(ICON)}" alt=""><span>Day So Far</span></div>` +
      `</div>`
  }

  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
${faces}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${W}px;height:${H}px;overflow:hidden}
body{background:linear-gradient(152deg,#f7e0bd 0%,#efe6d2 38%,#dfeadb 72%,#cfe7d8 100%);-webkit-font-smoothing:antialiased}
.wrap{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;padding:0 96px}
.stamp{font-family:'M',monospace;font-weight:500;font-size:34px;letter-spacing:.14em;color:${MUTED};margin-bottom:34px}
.line{font-family:'D',sans-serif;font-weight:800;font-size:104px;line-height:1.06;letter-spacing:-.028em;color:${INK}}
.stop{display:inline-block;width:112px;height:112px;vertical-align:-24px;margin-left:8px;transform-origin:50% 80%}
.stop svg{width:100%;height:100%;overflow:visible}
.close{font-family:'D',sans-serif;font-weight:800;font-size:96px;line-height:1.04;letter-spacing:-.028em;color:${INK}}
.mark{display:flex;align-items:center;gap:26px;margin-top:64px}
.mark img{width:76px;height:76px;border-radius:20px;display:block}
.mark span{font-family:'T',sans-serif;font-weight:700;font-size:38px;color:${MUTED}}
</style></head><body>${body}</body></html>`
}

/* ── render ─────────────────────────────────────────────────────────── */

const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => existsSync(p))
if (!CHROME) {
  console.error('No Chrome or Edge found to rasterise with.')
  process.exit(1)
}
for (const f of [...Object.values(FONTS), ICON]) {
  if (!existsSync(f)) {
    console.error(`Missing asset: ${f}`)
    process.exit(1)
  }
}

mkdirSync(OUTDIR, { recursive: true })
// Frames and Chrome's profile are scratch, and they live in the OS temp dir
// rather than under content/out/. Keeping them in the output tree meant a
// stale Chrome profile survived between runs — the directory could not be
// cleared — and every launch then died on the profile lock with status 21 and
// no stderr, which reads as "no frames rendered" rather than as the real
// fault. Only the finished mp4 belongs in content/out/.
const work = join(tmpdir(), 'dsf-reel-frames')
rmSync(work, { recursive: true, force: true })
mkdirSync(work, { recursive: true })
const profile = join(work, 'chrome-profile')

console.log(`${TOTAL.toFixed(1)}s @ ${FPS}fps = ${FRAMES} frames, ${W}x${H}`)

let rendered = 0
for (let i = 0; i < FRAMES; i++) {
  const html = join(work, `f${String(i).padStart(4, '0')}.html`)
  const png = join(work, `f${String(i).padStart(4, '0')}.png`)
  writeFileSync(html, frameHtml(i), 'utf8')
  const shot = spawnSync(
    CHROME,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      `--user-data-dir=${profile}`,
      `--window-size=${W},${H}`,
      `--screenshot=${resolve(png)}`,
      url(html),
    ],
    { encoding: 'utf8' },
  )
  if (existsSync(png)) rendered++
  else if (rendered === 0 && i < 3) {
    // Report the real reason rather than counting silently to zero.
    console.error(`  frame ${i} produced no png (status ${shot.status})`)
    if (shot.error) console.error(`    spawn error: ${shot.error.message}`)
    const err = (shot.stderr ?? '').trim()
    if (err) console.error(`    stderr: ${err.split('\n').slice(-4).join('\n            ')}`)
  }
  if ((i + 1) % 20 === 0 || i === FRAMES - 1) console.log(`  ${i + 1}/${FRAMES}  (${rendered} written)`)
}

if (rendered < FRAMES) {
  console.error(`Only ${rendered}/${FRAMES} frames rendered — not assembling.`)
  process.exit(1)
}

const mp4 = join(OUTDIR, 'typed-day.mp4')
const r = spawnSync(
  'ffmpeg',
  [
    '-v', 'error', '-y',
    '-framerate', String(FPS),
    '-i', join(work, 'f%04d.png'),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18',
    '-movflags', '+faststart',
    resolve(mp4),
  ],
  { encoding: 'utf8' },
)

if (!existsSync(mp4)) {
  console.error(`ffmpeg failed:\n${(r.stderr ?? '').trim()}`)
  process.exit(1)
}

rmSync(work, { recursive: true, force: true })
console.log(`\n${(statSync(mp4).size / 1024 / 1024).toFixed(1)} MB -> ${mp4}`)
