#!/usr/bin/env tsx
// Rendered posts, into the admin panel's queue.
//
//   npx tsx scripts/content/queue.mts --only 10-three-ways --size story
//   npx tsx scripts/content/queue.mts --dir content/out/posts --dry
//
// The last step of the assembly line. `post.mts` composes the images here on
// the Mac — §1 keeps rendering on this side and the API container has no
// browser — and this hands them to `/admin/social`, where they wait for a yes
// or a no beside a caption you can still edit.
//
// It renders first, by calling post.mts, so there is one command between an
// idea and a decision rather than two with a directory between them.
//
// Captions. A slide's caption is not its own text: the image already carries
// the beats, and repeating them under it reads as a transcript. So the caption
// is written per slideshow in CAPTIONS below, and a key with no entry gets a
// caption derived from its filename, which is deliberately poor — it is a
// reminder to write one, visible in the panel before anything is approved.
//
// Hashtags are not added. `content/social/`'s posts carried six each, including
// `#consistencyoverperfection`, and nothing searches that. A few relevant ones
// belong in the caption text if they belong anywhere.

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/* ── flags ──────────────────────────────────────────────────────────── */

const FLAGS = new Set(['only', 'size', 'dir', 'api', 'dry', 'no-render', 'direct'])
const BOOL = new Set(['dry', 'no-render', 'direct'])
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

const SIZE = opts.size ?? 'story'
const DIR = opts.dir ?? 'content/out/posts'
const DRY = opts.dry === 'true'
const API = opts.api ?? 'http://localhost:4000'

/**
 * `--direct` writes through the service instead of over HTTP.
 *
 * `/admin/*` answers only to a session and this script has none, so the HTTP
 * path needs the panel's picker or a copied cookie. Importing the service skips
 * the question entirely — it is the same code the route calls, and it only
 * works where the database is reachable, which is the machine doing the
 * rendering anyway.
 *
 * Not the default, because it writes to whatever DATABASE_URL points at and
 * that deserves to be typed out rather than assumed.
 */
const DIRECT = opts.direct === 'true'
const addCandidate = DIRECT
  ? (await import('../../apps/api/src/services/social.ts')).addCandidate
  : null

/* ── captions ───────────────────────────────────────────────────────── */

/**
 * One caption per slide key. Keyed exactly as post.mts names the file, so a
 * slideshow's cover and its beats can each say something different — the cover
 * is the one people read before swiping, and the beats are read after.
 */
const CAPTIONS: Record<string, string> = {
  '10-three-ways-0':
    'Three ways to log a meal, in order of laziness. The first one is the only one I use.',
  '10-three-ways-1':
    'Saying it out loud is the whole feature. Hold the mic, talk like you would to a friend, done.',
  '10-three-ways-2':
    'For the meals you did not cook and could not itemise if you tried. Photograph it instead.',
  '10-three-ways-3':
    'And when you already know what it was: one sentence, plain language, no form to fill in.',

  '11-four-numbers-0':
    'Four numbers I track besides calories. The first one changed what I cook more than the calorie total ever did.',
  '11-four-numbers-1':
    'Fibre is the only number that reliably predicts whether a day left me full. Calories do not come close.',
  '11-four-numbers-2':
    'You can eat a genuinely light lunch and still take most of a day of sodium with it. Worth seeing.',
  '11-four-numbers-3':
    'Saturated fat and sugar hide in the same foods. Same calorie total, completely different afternoon.',

  '12-six-months-0':
    'Six months of evenings. Here is what actually shipped, and what I cut.',
  '12-six-months-1':
    'The whole premise: say what you ate. The parsing is the product — the form was always the problem.',
  '12-six-months-2':
    'Every tracker counts calories. Almost none of them show you fibre, sodium, sugar and saturated fat for free.',
  '12-six-months-3':
    'A calendar of real days beats a streak counter that punishes you for one gap. That one took longest.',

  '13-nine-pm-0':
    'Tell me you have never rebuilt lunch from memory at 9pm. I built an app because I kept doing it.',
  '13-nine-pm-1':
    'You had the bowl in your hands. You knew exactly what was in it. Eight hours ago.',
  '13-nine-pm-2':
    'It was never the knowing. It was that saying so took ninety seconds and eleven taps, three times a day.',
  '13-nine-pm-3':
    'So log it before you put the fork down, while the details are still in front of you. Then forget about it.',

  '14-four-screens-0':
    'Four screens. That is the whole app — no tabs I could not justify.',
  '14-four-screens-1':
    'Journal is where you spend about nine seconds a day. One question, three ways to answer it.',
  '14-four-screens-2':
    'Today is where you look when you are deciding dinner. The ring, the macros, and the four numbers underneath.',
  '14-four-screens-3':
    'Progress and History are the two nobody demos and the reason people stay. A trend that is not a verdict.',

  '15-fridge-door-maths-0':
    'The maths everyone does standing at the fridge door. Three steps, none of them accurate.',

  // The chat-and-write batch: one subject, six angles. A carousel has one
  // caption, so these are written for the cover — the beats are on the slides
  // and repeating them underneath reads as a transcript.
  '16-sentence-not-spreadsheet-0':
    'I deleted the search box. You type what you ate in plain language and the app works out the numbers.',
  '17-gave-up-in-march-0':
    'Nobody quits tracking on day one. They quit at the fourteenth near-identical search result for one bowl of soup.',
  '18-what-logging-costs-0':
    'Logging dinner used to take me longer than eating it. Three reasons, and all three are gone.',
  '19-say-it-out-loud-0':
    'The test I set myself: log a meal without looking down. Hold the mic, say the sentence, carry on eating.',
  '21-one-question-app-0':
    'I built the whole thing around one question I got sick of dodging: what have you eaten today?',
}

/**
 * Only the cover's caption is ever posted.
 *
 * A carousel has one body, and `decide` takes it from slide 0 — the beat rows
 * keep their own text as notes for whoever is deciding and it reaches no
 * channel. So a missing caption on a beat slide is not a problem worth
 * reporting, and counting them made the warning cry wolf: 19 of 44, all of
 * them harmless.
 */
function captionFor(key: string): { text: string; written: boolean } {
  const written = CAPTIONS[key]
  if (written) return { text: written, written: true }
  const isCover = /-0$/.test(key)
  return { text: `TODO caption — ${key}`, written: !isCover }
}

/* ── render ─────────────────────────────────────────────────────────── */

if (!DRY && opts['no-render'] !== 'true') {
  const args = ['tsx', 'scripts/content/post.mts', '--size', SIZE]
  if (opts.only) args.push('--only', opts.only)
  const render = spawnSync('npx', args, { encoding: 'utf8', stdio: 'inherit' })
  if (render.status !== 0) {
    console.error('post.mts failed; nothing uploaded.')
    process.exit(1)
  }
}

/* ── collect ────────────────────────────────────────────────────────── */

if (!existsSync(DIR)) {
  console.error(`No ${DIR}. Run post.mts first, or pass --dir.`)
  process.exit(1)
}

/**
 * Only the slides, and only at this size.
 *
 * post.mts writes the nine single posters into the same directory, and those
 * are not what this queue is for: they are 1080x1350 cast illustrations, which
 * is the shape of the feed this whole exercise is replacing. A key has to look
 * like a slideshow slide — `<n>-<name>-<i>` — to be picked up.
 */
const SLIDE = new RegExp(`^(\\d+-[a-z0-9-]+-\\d+)-${SIZE}\\.png$`)

const found = readdirSync(DIR)
  .map((file) => ({ file, match: SLIDE.exec(file) }))
  .filter((entry): entry is { file: string; match: RegExpExecArray } => Boolean(entry.match))
  .map((entry) => ({ file: entry.file, key: entry.match[1]! }))
  .filter((entry) => (opts.only ? entry.key.startsWith(opts.only) : true))
  .sort((a, b) => a.key.localeCompare(b.key))

if (!found.length) {
  console.error(`No slides matching ${SLIDE} in ${DIR}/.`)
  process.exit(1)
}

/**
 * Dimensions off the PNG header. `post.mts` knows the frame it drew, but by the
 * time a file is on disk this script does not, and the queue records what was
 * actually rendered rather than what was meant to be — a 1080x1350 slide
 * reaching TikTok is one of the things this panel exists to catch.
 */
function pngSize(bytes: Buffer): { width: number; height: number } | null {
  if (bytes.length < 24 || bytes.readUInt32BE(12) !== 0x49484452) return null
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
}

/* ── upload ─────────────────────────────────────────────────────────── */

let ok = 0
let missing = 0
for (const { file, key } of found) {
  const bytes = readFileSync(join(DIR, file))
  const size = pngSize(bytes)
  if (!size) {
    console.error(`  ${key.padEnd(20)} not a PNG, skipped`)
    continue
  }
  const caption = captionFor(key)
  if (!caption.written) missing++

  if (DRY) {
    console.log(
      `  ${key.padEnd(20)} ${size.width}x${size.height} ${(bytes.length / 1024).toFixed(0).padStart(4)} KB  ${caption.written ? '' : '(no caption)'}`,
    )
    continue
  }

  const upload = {
    sourceKey: key,
    caption: caption.text,
    width: size.width,
    height: size.height,
    mediaType: 'image/png' as const,
    bytes: bytes.toString('base64'),
  }

  if (addCandidate) {
    const added = await addCandidate(upload)
    ok++
    console.log(`  ${key.padEnd(20)} queued ${size.width}x${size.height}  ${added.id}`)
    continue
  }

  const res = await fetch(`${API}/admin/social`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(upload),
  })

  if (!res.ok) {
    // 401 here is the ordinary case and worth saying plainly: /admin/* answers
    // only to an admin session, and this script has none of its own.
    const body = await res.text().catch(() => '')
    console.error(`  ${key.padEnd(20)} ${res.status} ${body.slice(0, 160)}`)
    continue
  }
  ok++
  console.log(`  ${key.padEnd(20)} queued ${size.width}x${size.height}`)
}

if (DRY) {
  console.log(`\n${found.length} slide(s) would be uploaded to ${API}/admin/social`)
} else {
  console.log(`\n${ok}/${found.length} queued to ${API}`)
}
if (missing) console.log(`${missing} without a written caption — add them to CAPTIONS in this file.`)
