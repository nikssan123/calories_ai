#!/usr/bin/env tsx
// A slideshow's slides, stitched into one vertical MP4.
//
//   npx tsx scripts/content/video.mts                       # every slideshow
//   npx tsx scripts/content/video.mts --only 13-nine-pm
//   npx tsx scripts/content/video.mts --hold 5 --fade 0.5
//
// The cheapest video this repo can make, and the reason to make it: a native
// carousel only reaches people who already follow the account, while the same
// four frames as a video go into TikTok's and Reels' recommendation surfaces,
// which is where an account with no audience has to start. A large share of
// what reads as "slideshow content" on TikTok is exactly this — a video of
// stills — and it is indistinguishable from a carousel to anyone watching.
//
// No new creative input. It consumes what post.mts already rendered and what
// somebody has already approved the look of.
//
// What it deliberately does NOT do:
//
//  * No Ken Burns, no zoom, no drift. The type is the content in this format
//    and moving it while it is being read costs comprehension for motion
//    nobody asked for. The crossfade exists to mark the cut, nothing more.
//  * No voiceover. Kokoro is specified in §4 and a synthetic voice reading a
//    caption aloud is the "this is AI" tell §0 is about.
//  * No music. §488 is right that an auto-published post cannot attach a
//    trending sound, and a royalty-free bed is worse than silence — it says
//    "advertisement" in the first half second.
//
// The silent audio track is not an oversight. Several platforms' ingest paths
// treat a video with no audio stream as malformed rather than as silent, and a
// rejection at publish time lands on a Buffer row hours later where nothing is
// watching. One AAC track of silence costs a few kilobytes.

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/* ── flags ──────────────────────────────────────────────────────────── */

const FLAGS = new Set(['only', 'size', 'dir', 'out', 'hold', 'fade', 'fps'])
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

const SIZE = opts.size ?? 'story'
const DIR = opts.dir ?? 'content/out/posts'
const OUTDIR = opts.out ?? 'content/out/videos'
const FPS = Number(opts.fps ?? 30)

/**
 * Four seconds a slide, and it is a reading speed rather than a taste.
 *
 * A beat slide carries an aside, a claim and a reason — around 130 characters
 * of type at the sizes post.mts sets. Read aloud that is three to four
 * seconds, and a viewer who has not finished reading when the frame changes
 * has been shown the post rather than told it. Three felt brisk in review;
 * five drags on the cover, which is six words.
 */
const HOLD = Number(opts.hold ?? 4)

/**
 * Short, because a long crossfade on static type reads as a mistake — both
 * frames are legible at once and neither can be read.
 */
const FADE = Number(opts.fade ?? 0.4)

if (!(HOLD > FADE)) {
  console.error(`--hold (${HOLD}) must be greater than --fade (${FADE}).`)
  process.exit(1)
}

/* ── gather ─────────────────────────────────────────────────────────── */

if (!existsSync(DIR)) {
  console.error(`No ${DIR}. Render slides first: npx tsx scripts/content/post.mts --size ${SIZE}`)
  process.exit(1)
}

const SLIDE = new RegExp(`^(\\d+-[a-z0-9-]+)-(\\d+)-${SIZE}\\.png$`)

/** Slides grouped by slideshow, in carousel order — the same order they play. */
const groups = new Map<string, { index: number; file: string }[]>()
for (const file of readdirSync(DIR)) {
  const m = SLIDE.exec(file)
  if (!m) continue
  const key = m[1]!
  if (opts.only && !key.startsWith(opts.only)) continue
  const bucket = groups.get(key) ?? []
  bucket.push({ index: Number(m[2]), file })
  groups.set(key, bucket)
}
for (const bucket of groups.values()) bucket.sort((a, b) => a.index - b.index)

if (!groups.size) {
  console.error(`No slides matching ${SLIDE} in ${DIR}/.`)
  process.exit(1)
}

/* ── build ──────────────────────────────────────────────────────────── */

/**
 * The xfade chain.
 *
 * Each still is decoded as a `-loop 1 -t HOLD` input, then folded into the one
 * before it. The k-th transition starts at `k * (HOLD - FADE)`, which is the
 * part worth writing down: xfade *consumes* the overlap from both sides, so
 * offsets accumulate on the shortened length and not on HOLD. Getting that
 * wrong gives a video that is correct at the start and drifts — the last slide
 * either flashes past or sits for twice as long.
 *
 * Total length is therefore `n * HOLD - (n - 1) * FADE`.
 */
function filterChain(n: number): string {
  if (n === 1) return '[0:v]format=yuv420p[v]'
  const parts: string[] = []
  let last = '[0:v]'
  for (let k = 1; k < n; k++) {
    const offset = (k * (HOLD - FADE)).toFixed(3)
    const out = k === n - 1 ? '[vx]' : `[x${k}]`
    parts.push(`${last}[${k}:v]xfade=transition=fade:duration=${FADE}:offset=${offset}${out}`)
    last = out
  }
  parts.push('[vx]format=yuv420p[v]')
  return parts.join(';')
}

mkdirSync(OUTDIR, { recursive: true })
let ok = 0
for (const [key, slides] of [...groups].sort((a, b) => a[0].localeCompare(b[0]))) {
  const inputs: string[] = []
  for (const slide of slides) {
    inputs.push('-loop', '1', '-t', String(HOLD), '-i', join(DIR, slide.file))
  }
  // The silent bed, generated rather than read from a file so nothing has to
  // ship with the repo. Trimmed to the video by -shortest.
  inputs.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100')

  const out = join(OUTDIR, `${key}-${SIZE}.mp4`)
  const res = spawnSync(
    'ffmpeg',
    [
      '-y', '-hide_banner', '-loglevel', 'error',
      ...inputs,
      '-filter_complex', filterChain(slides.length),
      '-map', '[v]',
      '-map', `${slides.length}:a`,
      '-r', String(FPS),
      '-c:v', 'libx264',
      // A slideshow is large flat areas of photograph and hard-edged type, and
      // CRF 20 keeps the type crisp; the default 23 softens pill edges enough
      // to notice at 1080 wide.
      '-crf', '20',
      '-preset', 'medium',
      // yuv420p and the faststart atom, because anything else is a video that
      // plays here and not on somebody's phone.
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      '-c:a', 'aac', '-b:a', '64k', '-shortest',
      out,
    ],
    { encoding: 'utf8' },
  )

  if (res.status !== 0 || !existsSync(out)) {
    console.error(`  ${key.padEnd(22)} FAILED\n    ${(res.stderr ?? res.error?.message ?? '').trim().split('\n').slice(-3).join('\n    ')}`)
    continue
  }
  ok++
  const seconds = slides.length * HOLD - (slides.length - 1) * FADE
  console.log(
    `  ${key.padEnd(22)} ${slides.length} slides  ${seconds.toFixed(1)}s  ${(statSync(out).size / 1024).toFixed(0).padStart(5)} KB`,
  )
}

console.log(`\n${ok}/${groups.size} written to ${OUTDIR}/ at ${FPS}fps`)
process.exit(ok === groups.size ? 0 : 1)
