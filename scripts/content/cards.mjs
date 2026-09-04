#!/usr/bin/env node
// Branded text cards for Instagram and TikTok, rendered in the app's own
// design system — no diffusion output anywhere near them.
//
//   node scripts/content/cards.mjs                        # all, 1080x1350
//   node scripts/content/cards.mjs --size story           # 1080x1920
//   node scripts/content/cards.mjs --limit 3 --out /tmp/x
//
// Copy lives in content/copy/cards.txt, one card per line:
//
//   headline text | optional smaller second line
//
// Uses store/icon-512.png and the vendored Baloo2 ExtraBold, so a card, the
// Play feature graphic and the web OG image are visibly the same product.

import { spawnSync } from 'node:child_process'
import { readFileSync, existsSync, mkdirSync, writeFileSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'

const SIZES = {
  post: { w: 1080, h: 1350 }, // Instagram feed portrait, the densest slot
  story: { w: 1080, h: 1920 }, // Stories / Reels / TikTok cover
  square: { w: 1080, h: 1080 },
}

const FLAGS = new Set(['copy', 'out', 'size', 'limit', 'font', 'icon', 'maxchars'])
const argv = process.argv.slice(2)
const opts = {}
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

const COPY = opts.copy ?? 'content/copy/cards.txt'
const OUTDIR = opts.out ?? 'content/out/cards'
const SIZE = opts.size ?? 'post'
const LIMIT = Number(opts.limit ?? 0)
const FONT = opts.font ?? 'apps/mobile/assets/fonts/Baloo2_800ExtraBold.ttf'
const ICON = opts.icon ?? 'store/icon-512.png'
const MAXCHARS = Number(opts.maxchars ?? 20)

if (!SIZES[SIZE]) {
  console.error(`Unknown --size ${SIZE}. Known: ${Object.keys(SIZES).join(', ')}`)
  process.exit(1)
}
for (const [label, path] of [['copy', COPY], ['font', FONT], ['icon', ICON]]) {
  if (!existsSync(path)) {
    console.error(`Missing ${label}: ${path}`)
    process.exit(1)
  }
}

// Sampled from store/feature-graphic.png so every asset shares one ground.
const INK = '0x1b1a15'
const CREAM = '0xf7efe6'
const MUTED = '0x8f8880'
const JADE = '0x3ddc97'
const ICON_BG = '0xfff6ec'

const { w: W, h: H } = SIZES[SIZE]

const cards = readFileSync(COPY, 'utf8')
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#'))
  .slice(0, LIMIT || undefined)

if (!cards.length) {
  console.error(`No copy in ${COPY} — one card per line, "headline | subline".`)
  process.exit(1)
}

mkdirSync(OUTDIR, { recursive: true })
console.log(`${cards.length} card(s), ${W}x${H} -> ${OUTDIR}/\n`)

const tmpDir = join(OUTDIR, '.tmp')
mkdirSync(tmpDir, { recursive: true })
let ok = 0

cards.forEach((row, i) => {
  const n = String(i + 1).padStart(2, '0')
  const [headRaw, subRaw = ''] = row.split('|').map((s) => s.trim())
  const dest = join(OUTDIR, `card-${SIZE}-${n}.png`)

  // Scale type to the card rather than the other way round: a long line at a
  // fixed size either overflows the canvas or leaves half of it empty.
  let size = Math.round(W * 0.088)
  let maxchars = MAXCHARS
  let head = wrap(headRaw, maxchars)
  while (head.length > 4) {
    maxchars += 3
    size = Math.round(W * 0.088 * (MAXCHARS / maxchars))
    head = wrap(headRaw, maxchars)
  }
  const step = Math.round(size * 1.16)
  const sub = subRaw ? wrap(subRaw, Math.round(maxchars * 1.45)) : []
  const subSize = Math.round(size * 0.44)
  const subStep = Math.round(subSize * 1.32)

  // Centre headline, rule and subline as one unit. The last line of each run
  // occupies a full line box below its y, so the block is a line taller than
  // the sum of the steps — leaving that out is what parked everything high
  // with a dead half beneath it.
  const ruleGap = Math.round(size * 0.62)
  const blockH =
    head.length * step +
    (sub.length ? ruleGap + sub.length * subStep : 0) +
    Math.round(size * 0.25)
  // Centre in the band actually available — between the logo and the wordmark —
  // not in the whole canvas. Centring on the canvas ignores the two fixed
  // elements and leaves a dead strip along the bottom.
  const iconPx = Math.round(W * 0.155)
  const iconY = Math.round(H * 0.095)
  const markY = H - Math.round(H * 0.075)
  const bandTop = iconY + iconPx + Math.round(H * 0.035)
  const bandBottom = markY - Math.round(H * 0.045)
  let y = Math.round(bandTop + (bandBottom - bandTop - blockH) / 2)

  const draws = []
  head.forEach((line, li) => {
    draws.push(text(line, `card${n}h${li}`, CREAM, size, y + li * step))
  })
  if (sub.length) {
    const ruleY = y + head.length * step + Math.round(ruleGap * 0.35)
    draws.push(
      `drawbox=x=(iw-92)/2:y=${ruleY}:w=92:h=7:color=${JADE}:t=fill`,
    )
    sub.forEach((line, li) => {
      draws.push(
        text(line, `card${n}s${li}`, MUTED, subSize, ruleY + ruleGap + li * subStep),
      )
    })
  }
  // Wordmark, bottom centre, small enough to read as a signature not a title.
  const markSize = Math.round(W * 0.034)
  draws.push(text('Day So Far', `card${n}m`, MUTED, markSize, markY))

  const r = run('ffmpeg', [
    '-v', 'error', '-y',
    '-f', 'lavfi', '-i', `color=c=${INK}:s=${W}x${H}`,
    '-i', ICON,
    '-filter_complex',
    // Both sides forced to rgba before the composite. Mixed formats put the
    // overlay region through a different conversion and it lands one RGB level
    // off the canvas — invisible per pixel, a visible rectangle at the edge.
    `[0:v]format=rgba[bgc];` +
      `[1:v]colorkey=${ICON_BG}:0.08:0.02,scale=${iconPx}:${iconPx},format=rgba[logo];` +
      `[bgc][logo]overlay=x=(W-w)/2:y=${iconY}:format=rgb[bg];` +
      `[bg]${draws.join(',')},format=rgb24[out]`,
    '-map', '[out]', '-frames:v', '1', dest,
  ], true)

  if (r.status === 0) {
    ok++
    console.log(`  ${n}  ${(statSync(dest).size / 1024).toFixed(0).padStart(4)} KB  ${headRaw}`)
  } else {
    console.error(`  ${n}  FAILED  ${headRaw}\n      ${(r.stderr || '').trim().split('\n').slice(-2).join('\n      ')}`)
  }
})

rmSync(tmpDir, { recursive: true, force: true })
console.log(`\n${ok}/${cards.length} written to ${OUTDIR}/`)
process.exit(ok === cards.length ? 0 : 1)

/**
 * Text goes to a file, never into the filter graph. Half of this copy contains
 * apostrophes and colons, which are graph syntax rather than punctuation.
 * One drawtext per line, because a newline makes drawtext draw a .notdef box.
 */
function text(line, key, colour, size, y) {
  const f = join(tmpDir, `${key}.txt`)
  writeFileSync(f, line, 'utf8')
  return (
    `drawtext=fontfile='${esc(FONT)}':textfile='${esc(f)}'` +
    `:fontcolor=${colour}:fontsize=${size}:x=(w-text_w)/2:y=${y}`
  )
}

function wrap(s, max) {
  const out = []
  let line = ''
  for (const word of s.split(/\s+/)) {
    if (!line) line = word
    else if ((line + ' ' + word).length <= max) line += ' ' + word
    else {
      out.push(line)
      line = word
    }
  }
  if (line) out.push(line)
  return out
}

/** Forward slashes and an escaped drive colon survive the filter parser. */
function esc(p) {
  return p.replace(/\\/g, '/').replace(/:/g, '\\:')
}

function run(bin, args, tolerate = false) {
  const r = spawnSync(bin, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
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
