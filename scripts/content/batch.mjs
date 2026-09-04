#!/usr/bin/env node
// One capture, many hooks — the batch driver CONTENT_ENGINE.md §6 asks for.
//
//   node scripts/content/batch.mjs content/raw/scan.mp4
//   node scripts/content/batch.mjs content/raw/scan.mp4 --music content/music/bed.mp3
//   node scripts/content/batch.mjs content/raw/scan.mp4 --limit 3 --hook-seconds 2.5
//
// Reads content/hooks/hooks.txt and writes one ready-to-post 1080x1920 mp4 per
// hook into content/out/. No dependencies beyond ffmpeg/ffprobe on PATH.
//
// Not automated here: whisper captions (§6 step 3) and Kokoro voiceover
// (step 4). Both are Mac-only installs in that doc and neither is on this box.
// They belong between the hook overlay and the export stage when they land.

import { spawnSync } from 'node:child_process'
import { readFileSync, existsSync, mkdirSync, writeFileSync, rmSync, readdirSync, statSync } from 'node:fs'
import { join, basename, extname } from 'node:path'

const FLAGS = new Set([
  'hooks', 'out', 'music', 'fps', 'limit', 'hook-seconds', 'fontsize', 'maxchars', 'font', 'line-spacing',
])

// Walk the argv once rather than guessing: anything after a known --flag is
// that flag's value, and the first bare token left over is the source.
const argv = process.argv.slice(2)
const opts = {}
const positional = []
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a.startsWith('--')) {
    const name = a.slice(2)
    if (!FLAGS.has(name)) {
      console.error(`Unknown flag --${name}. Known: ${[...FLAGS].join(', ')}`)
      process.exit(1)
    }
    opts[name] = argv[++i]
  } else {
    positional.push(a)
  }
}

const source = positional[0]
const HOOKS = opts.hooks ?? 'content/hooks/hooks.txt'
const OUTDIR = opts.out ?? 'content/out'
const MUSIC = opts.music ?? null
const FPS = Number(opts.fps ?? 30)
const LIMIT = Number(opts.limit ?? 0)
// §6 says "first 3 frames" — the hook has to be legible the instant the clip
// appears in the feed. It stays up this long; 0 means for the whole clip.
const HOOK_SECONDS = Number(opts['hook-seconds'] ?? 0)
const FONTSIZE = Number(opts.fontsize ?? 78)
const MAXCHARS = Number(opts.maxchars ?? 18)
const FONT = opts.font ?? 'C:/Windows/Fonts/ariblk.ttf'
const LINE_SPACING = Number(opts['line-spacing'] ?? 12)

if (!source || !existsSync(source)) {
  console.error('Usage: node scripts/content/batch.mjs <source.mp4> [--hooks f] [--out d]')
  console.error('       [--music f] [--fps 30] [--limit N] [--hook-seconds S]')
  if (source) {
    console.error(`\nNo such file: ${source}`)
  } else {
    const raw = 'content/raw'
    const have = existsSync(raw)
      ? readdirSync(raw).filter((f) => /\.(mp4|mov|webm|mkv)$/i.test(f))
      : []
    console.error(
      have.length
        ? `\nIn ${raw}/: ${have.join(', ')}`
        : `\n${raw}/ is empty. That directory is the source of truth (§6) — put a\n` +
            `screen recording of the app in it. Nothing generated substitutes for it.`,
    )
  }
  process.exit(1)
}
if (!existsSync(FONT)) {
  console.error(`Font not found: ${FONT}\nPass --font <path to a heavy .ttf>`)
  process.exit(1)
}
if (MUSIC && !existsSync(MUSIC)) {
  console.error(`Music bed not found: ${MUSIC}`)
  process.exit(1)
}

const hooks = readFileSync(HOOKS, 'utf8')
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#'))
  .slice(0, LIMIT || undefined)

if (!hooks.length) {
  console.error(`No hooks in ${HOOKS} — one per line, # comments ignored.`)
  process.exit(1)
}

const probe = JSON.parse(
  run('ffprobe', [
    '-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', source,
  ]).stdout,
)
const v = probe.streams.find((s) => s.codec_type === 'video')
const hasAudio = probe.streams.some((s) => s.codec_type === 'audio')
if (!v) {
  console.error(`${source} has no video stream.`)
  process.exit(1)
}

console.log(
  `Source: ${v.width}x${v.height} ${fps(v.r_frame_rate)}fps ` +
    `${Number(probe.format.duration).toFixed(1)}s, audio: ${hasAudio ? 'yes' : 'none'}`,
)
if (v.height / v.width < 1.2) {
  console.log(
    `Note: source is not portrait. Cover-cropping to 9:16 will cut the sides —\n` +
      `      record vertically for the full frame.`,
  )
}
console.log(`${hooks.length} hook(s) -> ${OUTDIR}/\n`)

mkdirSync(OUTDIR, { recursive: true })
const slug = basename(source, extname(source)).replace(/[^a-z0-9]+/gi, '-').toLowerCase()
const tmp = join(OUTDIR, '.hooktext.tmp')
const tmpFiles = []

let ok = 0
hooks.forEach((hook, i) => {
  const n = String(i + 1).padStart(2, '0')
  const dest = join(OUTDIR, `${slug}-${n}.mp4`)

  // drawtext does not wrap, and feeding it a newline makes it both break the
  // line AND draw a .notdef box for the LF itself. So each wrapped line gets
  // its own drawtext at a computed y instead — no newline ever reaches the
  // filter. Writing each line to a file also keeps apostrophes and colons out
  // of the graph, where they are syntax rather than punctuation.
  const lines = wrap(hook, MAXCHARS)
  const enable = HOOK_SECONDS > 0 ? `:enable='lte(t,${HOOK_SECONDS})'` : ''
  const step = FONTSIZE + LINE_SPACING
  const drawtexts = lines.map((line, li) => {
    const lineFile = `${tmp}.${li}`
    tmpFiles.push(lineFile)
    writeFileSync(lineFile, line, 'utf8')
    return (
      `drawtext=fontfile='${escapeFilterPath(FONT)}'` +
      `:textfile='${escapeFilterPath(lineFile)}'` +
      `:fontcolor=white:fontsize=${FONTSIZE}` +
      `:borderw=10:bordercolor=black@0.92` +
      `:shadowcolor=black@0.55:shadowx=0:shadowy=6` +
      `:x=(w-text_w)/2:y=h*0.13+${li * step}${enable}`
    )
  })

  const vf = [
    'scale=1080:1920:force_original_aspect_ratio=increase:flags=lanczos',
    'crop=1080:1920',
    `fps=${FPS}`,
    ...drawtexts,
  ].join(',')

  // Second input is either the music bed or silence, so every output carries an
  // audio track — a video-only mp4 is the kind of thing a platform rejects late.
  const secondInput = MUSIC
    ? ['-i', MUSIC]
    : ['-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100']

  const filterComplex = []
  const maps = []
  if (MUSIC && hasAudio) {
    filterComplex.push(
      '[1:a]volume=-18dB[bed];[0:a][bed]amix=inputs=2:duration=first:dropout_transition=0[aout]',
    )
    maps.push('-map', '0:v', '-map', '[aout]')
  } else if (MUSIC) {
    filterComplex.push('[1:a]volume=-18dB[aout]')
    maps.push('-map', '0:v', '-map', '[aout]')
  } else if (hasAudio) {
    maps.push('-map', '0:v', '-map', '0:a')
  } else {
    maps.push('-map', '0:v', '-map', '1:a')
  }

  const r = run(
    'ffmpeg',
    [
      '-v', 'error', '-y',
      '-i', source,
      ...secondInput,
      ...(filterComplex.length ? ['-filter_complex', filterComplex.join(';')] : []),
      '-vf', vf,
      ...maps,
      '-c:v', 'libx264', '-profile:v', 'high', '-level', '4.0', '-pix_fmt', 'yuv420p',
      '-preset', 'slow', '-b:v', '8M', '-maxrate', '10M', '-bufsize', '16M',
      '-c:a', 'aac', '-b:a', '128k',
      '-shortest', '-movflags', '+faststart',
      dest,
    ],
    true,
  )

  if (r.status === 0) {
    ok++
    console.log(`  ${n}  ${mb(dest)}  "${hook}"`)
  } else {
    const tail = (r.stderr || '').trim().split('\n').slice(-3).join('\n      ')
    console.error(`  ${n}  FAILED  "${hook}"\n      ${tail}`)
  }
})

for (const f of tmpFiles) rmSync(f, { force: true })
console.log(`\n${ok}/${hooks.length} written to ${OUTDIR}/`)
process.exit(ok === hooks.length ? 0 : 1)

/** Greedy wrap into an array of lines; the caller draws one per drawtext. */
function wrap(text, max) {
  const lines = []
  let line = ''
  for (const word of text.split(/\s+/)) {
    if (!line) line = word
    else if ((line + ' ' + word).length <= max) line += ' ' + word
    else {
      lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  return lines
}

/**
 * A Windows path inside a filter graph carries a drive colon, which the parser
 * reads as an option separator. Forward slashes plus an escaped colon is the
 * form that survives the graph.
 */
function escapeFilterPath(p) {
  return p.replace(/\\/g, '/').replace(/:/g, '\\:')
}

/** ffprobe reports frame rate as the fraction "30000/1001", not a number. */
function fps(rate) {
  const [num, den] = String(rate).split('/')
  const n = Number(num) / (Number(den) || 1)
  return Number.isFinite(n) ? n.toFixed(0) : '?'
}

function run(bin, args, tolerate = false) {
  const r = spawnSync(bin, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (r.error) {
    console.error(`${bin} not on PATH? ${r.error.message}`)
    process.exit(1)
  }
  if (r.status !== 0 && !tolerate) {
    console.error(`${bin} failed:\n${r.stderr}`)
    process.exit(1)
  }
  return r
}

function mb(file) {
  return (statSync(file).size / 1048576).toFixed(1).padStart(5) + ' MB'
}
