#!/usr/bin/env tsx
// A meme script and a clip, composited into one vertical video.
//
//   npx tsx scripts/content/memepost.mts                      # every script
//   npx tsx scripts/content/memepost.mts --only 22-homework
//   npx tsx scripts/content/memepost.mts --hold 7 --seek 1
//
// The last rendering step of the meme chain:
//
//   clips.mts   downloads footage         -> content/clips/<set>/<id>.mp4
//   memes.mts   asks the model for lines  -> content/memes/<key>.json
//   memepost.mts composites the two     -> content/out/memes/<key>.mp4   (this)
//   the panel   upload, approve, schedule
//
// HOW THE TYPE IS DRAWN
//
// Headless Chrome, to a transparent PNG, which ffmpeg then lays over the clip.
// Not `drawtext`, for two reasons. The core homebrew ffmpeg is built without
// freetype so drawtext is simply missing — a lesson this repo has already paid
// for once in cards.mjs — and more importantly the typography here has to match
// post.mts, which means the real fonts, real letter-spacing and real line
// breaking. A browser already does all three.
//
// NO DARKENING BAND
//
// The first version dimmed a rectangle behind the type with `drawbox` so white
// text would survive a bright sky. It reads as a box pasted onto the footage,
// which is exactly the amateur tell the format cannot afford, and it was
// rejected on sight. Legibility comes from the type instead: a thin dark stroke
// under the glyphs plus a stack of soft shadows, which is what a real meme edit
// does. The footage stays untouched.

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

/* ── flags ──────────────────────────────────────────────────────────── */

const FLAGS = new Set(['only', 'dir', 'clips', 'out', 'hold', 'seek', 'fps', 'keep-layers'])
const BOOL = new Set(['keep-layers'])
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
  opts[name] = BOOL.has(name) ? 'true' : argv[++i]
}

const SCRIPTS = opts.dir ?? 'content/memes'
const CLIPDIR = opts.clips ?? 'content/clips'
const OUTDIR = opts.out ?? 'content/out/memes'
const FPS = Number(opts.fps ?? 30)

/**
 * Eight seconds.
 *
 * Long enough that the loop is not obvious and the viewer reads the line twice,
 * short enough to hold a watch-through — which is the only metric that decides
 * whether this format reaches anyone. Under six the line has not landed before
 * it restarts; past twelve a static frame with no cut starts to feel broken.
 */
const HOLD = Number(opts.hold ?? 8)

/**
 * Half a second in, by default.
 *
 * Stock clips routinely open on a settling frame — a camera still finding
 * focus, a hand entering the shot — and the first frame is the one the platform
 * uses as the thumbnail. Half a second past it costs nothing.
 */
const SEEK = Number(opts.seek ?? 0.5)

const W = 1080
const H = 1920

/* ── the scripts ────────────────────────────────────────────────────── */

interface MemeScript {
  key: string
  clip: string
  hook: string
  sub?: string
}

if (!existsSync(SCRIPTS)) {
  console.error(`No ${SCRIPTS}. Write some with: npx tsx scripts/content/memes.mts`)
  process.exit(1)
}

const scripts: MemeScript[] = readdirSync(SCRIPTS)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((file) => {
    const raw = JSON.parse(readFileSync(join(SCRIPTS, file), 'utf8')) as MemeScript
    if (!raw.key || !raw.hook || !raw.clip) {
      console.error(`${join(SCRIPTS, file)}: needs key, clip and hook`)
      process.exit(1)
    }
    return raw
  })
  .filter((s) => (opts.only ? s.key.startsWith(opts.only) : true))

if (!scripts.length) {
  console.error(`No meme scripts in ${SCRIPTS}/${opts.only ? ` matching ${opts.only}` : ''}.`)
  process.exit(1)
}

/* ── clip allocation ────────────────────────────────────────────────── */

/**
 * One clip per script, and never the same clip twice.
 *
 * The same shape as stockGrounds in post.mts, and for the same reason: two
 * videos in a feed built on one piece of footage reads as the account posting
 * the same thing twice. Offset by the script's own key so the choice is stable
 * across runs — a re-render after a copy edit keeps the footage it was judged
 * on — then walk forward past anything already taken.
 */
const taken = new Set<string>()

function pickClip(set: string, seed: string): string | null {
  const dir = join(CLIPDIR, set)
  if (!existsSync(dir)) return null
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.mp4'))
    .sort()
  if (!files.length) return null

  let offset = 0
  for (const ch of seed) offset = (offset + ch.charCodeAt(0)) % files.length

  for (let step = 0; step < files.length * 2; step++) {
    const path = join(dir, files[(offset + step) % files.length]!)
    if (taken.has(path) && step < files.length) continue
    taken.add(path)
    return path
  }
  return null
}

/* ── the type layer ─────────────────────────────────────────────────── */

const url = (p: string) => pathToFileURL(resolve(p)).href

const FONTS = {
  display: 'apps/mobile/assets/fonts/Baloo2_800ExtraBold.ttf',
  text700: 'apps/mobile/assets/fonts/Nunito_700.woff2',
}
const ICON = 'apps/mobile/assets/icon.png'

/**
 * The mark reads the domain, not the name.
 *
 * "Day So Far" is a stock English phrase, so it cannot be searched: a web
 * search for it returns MyFitnessPal, Cronometer and eight other trackers and
 * no mention of this app. The Play listing — "Day So Far: Calorie Counter" —
 * ranks first for `day so far calorie`, but only for somebody who already
 * knows to type it.
 *
 * On TikTok there is no clickable link at all until a thousand followers, and
 * a caption URL is not tappable on either TikTok or Instagram. The pixels in
 * the frame are the one channel that is not gated, so they carry the address
 * rather than the name. The domain IS the brand, so nothing is lost to recall.
 */
const MARK = 'daysofar.com'


/**
 * The hook sits in the upper third, not centred.
 *
 * Centred type lands on the subject's face or body, which is the part of the
 * frame doing the emotional work. Above it the line reads first and the figure
 * reads second, which is the order the format wants — and it clears the caption
 * and UI furniture both platforms overlay along the bottom.
 */
/**
 * Shrink the hook until its longest line fits on one line.
 *
 * The <br>s in a hook are the writer's line breaks and they mean something —
 * the beat falls where the break is. At a fixed 96px a long line wraps anyway
 * and leaves an orphan: "9pm and i'm doing / archaeology on my own / lunch"
 * rendered as four lines with `own` alone on the third, which reads as a
 * mistake because it is one.
 *
 * So the size follows the longest line rather than the line count. 0.52em per
 * character is measured off Baloo ExtraBold at these sizes — close enough that
 * the result never wraps, and a little conservative on a line of narrow
 * letters, which costs nothing.
 */
function hookSize(hook: string): number {
  const longest = Math.max(...hook.split('<br>').map((line) => line.trim().length))
  const room = W - 140
  return Math.max(58, Math.min(96, Math.floor(room / (longest * 0.52))))
}

function layerHtml(script: MemeScript): string {
  const sub = script.sub ? `<div class="sub">${script.sub}</div>` : ''
  const size = hookSize(script.hook)
  return `<!doctype html><meta charset="utf-8"><style>
@font-face{font-family:'D';src:url('${url(FONTS.display)}') format('truetype');font-weight:800}
@font-face{font-family:'T';src:url('${url(FONTS.text700)}') format('woff2');font-weight:700}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${W}px;height:${H}px;background:transparent}
body{position:relative;-webkit-font-smoothing:antialiased}
.wrap{position:absolute;left:0;right:0;top:300px;padding:0 70px;text-align:center}
/* A dark stroke under the glyph plus three shadows at rising blur. Survives a
   white sky and a black doorway without touching the footage. paint-order keeps
   the stroke behind the fill so the letterforms stay their real weight. */
.hook{font-family:'D',sans-serif;font-weight:800;font-size:${size}px;line-height:1.14;color:#fff;
  letter-spacing:-.02em;-webkit-text-stroke:2px rgba(0,0,0,.55);paint-order:stroke fill;
  text-shadow:0 2px 4px rgba(0,0,0,.95),0 6px 24px rgba(0,0,0,.8),0 12px 48px rgba(0,0,0,.6)}
/* The sub was 44px with a 1px stroke and it vanished — it sits lower in the
   frame than the hook, which is where the footage is busiest, and on a white
   kitchen or a laid table it simply was not there. Bigger, the same stroke
   weight as the hook, and the display face rather than the text face: at this
   size Nunito's thinner strokes are what disappear first. */
.sub{margin-top:40px;font-family:'D',sans-serif;font-weight:800;font-size:56px;line-height:1.24;
  color:#fff;letter-spacing:-.01em;-webkit-text-stroke:2px rgba(0,0,0,.6);paint-order:stroke fill;
  text-shadow:0 2px 4px rgba(0,0,0,.95),0 6px 22px rgba(0,0,0,.85),0 12px 44px rgba(0,0,0,.6)}
.mark{position:absolute;left:70px;bottom:120px;display:flex;align-items:center;gap:18px}
.mark img{width:64px;height:64px;border-radius:16px}
.mark span{font-family:'T',sans-serif;font-weight:700;font-size:38px;color:#fff;
  text-shadow:0 2px 10px rgba(0,0,0,.85)}
</style>
<div class="wrap"><div class="hook">${script.hook}</div>${sub}</div>
<div class="mark"><img src="${url(ICON)}"><span>${MARK}</span></div>`
}

/** Same list as post.mts, macOS first — this only ever runs on the Mac. */
const CHROME = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].find(existsSync)

if (!CHROME) {
  console.error('No Chrome found. The type is drawn by a browser; see the note at the top.')
  process.exit(1)
}

function drawLayer(script: MemeScript, dir: string): string {
  const page = join(dir, `${script.key}.html`)
  const png = join(dir, `${script.key}.png`)
  writeFileSync(page, layerHtml(script))
  const r = spawnSync(
    CHROME!,
    [
      '--headless',
      '--disable-gpu',
      '--hide-scrollbars',
      // Transparent, or the PNG arrives with an opaque white field and the
      // overlay hides the clip completely.
      '--default-background-color=00000000',
      `--window-size=${W},${H}`,
      `--screenshot=${png}`,
      pathToFileURL(page).href,
    ],
    { encoding: 'utf8' },
  )
  if (!existsSync(png)) {
    throw new Error(`Chrome wrote no PNG for ${script.key}: ${r.stderr?.slice(0, 300)}`)
  }
  return png
}

/* ── composite ──────────────────────────────────────────────────────── */

function composite(clip: string, layer: string, out: string, seconds: number): void {
  const r = spawnSync(
    'ffmpeg',
    [
      '-hide_banner',
      '-v',
      'error',
      '-y',
      // Loop the footage rather than freeze on its last frame: a clip shorter
      // than HOLD is common and a frozen tail looks like a stall.
      '-stream_loop',
      '-1',
      '-ss',
      String(SEEK),
      '-i',
      clip,
      '-i',
      layer,
      // Every input before any output option, or ffmpeg reads -map as an input
      // option and refuses the lavfi url.
      '-f',
      'lavfi',
      '-i',
      'anullsrc=channel_layout=stereo:sample_rate=44100',
      '-filter_complex',
      // Fill the frame and crop the overflow — never letterbox. Then the type.
      `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,fps=${FPS}[bg];` +
        `[bg][1:v]overlay=0:0:format=auto[v]`,
      '-map',
      '[v]',
      '-map',
      '2:a',
      '-t',
      String(seconds),
      '-c:v',
      'libx264',
      '-preset',
      'medium',
      '-crf',
      '20',
      '-pix_fmt',
      'yuv420p',
      // The silent track is not an oversight: several platforms' ingest treats
      // a video with no audio stream as malformed rather than as silent, and
      // that rejection lands on a Buffer row hours later where nothing is
      // watching. A few kilobytes. See the same note in video.mts.
      '-c:a',
      'aac',
      '-b:a',
      '64k',
      '-movflags',
      '+faststart',
      out,
    ],
    { encoding: 'utf8' },
  )
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr?.slice(0, 500)}`)
}

/* ── run ────────────────────────────────────────────────────────────── */

mkdirSync(OUTDIR, { recursive: true })
const layerDir = join(OUTDIR, '_layers')
mkdirSync(layerDir, { recursive: true })

let ok = 0
for (const script of scripts) {
  const clip = pickClip(script.clip, script.key)
  if (!clip) {
    console.error(
      `  ${script.key.padEnd(24)} no clips in ${join(CLIPDIR, script.clip)}/ — ` +
        `run: npx tsx scripts/content/clips.mts --set ${script.clip}`,
    )
    continue
  }
  try {
    const layer = drawLayer(script, layerDir)
    const out = join(OUTDIR, `${script.key}.mp4`)
    composite(clip, layer, out, HOLD)
    const kb = (statSync(out).size / 1024).toFixed(0)
    console.log(
      `  ${script.key.padEnd(24)} ${script.clip.padEnd(8)} ${HOLD}s ${kb.padStart(5)} KB  ` +
        `${clip.replace(`${CLIPDIR}/`, '')}`,
    )
    ok++
  } catch (error) {
    console.error(`  ${script.key.padEnd(24)} ${(error as Error).message}`)
  }
}

console.log(`\n${ok}/${scripts.length} written to ${OUTDIR}/ at ${W}x${H}`)
if (ok && opts['keep-layers'] !== 'true') {
  console.log(`Type layers kept in ${layerDir}/ — delete them freely, they re-render.`)
}
console.log('Upload through /admin/social — the file picker takes .mp4.')
