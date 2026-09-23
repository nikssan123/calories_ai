#!/usr/bin/env tsx
// Real photographs for the grounds under type, pulled from Pexels.
//
//   npx tsx scripts/content/stock.mts                    # every set, 12 each
//   npx tsx scripts/content/stock.mts --set market --per 24
//   npx tsx scripts/content/stock.mts --dry              # show, download nothing
//
// §0 sanctions Pexels and Unsplash and then nothing was ever built, so
// content/stock/ has been empty since the day the table was written. This is
// the missing half. Pexels and not Unsplash for one reason: Unsplash's licence
// wants attribution, and there is nowhere to put a credit inside a Reel that a
// viewer will read. Pexels asks for it and does not require it, so the credit
// can live in the repo instead — which is what CREDITS.md below is for.
//
// What the queries are chasing, and why they are worded so oddly:
//
// The photographs that carry short-form right now do not look like food
// photography. They look like someone's camera roll — handheld, one hand in
// frame, daylight from a window, the framing slightly wrong, a real kitchen
// behind the plate. Studio food on a marble slab reads as an advertisement and
// gets scrolled; a plate held over a wooden table does not. So the queries ask
// for the room and the hand, not the dish: "hand holding bowl" over "healthy
// bowl", "supermarket aisle" over "fresh vegetables". A query that names only
// the food comes back as stock and is useless here.
//
// THE NUMBERS RULE. §0 forbids a calorie number on generated food because the
// food is not real, so the number would be fiction. A photograph from here is
// real, but its calories are just as unknown — nobody weighed that bowl. The
// rule therefore lands the same way: nothing pulled by this script may ever
// carry a figure. These are grounds for hooks and slideshow type. The only
// images allowed to sit under a number are §10's recipe photographs, where the
// food is real AND the figure is USDA's.
//
// Every file lands beside a sidecar holding the photographer, both URLs and the
// query that found it, and CREDITS.md aggregates the lot. That is not
// bookkeeping for its own sake: the one thing that could force a takedown later
// is not being able to say where a picture came from.

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/* ── flags ──────────────────────────────────────────────────────────── */

const FLAGS = new Set(['set', 'per', 'out', 'dry', 'sheet', 'keep'])
const argv = process.argv.slice(2)
const opts: Record<string, string> = {}
const BOOL = new Set(['dry', 'sheet', 'keep'])
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
const OUTDIR = opts.out ?? 'content/stock'
const DRY = opts.dry === 'true'
const SHEET = opts.sheet === 'true'
// Each run replaces its sets by default. Curation is the whole job here, so a
// re-pull that piles new photographs on top of the ones already rejected just
// moves the sorting problem somewhere else. --keep opts out.
const KEEP = opts.keep === 'true'

/* ── the sets ───────────────────────────────────────────────────────── */

/**
 * Four sets, one per job. `meals` and `counter` go under logging copy, `market`
 * under the grocery and scanning hooks, `desk` under the 9pm-rebuild-from-
 * memory line — the one hook that is about forgetting rather than about food.
 *
 * Several queries per set on purpose: one query returns one photographer's
 * idea of the subject over and over, and a feed of near-identical grounds is
 * the same amateur tell as one face at one weight in post.mts.
 */
const SETS: Record<string, string[]> = {
  /*
   * Six or seven queries a set, not four. Asking one query for twenty results
   * walks into its own long tail: `kitchen at night warm lamp light` at depth
   * twenty returned a bar counter with vinyl records on it, which then grounded
   * a slideshow about searching a food database. Breadth holds the subject;
   * depth does not.
   */
  meals: [
    'hand holding bowl of food',
    'person eating at kitchen table',
    'plate of food on wooden table daylight',
    'homemade lunch overhead phone photo',
    'person eating salad at home',
    'dinner plate held in two hands',
    'bowl of pasta on a table at home',
  ],
  counter: [
    'kitchen counter cooking mess',
    'chopping vegetables on board home kitchen',
    'meal prep containers counter',
    'coffee and breakfast kitchen window light',
    'hands cooking on a home stove',
    'leftovers in a container on a counter',
    'home kitchen worktop with ingredients',
  ],
  market: [
    'supermarket produce aisle',
    'grocery shopping basket vegetables',
    'farmers market vegetable stall',
    'grocery bags on kitchen floor',
    'person choosing vegetables in a shop',
    'trolley in a supermarket aisle',
    'unpacking shopping in a kitchen',
  ],
  /**
   * Evening, and the kitchen after dark. Originally this set also asked for gym
   * bags and city streets, and it returned a man in a jiu-jitsu gi in a boxing
   * gym — which the writer in `ai/slides.ts` then quite reasonably chose as the
   * ground for a slideshow about standing at the fridge door, because the set
   * was described to it as "evenings, laptops, gym bags". The set was the
   * problem, not the choice. A set has to mean one thing or nothing downstream
   * can pick it correctly.
   */
  evening: [
    'open fridge at night kitchen',
    'person eating late at night kitchen',
    'kitchen at night warm lamp light',
    'person on phone at kitchen table evening',
    'late night snack kitchen counter',
    'person standing in a dark kitchen',
    'dim kitchen with a light over the table',
  ],
}

/* ── the key ────────────────────────────────────────────────────────── */

/**
 * No dotenv anywhere in this repo, and adding one for a single key is not
 * worth the dependency. Parse .env by hand: KEY=VALUE, optional `export`,
 * optional quotes, # comments ignored.
 */
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
  console.error('Create one at https://www.pexels.com/api/ and add it to .env.')
  process.exit(1)
}

/* ── the frame we need ──────────────────────────────────────────────── */

const MIN_W = 1080
const MIN_H = 1920

type Photo = {
  id: number
  width: number
  height: number
  url: string
  alt: string | null
  avg_color: string | null
  photographer: string
  photographer_url: string
  src: Record<string, string>
}

/**
 * White type with a dark outline is what every layout here sets, so a ground
 * that is already pale fights it. Pexels hands back avg_color, which is enough
 * to score legibility without downloading anything: tag the sidecar with the
 * luminance and let the layouts prefer the darker half. Not a hard filter —
 * a bright ground is still fine behind a scrim.
 */
function luminance(hex: string | null): number | null {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return null
  const n = parseInt(hex.slice(1), 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255)
  return Number((0.2126 * r + 0.7152 * g + 0.0722 * b).toFixed(3))
}

/**
 * The queries alone are not enough. Asking for "hand holding bowl of food"
 * returns both a man eating breakfast at his own kitchen table and a styled
 * flat-lay of three poke bowls on a seamless backdrop with a marble prop —
 * hands are in frame either way. The second is an advertisement and will be
 * read as one.
 *
 * Pexels' own alt text sorts them, because whoever wrote it was selling the
 * photograph: a studio shot gets described in stock-listing vocabulary
 * ("elegant", "gourmet", "showcasing", "perfect for"), and a real room rarely
 * does. So reject on the seller's adjectives, and prefer any alt that names a
 * person doing something — a person in the frame is most of the difference
 * between a camera roll and a catalogue.
 *
 * This lands around four in five usable, not five in five. Judgement about
 * photographs does not survive being written down, which is what --sheet is
 * for: look at the set and delete what is wrong.
 */
const SELLING = /gourmet|elegant|luxur|exquisite|chef|showcas|promoting|perfect for|creating a|atmosphere|flat.?lay|studio|arrangement|vibrant display|assorted|spread featuring/i
const PRESENT = /\b(person|man|woman|hand|hands|holding|eating|having|using|sits?|sitting|walks?|organi[sz]ing|putting|slices)\b/i

function score(photo: Photo): number | null {
  const alt = photo.alt ?? ''
  if (SELLING.test(alt)) return null // rejected outright
  let s = 0
  if (PRESENT.test(alt)) s += 2
  // A darker ground takes white type without a scrim; see luminance() above.
  const lum = luminance(photo.avg_color)
  if (lum !== null && lum < 0.45) s += 1
  return s
}

async function search(query: string, perPage: number): Promise<Photo[]> {
  const u = new URL('https://api.pexels.com/v1/search')
  u.searchParams.set('query', query)
  u.searchParams.set('orientation', 'portrait')
  u.searchParams.set('per_page', String(Math.min(80, perPage * 4)))
  const res = await fetch(u, { headers: { Authorization: KEY! } })
  if (res.status === 429) {
    console.error('Pexels rate limit hit (200/hour). Wait and re-run.')
    process.exit(1)
  }
  if (!res.ok) {
    console.error(`Pexels ${res.status} for "${query}": ${await res.text()}`)
    return []
  }
  const body = (await res.json()) as { photos?: Photo[] }
  return (body.photos ?? []).filter((p) => p.width >= MIN_W && p.height >= MIN_H)
}

async function download(url: string, to: string) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`download ${res.status} ${url}`)
  writeFileSync(to, Buffer.from(await res.arrayBuffer()))
}

/* ── contact sheet ──────────────────────────────────────────────────── */

/**
 * One JPEG per set, every photograph tiled and numbered, so the last call —
 * which is taste and cannot be scripted — takes one look instead of opening
 * thirty files. The number drawn on each tile is its index in the list printed
 * underneath, so culling is `rm` on the ones that are wrong.
 *
 * Two passes, and the reason is a trap worth recording: the image2 demuxer
 * needs every frame in a globbed sequence to share dimensions, and these do
 * not — Pexels originals here run from 2000x3000 to 4000x6000. Globbing the
 * set straight into `tile` silently renders only the frames up to the first
 * size change, which looks like a mostly-empty sheet rather than an error. So
 * normalise each photograph to one tile first, numbered in order, and tile the
 * result. It also means the label is the real index rather than drawtext's
 * frame counter.
 */
const FONTS = [
  'apps/mobile/assets/fonts/IBMPlexMono-Regular.ttf',
  '/System/Library/Fonts/Supplemental/Arial.ttf',
  '/System/Library/Fonts/Helvetica.ttc',
]

const TILE_W = 340
const TILE_H = 604

function sheet(set: string, dir: string, ids: string[]) {
  if (!ids.length) return
  const order = [...ids].sort()
  const cols = Math.min(4, order.length)
  const rows = Math.ceil(order.length / cols)
  const font = FONTS.find((f) => existsSync(f))
  const tmp = join(dir, '_tiles')
  rmSync(tmp, { recursive: true, force: true })
  mkdirSync(tmp, { recursive: true })

  for (const [i, id] of order.entries()) {
    const label = [
      `drawtext=text='${i}'`,
      font ? `fontfile=${font}` : '',
      'x=10:y=10:fontsize=34:fontcolor=white:box=1:boxcolor=black@0.65:boxborderw=8',
    ]
      .filter(Boolean)
      .join(':')
    const res = spawnSync(
      'ffmpeg',
      [
        '-y', '-hide_banner', '-loglevel', 'error',
        '-i', join(dir, `${id}.jpg`),
        '-vf',
        `scale=${TILE_W}:${TILE_H}:force_original_aspect_ratio=increase,crop=${TILE_W}:${TILE_H},${label}`,
        '-frames:v', '1',
        join(tmp, `${String(i).padStart(3, '0')}.jpg`),
      ],
      { encoding: 'utf8' },
    )
    if (res.status !== 0) {
      console.error(`  tile ${i} failed: ${res.stderr?.trim() ?? res.error?.message}`)
      rmSync(tmp, { recursive: true, force: true })
      return
    }
  }

  const out = join(dir, '_sheet.jpg')
  const res = spawnSync(
    'ffmpeg',
    [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-i', join(tmp, '%03d.jpg'),
      '-vf', `tile=${cols}x${rows}:padding=6:color=white`,
      '-frames:v', '1',
      out,
    ],
    { encoding: 'utf8' },
  )
  rmSync(tmp, { recursive: true, force: true })
  if (res.status !== 0) {
    console.error(`  sheet failed for ${set}: ${res.stderr?.trim() ?? res.error?.message}`)
    return
  }
  console.log(`  sheet -> ${out}`)
  order.forEach((id, i) => console.log(`    ${String(i).padStart(2)}  ${id}.jpg`))
}

/* ── run ────────────────────────────────────────────────────────────── */

const wanted = opts.set ? [opts.set] : Object.keys(SETS)
for (const name of wanted) {
  if (!SETS[name]) {
    console.error(`Unknown set "${name}". Known: ${Object.keys(SETS).join(', ')}`)
    process.exit(1)
  }
}

type Credit = {
  set: string
  id: number
  file: string
  photographer: string
  photographer_url: string
  url: string
}
const credits: Credit[] = []
const seen = new Set<number>()

for (const set of wanted) {
  const dir = join(OUTDIR, set)
  if (!DRY) {
    if (!KEEP && existsSync(dir)) rmSync(dir, { recursive: true })
    mkdirSync(dir, { recursive: true })
  }

  const queries = SETS[set]
  // Spread the quota across the queries so no single one dominates the set.
  const perQuery = Math.max(1, Math.ceil(PER / queries.length))
  const picked: { photo: Photo; query: string }[] = []
  let rejected = 0

  for (const query of queries) {
    if (picked.length >= PER) break
    const photos = DRY ? [] : await search(query, perQuery)

    // Score first, then take the best of what this query returned, rather than
    // the first few Pexels happens to rank highest — its ranking favours the
    // polished end, which is the end we do not want.
    const ranked = photos
      .map((photo) => ({ photo, query, s: score(photo) }))
      .filter((c) => {
        if (c.s === null) rejected++
        return c.s !== null
      })
      .sort((a, b) => (b.s as number) - (a.s as number))

    let taken = 0
    for (const cand of ranked) {
      if (taken >= perQuery || picked.length >= PER) break
      if (seen.has(cand.photo.id)) continue // never the same photo in two sets
      seen.add(cand.photo.id)
      picked.push({ photo: cand.photo, query: cand.query })
      taken++
    }
    if (DRY) console.log(`  ${set.padEnd(8)} would search: ${query}`)
  }

  for (const { photo, query } of picked) {
    const base = String(photo.id)
    const jpg = join(dir, `${base}.jpg`)
    await download(photo.src.original, jpg)
    writeFileSync(
      join(dir, `${base}.json`),
      JSON.stringify(
        {
          id: photo.id,
          set,
          query,
          width: photo.width,
          height: photo.height,
          alt: photo.alt,
          avg_color: photo.avg_color,
          luminance: luminance(photo.avg_color),
          photographer: photo.photographer,
          photographer_url: photo.photographer_url,
          source: photo.url,
          licence: 'Pexels — free for commercial use, attribution not required',
          // The §0 constraint travels with the file, so nothing downstream has
          // to remember it.
          numbers: 'never — calories for this food are unknown; see §0',
        },
        null,
        2,
      ) + '\n',
    )
    credits.push({
      set,
      id: photo.id,
      file: `${set}/${base}.jpg`,
      photographer: photo.photographer,
      photographer_url: photo.photographer_url,
      url: photo.url,
    })
  }

  if (!DRY) {
    console.log(`${set.padEnd(8)} ${picked.length} kept, ${rejected} rejected on alt -> ${dir}`)
    if (SHEET) sheet(set, dir, picked.map((p) => String(p.photo.id)))
  }
}

/**
 * licenses.csv, the name CONTENT_ENGINE.md §6 already gave this file, and the
 * one thing under content/stock/ that belongs in git — .gitignore excludes the
 * payloads and un-ignores this. The photographs are a local cache that can be
 * re-pulled; the record of where they came from is not, and losing it is the
 * only thing here that could not be undone.
 *
 * Rewritten whole on every run rather than appended to, because a run replaces
 * the sets it touches. With --keep or a single --set, rows for the sets left
 * alone are carried over from the existing file so they are not dropped.
 */
if (!DRY && credits.length) {
  const HEAD = 'file,set,photographer,photographer_url,source,licence,numbers'
  const cell = (s: string) => (/[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
  const row = (c: Credit) =>
    [
      c.file,
      c.set,
      c.photographer,
      c.photographer_url,
      c.url,
      'Pexels — free for commercial use, attribution not required',
      'never — calories unknown, see CONTENT_ENGINE.md §0',
    ]
      .map(cell)
      .join(',')

  const csv = join(OUTDIR, 'licenses.csv')
  const kept: string[] = []
  if (existsSync(csv)) {
    const touched = new Set(wanted)
    for (const line of readFileSync(csv, 'utf8').split('\n')) {
      if (!line || line === HEAD) continue
      const set = line.split(',')[1]
      if (!touched.has(set)) kept.push(line) // a set this run did not rebuild
    }
  }
  writeFileSync(csv, [HEAD, ...kept, ...credits.map(row)].join('\n') + '\n')
  console.log(`\n${credits.length} photo(s) this run, provenance -> ${csv}`)
}
