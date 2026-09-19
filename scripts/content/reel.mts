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
import { figureMarkup, GRID, type CastName, type Mood, type Prop } from '../../packages/shared/src/cast'

const FLAGS = new Set(['fps', 'out', 'ground', 'music'])
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
/**
 * A moving ground to lay under the type — a ComfyUI render from content/gen/,
 * looped to the film's length. With one set, frames are drawn on transparency
 * and composited; without, they carry the flat CSS field. Texture only, never
 * a subject (§0).
 */
const GROUND = opts.ground
if (GROUND && !existsSync(GROUND)) {
  console.error(`Missing ground: ${GROUND}`)
  process.exit(1)
}
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
  /** Empty on the opening beat, which is a hook rather than an entry. */
  time: string
  line: string
  /** Whoever the meal is mostly made of, as the full stop. */
  name: CastName
  mood: Mood
  prop?: Prop
}

const BEATS: Beat[] = [
  { seconds: 1.6, time: '', line: 'One day.<br>Six sentences.', name: 'skye', mood: 'hop' },
  { seconds: 1.6, time: '08:10', line: 'Toast, two eggs,<br>black coffee', name: 'ember', mood: 'proud' },
  { seconds: 1.6, time: '10:40', line: 'A banana, on the<br>way out the door', name: 'skye', mood: 'hop' },
  { seconds: 1.7, time: '13:30', line: 'Leftover rice and<br>whatever was in<br>the fridge', name: 'skye', mood: 'wave' },
  { seconds: 1.6, time: '16:15', line: 'A teaspoon of honey<br>in the coffee', name: 'plum', mood: 'hold', prop: 'mug' },
  { seconds: 1.7, time: '17:45', line: 'Most of a bar of<br>dark chocolate,<br>standing up', name: 'plum', mood: 'giggle' },
  { seconds: 1.6, time: '21:20', line: 'Beer sausages<br>and a lager', name: 'ember', mood: 'idle' },
]
/**
 * A licensed track to carry the film, in place of the synthesised bed.
 *
 * When one is given **the music sets the length**: the closing card absorbs
 * whatever is left after the sentences, so the picture ends exactly when the
 * track does. Cutting a film to a fixed length and then looping a track into
 * it is what produced the first bad pass — a short track slammed its loud
 * ending into its own silent lead-in, and the last note was chopped mid-phrase.
 * Lap the track to length first (acrossfade), hand the result to `--music`,
 * and nothing is cut.
 */
const MUSIC = opts.music
if (MUSIC && !existsSync(MUSIC)) {
  console.error(`Missing music: ${MUSIC}`)
  process.exit(1)
}

const BEAT_SECONDS = BEATS.reduce((n, b) => n + b.seconds, 0)
/** Seconds of music, read off the file rather than assumed. */
function trackSeconds(p: string): number {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', resolve(p)], { encoding: 'utf8' })
  const d = Number((r.stdout ?? '').trim())
  if (!Number.isFinite(d) || d <= 0) {
    console.error(`Could not read a duration from ${p}`)
    process.exit(1)
  }
  return d
}

const CLOSER = MUSIC ? trackSeconds(MUSIC) - BEAT_SECONDS : 2.4
if (CLOSER < 1.2) {
  console.error(`Music is too short for the storyboard: ${(BEAT_SECONDS + 1.2).toFixed(1)}s needed, track leaves ${CLOSER.toFixed(1)}s for the close.`)
  process.exit(1)
}

const TOTAL = BEAT_SECONDS + CLOSER
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

/* ── sound ──────────────────────────────────────────────────────────── */

// The bed is synthesised here rather than sourced. §0's rule about pulling
// media off the web for marketing is a licensing rule, and it applies harder
// to audio: an unlicensed track on a brand account gets the post muted or
// struck. A trending sound is not an option either — neither the TikTok nor
// the Instagram publishing API can attach one, so anything posted through
// Buffer has to carry its own audio. This is original, free of any licence,
// and regenerates with the film.
//
// A soft chord holds underneath, and each sentence lands on a bell whose
// pitch walks up and then resolves, so the film sounds composed rather than
// ticked. Drop a licensed track into content/music/ and swap it in if you
// would rather have one.

const SAMPLE_RATE = 44100
/** The note each landing rings, walking up and resolving on the close. */
const NOTES = [440.0, 554.37, 659.25, 739.99, 659.25, 554.37, 440.0, 880.0]
/** The chord held underneath: A2, E3, A3, C#4. */
const PAD = [110.0, 164.81, 220.0, 277.18]

function bed(seconds: number, landings: number[]): Buffer {
  const n = Math.ceil(seconds * SAMPLE_RATE)
  const out = new Float64Array(n)

  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE
    let v = 0

    // Pad: quiet, and breathing so it does not sit flat under the type.
    const breathe = 0.85 + 0.15 * Math.sin(2 * Math.PI * 0.12 * t)
    for (let p = 0; p < PAD.length; p++) {
      v += (0.030 / (1 + p * 0.35)) * breathe * Math.sin(2 * Math.PI * PAD[p] * t)
    }

    // Bells: three partials with a fast exponential decay.
    for (let b = 0; b < landings.length; b++) {
      const dt = t - landings[b]
      if (dt < 0 || dt > 3) continue
      const f = NOTES[b % NOTES.length]
      const env = Math.exp(-dt * 3.1) * (1 - Math.exp(-dt * 220))
      v += 0.20 * env * Math.sin(2 * Math.PI * f * dt)
      v += 0.09 * Math.exp(-dt * 4.6) * Math.sin(2 * Math.PI * f * 2 * dt)
      v += 0.04 * Math.exp(-dt * 6.4) * Math.sin(2 * Math.PI * f * 3.01 * dt)
    }

    // Master fades, so it neither clicks in nor stops dead.
    v *= Math.min(1, t / 0.35) * Math.min(1, (seconds - t) / 0.9)
    out[i] = v
  }

  // 16-bit PCM, mono, with a soft limiter rather than hard clipping.
  const data = Buffer.alloc(n * 2)
  for (let i = 0; i < n; i++) {
    const s = Math.tanh(out[i] * 1.1)
    data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(s * 32767))), i * 2)
  }

  const head = Buffer.alloc(44)
  head.write('RIFF', 0)
  head.writeUInt32LE(36 + data.length, 4)
  head.write('WAVE', 8)
  head.write('fmt ', 12)
  head.writeUInt32LE(16, 16)
  head.writeUInt16LE(1, 20)
  head.writeUInt16LE(1, 22)
  head.writeUInt32LE(SAMPLE_RATE, 24)
  head.writeUInt32LE(SAMPLE_RATE * 2, 28)
  head.writeUInt16LE(2, 32)
  head.writeUInt16LE(16, 34)
  head.write('data', 36)
  head.writeUInt32LE(data.length, 40)
  return Buffer.concat([head, data])
}

/* ── one frame ──────────────────────────────────────────────────────── */

const url = (p: string) => pathToFileURL(resolve(p)).href

const faces =
  `@font-face{font-family:'D';src:url('${url(FONTS.display)}') format('truetype');font-weight:800}` +
  `@font-face{font-family:'T';src:url('${url(FONTS.text600)}') format('woff2');font-weight:600}` +
  `@font-face{font-family:'T';src:url('${url(FONTS.text700)}') format('woff2');font-weight:700}` +
  `@font-face{font-family:'M';src:url('${url(FONTS.mono500)}') format('woff2');font-weight:500}`

function figSvg(name: CastName, mood: Mood, prefix: string, prop?: Prop): string {
  const f = figureMarkup(name, mood, prefix, prop)
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
    // The opening beat is a hook, not an entry, so it carries no timestamp —
    // but it keeps the stamp's height so the type does not jump on beat two.
    const stamp = beat.time
      ? `<div class="stamp" style="opacity:${(Math.min(stampIn, out) * 0.85).toFixed(3)}">${beat.time}</div>`
      : `<div class="stamp">&nbsp;</div>`
    body =
      `<div class="wrap" style="opacity:${alpha.toFixed(3)}">` +
      stamp +
      `<div class="line" style="transform:translateY(${((1 - typeIn) * 46).toFixed(1)}px)">` +
      `${beat.line}<span class="stop" style="transform:scale(${figScale.toFixed(3)})">${figSvg(beat.name, beat.mood, `f${i}`, beat.prop)}</span>` +
      `</div></div>`
  } else {
    // Closer: the line, then the mark under it.
    const lineIn = outCubic(closerLocal / 0.5)
    const markIn = outCubic((closerLocal - 0.45) / 0.5)
    body =
      `<div class="wrap">` +
      `<div class="close" style="opacity:${lineIn.toFixed(3)};transform:translateY(${((1 - lineIn) * 40).toFixed(1)}px)">Just say<br>what you ate.</div>` +
      `<div class="mark" style="opacity:${markIn.toFixed(3)};transform:translateY(${((1 - markIn) * 26).toFixed(1)}px)">` +
      `<img src="${url(ICON)}" alt=""><span>Day So Far</span></div>` +
      `</div>`
  }

  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
${faces}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${W}px;height:${H}px;overflow:hidden}
body{background:${GROUND ? 'transparent' : 'linear-gradient(152deg,#f7e0bd 0%,#efe6d2 38%,#dfeadb 72%,#cfe7d8 100%)'};-webkit-font-smoothing:antialiased}
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
      // Over a moving ground the frames have to carry alpha, or the type
      // arrives on an opaque white card and the ground is never seen.
      ...(GROUND ? ['--default-background-color=00000000'] : []),
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

// Each landing rings when its beat's figure springs in, not when the type
// arrives — the sound follows the movement.
const landings: number[] = []
let cursor = 0
for (const b of BEATS) {
  landings.push(cursor + 0.22)
  cursor += b.seconds
}
landings.push(cursor + 0.45)

let wav: string
if (MUSIC) {
  wav = resolve(MUSIC)
} else {
  wav = join(work, 'bed.wav')
  writeFileSync(wav, bed(TOTAL, landings))
}

const mp4 = join(OUTDIR, `typed-day${GROUND ? '-ground' : ''}${MUSIC ? '-music' : ''}.mp4`)
// With a ground: loop it, fit it to the frame, and lay the alpha frames over.
// The ground is usually a few seconds and the film is longer, so it repeats.
const groundArgs = GROUND
  ? [
      '-stream_loop', '-1', '-i', resolve(GROUND),
      '-framerate', String(FPS), '-i', join(work, 'f%04d.png'),
      '-i', wav,
      '-filter_complex',
      `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,format=rgba[bg];` +
        `[bg][1:v]overlay=0:0:format=auto,format=yuv420p[v]`,
      '-map', '[v]', '-map', '2:a',
    ]
  : null

const r = spawnSync(
  'ffmpeg',
  groundArgs
    ? [
        '-v', 'error', '-y',
        ...groundArgs,
        '-c:v', 'libx264', '-crf', '18',
        '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11',
        '-c:a', 'aac', '-b:a', '160k', '-ar', '44100',
        '-t', String(TOTAL), '-movflags', '+faststart',
        resolve(mp4),
      ]
    : [
    '-v', 'error', '-y',
    '-framerate', String(FPS),
    '-i', join(work, 'f%04d.png'),
    '-i', wav,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18',
    // Synthesised at a conservative level, then normalised to roughly what
    // the platforms expect (~-14 LUFS). Raw, the bed lands near -25 dB mean
    // and is inaudible on a phone at half volume.
    '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11',
    '-c:a', 'aac', '-b:a', '160k', '-ar', '44100',
    '-shortest', '-movflags', '+faststart',
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
