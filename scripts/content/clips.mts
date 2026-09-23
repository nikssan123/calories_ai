#!/usr/bin/env tsx
// Footage for the meme videos, from Pexels.
//
//   npx tsx scripts/content/clips.mts                    # every set
//   npx tsx scripts/content/clips.mts --set defeated --per 14
//   npx tsx scripts/content/clips.mts --dry              # show the queries only
//
// `stock.mts` does this for photographs. Same key, same licence (Pexels, free
// for commercial use, attribution not required and recorded anyway), different
// endpoint and a very different filter — because the video API gives you almost
// nothing to filter on.
//
// WHAT THERE IS TO JUDGE A CLIP BY
//
// A photograph comes back with `alt`, which is a sentence describing it, and
// stock.mts leans on that entirely. A video comes back with `tags: []` — always
// empty, on every result checked — and no alt at all. The only text is the slug
// inside `url`:
//
//   https://www.pexels.com/video/man-in-pullover-hoodie-posing-6322564/
//
// So the reject lists below read that slug. It is a much worse signal than alt
// text, and the queries therefore do most of the work — see the note on SETS.
// What the slug does catch is the labelling: `posing`, `sunset`, `people` and
// `senior` are how Pexels describes the footage this format cannot use.
//
// WHAT NO FILTER HERE CAN CATCH
//
// A seamless studio backdrop. Three clips in a run of nine came back shot
// against a plain white or grey wall, which reads as an advert immediately, and
// their slugs were "a-person-lying-down-on-a-sofa", "woman-who-looks-sad-
// sitting-on-the-floor" and "a-woman-looking-up" — nothing to match on. STUDIO
// below catches the ones Pexels happens to label; the rest are caught by the
// person approving the rendered video, which is what the panel is for.
//
// WHY THE SETS ARE SHOTS AND NOT SUBJECTS
//
// See CLIP_SETS in ai/memes.ts. In this format the composition does the work,
// so a set means one framing and one feeling, not one topic.
//
// FILE SIZE
//
// Pexels serves the same clip at up to 2160x4096. The renderer crops to
// 1080x1920, so anything past 1080 wide is downloaded and thrown away; a 34
// second UHD clip is 80MB of that. This takes the SMALLEST file at least 1080
// wide, which is usually exactly 1080x1920.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'

/* ── flags ──────────────────────────────────────────────────────────── */

const FLAGS = new Set(['set', 'per', 'out', 'dry', 'keep'])
const BOOL = new Set(['dry', 'keep'])
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

const PER = Number(opts.per ?? 12)
const OUTDIR = opts.out ?? 'content/clips'
const DRY = opts.dry === 'true'
const KEEP = opts.keep === 'true'

/* ── the sets ───────────────────────────────────────────────────────── */

/**
 * Ten queries a set, for the reason stock.mts arrived at: one query asked for
 * twelve results returns one photographer's idea of the subject over and over,
 * and depth walks into the long tail rather than staying on the subject.
 */
const SETS: Record<string, string[]> = {
  /**
   * ASK FOR THE PERSON, NOT THE PLACE.
   *
   * The first version of this set asked things like "man standing alone looking
   * at the sea" and got, faithfully, the sea. Six results: two elderly
   * strangers leaning on railings, a group watching a postcard sunset — from a
   * set named `alone` — and two frames where the human being is forty pixels
   * tall against a lot of water. One usable clip in six, and the one that
   * worked was "young woman looking out of a glass window", which is the only
   * query that named a person and a feeling instead of a view.
   *
   * A meme frame is close or medium on ONE person whose feeling you can read,
   * in a setting nobody would photograph on purpose. Scenery is the opposite of
   * that: it is what travel accounts post, and it reads as a screensaver with
   * text on it.
   *
   * So every query here names a person, usually a posture or a gesture, and
   * never a landmark or a time of day. SCENIC and GROUP below throw away what
   * gets through anyway.
   */
  /** Still, tired, thinking. The resignation shot. */
  defeated: [
    'young woman sitting alone thinking',
    'man rubbing his eyes tired at a table',
    'person lying on a sofa staring at the ceiling',
    'woman resting her head on her hand bored',
    'close up of a person sighing',
    'young man sitting on the floor looking down',
    'person staring blankly indoors',
    'woman leaning against a wall thinking',
    'tired person sitting on the edge of a bed',
    'close up portrait of a person looking away',
    'young woman looking out of a window indoors',
    'person putting their head in their hands',
  ],
  /** Hands and counters, candid, mid-task. */
  kitchen: [
    'hands chopping vegetables home kitchen',
    'person cooking at a home stove candid',
    'someone eating at a kitchen table alone',
    'close up of hands holding a bowl of food',
    'person opening a fridge at home',
    'young woman eating standing up in a kitchen',
    'washing up at a kitchen sink close up',
    'person carrying a plate to a table',
    'hands unpacking groceries on a counter',
    'someone eating leftovers from a container',
    'person staring into an open fridge',
    'young man making food late at night',
  ],
  /** A face or hands lit by a screen. */
  phone: [
    'close up of a person looking at their phone',
    'face lit by phone screen in the dark',
    'hands scrolling on a phone close up',
    'person on phone in bed at night',
    'young woman typing on a phone on a sofa',
    'person checking phone while eating',
    'close up of thumbs typing on a phone',
    'annoyed person looking at their phone',
    'hands holding a phone over a plate of food',
    'person putting a phone face down on a table',
    'young man frowning at a phone screen',
    'person scrolling on a phone at a kitchen table',
  ],
  /**
   * Walking, commuting. Time passing.
   *
   * The riskiest set for the scenery problem, so the queries stay on the body —
   * legs, a bag, a coat — rather than on the city.
   */
  street: [
    'close up of legs walking on a pavement',
    'person walking home carrying a shopping bag',
    'young woman walking alone in a city',
    'person waiting at a bus stop close up',
    'walking up stairs in a city from behind',
    'person zipping up a coat outdoors',
    'hands carrying grocery bags while walking',
    'young man walking with headphones on',
    'person standing on a train platform waiting',
    'walking through a doorway into a flat',
    'person unlocking a front door',
    'close up of shoes walking on wet ground',
  ],
}

/* ── the key ────────────────────────────────────────────────────────── */

/** Same hand-rolled .env read as stock.mts: no dotenv in this repo. */
function readEnvKey(name: string): string | undefined {
  if (process.env[name]) return process.env[name]
  for (const file of ['.env', '.env.local']) {
    if (!existsSync(file)) continue
    for (const raw of readFileSync(file, 'utf8').split('\n')) {
      const line = raw.trim()
      if (!line || line.startsWith('#')) continue
      const m = line.replace(/^export\s+/, '').match(/^([A-Z0-9_]+)\s*=\s*(.*)$/i)
      if (!m || m[1] !== name) continue
      return m[2].trim().replace(/^['"]|['"]$/g, '')
    }
  }
  return undefined
}

const KEY = readEnvKey('PEXELS_API_KEY')
if (!KEY && !DRY) {
  console.error('PEXELS_API_KEY not found in the environment or .env.')
  process.exit(1)
}

/* ── what we will and will not take ─────────────────────────────────── */

/**
 * The slug words that mean "this was shot to sell something".
 *
 * Read off `url`, which is the only text a video result carries. A clip
 * labelled `posing` or `model` is someone performing at the camera, and one
 * cut into this format reads as an advert no matter what the line over it says
 * — the same judgement as `SELLING` in stock.mts, made on worse evidence.
 */
const POSED =
  /(posing|poses|model|modell|studio|fashion|dancing|dance|smiling-at|looking-at-camera|advertis|business-meeting|office-team|handshake|thumbs-up|celebrat|fitness-model|workout|gym)/i

/**
 * Scenery, which is the failure this set actually had.
 *
 * `posing` was never the problem — nothing was rejected for it on the first
 * run. What came back instead was landscape: sunsets, beaches, the sea, a view.
 * In a meme frame the person carries the feeling and the setting is wallpaper,
 * so a clip whose own slug is about the view has already lost.
 *
 * `view-of` catches Pexels' commonest landscape phrasing and `aerial`/`drone`
 * catch footage with no person in it at all.
 */
const SCENIC =
  /(sunset|sunrise|beach|ocean|sea-|-sea|waves|scenic|scenery|landscape|aerial|drone|view-of|panoram|mountain|forest|nature|travel|tourist|vacation|holiday|sky-|clouds|horizon|island|lake|river|waterfall|sunlight-through)/i

/**
 * More than one person.
 *
 * A set named `defeated` returned "silhouette-of-people-watching-sunset-on-
 * pier". The format needs one figure: two is a relationship and the viewer
 * reads the relationship instead of the line.
 */
const GROUP = /(people|friends|group|couple|family|crowd|team|colleagues|together|two-women|two-men|children|kids)/i

/**
 * The audience this account is trying to reach is not in these clips.
 *
 * The first run returned two elderly men on railings, which is what stock
 * libraries keep under "alone" and "thinking". Nothing wrong with the footage;
 * it simply will not stop the scroll of the people the app is for, and the
 * whole point of the format is recognition.
 */
const WRONG_CAST = /(senior|elderly|old-man|old-woman|grandmother|grandfather|grandma|grandpa|retired|pensioner|baby|toddler|child)/i

/**
 * Shot in a studio, where Pexels says so.
 *
 * A seamless backdrop is the strongest advert tell there is and the weakest
 * thing to filter on: the slug rarely mentions it. This catches the honest
 * labels — `white-background`, `mockup`, `copy-space` — and misses the rest,
 * which is stated plainly at the top of this file rather than pretended away.
 */
const STUDIO =
  /(white-background|gray-background|grey-background|plain-background|isolated|mockup|mock-up|copy-space|blank-wall|blank-canvas|empty-frame|seamless|backdrop|green-screen|chroma)/i

/** Clips the frame cannot use, whatever they show. */
const MIN_WIDTH = 1080
const MIN_SECONDS = 5
/**
 * Twenty seconds, because the renderer takes eight and the rest is download.
 * Not a hard quality signal — a good 40s clip exists — but every second past
 * the cut is bandwidth spent on frames nobody will see.
 */
const MAX_SECONDS = 20

interface PexelsFile {
  id: number
  quality: string
  file_type: string
  width: number | null
  height: number | null
  fps: number | null
  link: string
}

interface PexelsVideo {
  id: number
  width: number
  height: number
  duration: number
  url: string
  image: string
  user: { id: number; name: string; url: string }
  video_files: PexelsFile[]
}

/** The smallest file at least 1080 wide. See the note on file size above. */
function bestFile(video: PexelsVideo): PexelsFile | null {
  const portrait = video.video_files.filter(
    (f) =>
      f.file_type === 'video/mp4' &&
      f.width !== null &&
      f.height !== null &&
      f.width >= MIN_WIDTH &&
      f.height > f.width,
  )
  if (!portrait.length) return null
  return portrait.sort((a, b) => a.width! - b.width!)[0]!
}

/** Null when the clip is unusable, with the reason. */
function reject(video: PexelsVideo): string | null {
  if (POSED.test(video.url)) return 'posed'
  if (SCENIC.test(video.url)) return 'scenery'
  if (GROUP.test(video.url)) return 'more than one person'
  if (WRONG_CAST.test(video.url)) return 'wrong cast'
  if (STUDIO.test(video.url)) return 'studio'
  if (video.duration < MIN_SECONDS) return `${video.duration}s too short`
  if (video.duration > MAX_SECONDS) return `${video.duration}s too long`
  if (!bestFile(video)) return 'no portrait file at 1080+'
  return null
}

async function search(query: string, perPage: number): Promise<PexelsVideo[]> {
  const url =
    `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}` +
    `&orientation=portrait&size=medium&per_page=${perPage}`
  const res = await fetch(url, { headers: { Authorization: KEY! } })
  if (!res.ok) {
    console.error(`  ${res.status} on "${query}" — ${(await res.text()).slice(0, 160)}`)
    return []
  }
  return ((await res.json()) as { videos?: PexelsVideo[] }).videos ?? []
}

async function download(link: string, path: string): Promise<number> {
  const res = await fetch(link)
  if (!res.ok) throw new Error(`${res.status} downloading ${link}`)
  const bytes = Buffer.from(await res.arrayBuffer())
  writeFileSync(path, bytes)
  return bytes.length
}

/* ── run ────────────────────────────────────────────────────────────── */

const wanted = opts.set ? [opts.set] : Object.keys(SETS)
for (const name of wanted) {
  if (!SETS[name]) {
    console.error(`Unknown set "${name}". Known: ${Object.keys(SETS).join(', ')}`)
    process.exit(1)
  }
}

/** At most two clips from one videographer per set — stock.mts's lesson. */
const MAX_PER_AUTHOR = 2

const SHEET = join(OUTDIR, 'licenses.csv')
if (!DRY) {
  mkdirSync(OUTDIR, { recursive: true })
  if (!existsSync(SHEET)) {
    writeFileSync(SHEET, 'file,set,author,author_url,source,licence,seconds,bytes\n')
  }
}

/** Across sets: the same clip in two sets is the repeat this cannot have. */
const seen = new Set<number>()
let total = 0

for (const set of wanted) {
  const dir = join(OUTDIR, set)
  if (!DRY) {
    if (!KEEP && existsSync(dir)) rmSync(dir, { recursive: true })
    mkdirSync(dir, { recursive: true })
  }

  const queries = SETS[set]!
  const perQuery = Math.max(1, Math.ceil(PER / queries.length))
  const picked: { video: PexelsVideo; file: PexelsFile; query: string }[] = []
  const byAuthor = new Map<string, number>()
  let posed = 0
  let scenery = 0
  let unusable = 0
  let sameAuthor = 0

  for (const query of queries) {
    if (picked.length >= PER) break
    if (DRY) {
      console.log(`  ${set.padEnd(8)} would search: ${query}`)
      continue
    }
    // Ask for more than we will take, because most of a page is rejected.
    const videos = await search(query, Math.max(6, perQuery * 4))

    let taken = 0
    for (const video of videos) {
      if (taken >= perQuery || picked.length >= PER) break
      if (seen.has(video.id)) continue

      const why = reject(video)
      if (why) {
        if (why === 'posed') posed++
        else if (
          why === 'scenery' ||
          why === 'more than one person' ||
          why === 'wrong cast' ||
          why === 'studio'
        )
          scenery++
        else unusable++
        continue
      }
      const who = video.user.name
      if ((byAuthor.get(who) ?? 0) >= MAX_PER_AUTHOR) {
        sameAuthor++
        continue
      }

      seen.add(video.id)
      byAuthor.set(who, (byAuthor.get(who) ?? 0) + 1)
      picked.push({ video, file: bestFile(video)!, query })
      taken++
    }
  }

  if (DRY) continue

  for (const { video, file, query } of picked) {
    const base = String(video.id)
    const mp4 = join(dir, `${base}.mp4`)
    const bytes = await download(file.link, mp4)
    writeFileSync(
      join(dir, `${base}.json`),
      JSON.stringify(
        {
          id: video.id,
          set,
          query,
          page: video.url,
          author: video.user.name,
          author_url: video.user.url,
          width: file.width,
          height: file.height,
          fps: file.fps,
          seconds: video.duration,
          poster: video.image,
          licence: 'Pexels — free for commercial use, attribution not required',
        },
        null,
        2,
      ) + '\n',
    )
    const cell = (v: string | number) =>
      /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v)
    appendFileSync(
      SHEET,
      [
        `${set}/${base}.mp4`,
        set,
        cell(video.user.name),
        video.user.url,
        video.url,
        'Pexels',
        video.duration,
        bytes,
      ].join(',') + '\n',
    )
    total++
  }

  const mb = picked.length
    ? (
        picked.reduce((n, p) => n + (p.video.duration ?? 0), 0) / picked.length
      ).toFixed(0)
    : '0'
  console.log(
    `${set.padEnd(9)} ${picked.length} kept (avg ${mb}s), ` +
      `${posed} posed, ${scenery} scenery/group/cast, ${unusable} wrong shape, ` +
      `${sameAuthor} a third from one author`,
  )
}

if (DRY) {
  console.log('\n--dry, so nothing was searched or written.')
} else {
  console.log(`\n${total} clip(s) this run, provenance -> ${SHEET}`)
}
