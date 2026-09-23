#!/usr/bin/env tsx
// Ask the model for slideshows, and write them where post.mts will find them.
//
//   npx tsx scripts/content/suggest.mts                 # five, to content/slides/
//   npx tsx scripts/content/suggest.mts --count 8
//   npx tsx scripts/content/suggest.mts --print         # show them, write nothing
//   npx tsx scripts/content/suggest.mts --theme 'saying what you ate out loud'
//
// A --theme narrows the subject and nothing else: the fact sheet and the
// prohibitions in ai/slides.ts still bind, because a free-text steer is exactly
// the opening a model takes to reach past them.
//
// The front of the chain:
//
//   suggest.mts  writes content/slides/<key>.json       (this)
//   post.mts     renders each onto a photograph
//   queue.mts    uploads the PNGs
//   Social panel one card at a time, approve or reject
//   Buffer       decides when
//
// Every step after this one is a person or a file, which is the point. The
// model writes candidates; it does not publish anything, and it never sees a
// channel.
//
// It runs on the Claude Code subscription by name — `ai/slides.ts` asks for the
// `'anthropic'` lane explicitly rather than whatever lane the deployment is on,
// because a batch of marketing copy on Opus is a real bill on a metered key and
// nothing on a subscription already being paid for. Billed as `content_plan`.
//
// Keys are prefixed with the next free number when written, so a generated
// slideshow sorts beside the hand-written ones in content/out/posts/ and
// post.mts's --only keeps working on it.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { suggestSlideshows, type SuggestedSlideshow } from '../../apps/api/src/ai/slides.ts'

/* ── flags ──────────────────────────────────────────────────────────── */

const FLAGS = new Set(['count', 'out', 'print', 'theme'])
const BOOL = new Set(['print'])
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

const COUNT = Number(opts.count ?? 5)
const OUTDIR = opts.out ?? 'content/slides'
const PRINT = opts.print === 'true'

/* ── what not to repeat ─────────────────────────────────────────────── */

/**
 * The hooks already in play, handed to the model so a batch does not re-tread
 * them. Two sources, because a slideshow can exist in either place: written by
 * hand in post.mts's SLIDESHOWS, or generated here on a previous run.
 *
 * Read out of the files rather than kept in a list, so it cannot drift.
 */
function existingHooks(): string[] {
  const hooks: string[] = []

  const post = readFileSync('scripts/content/post.mts', 'utf8')
  for (const m of post.matchAll(/^\s*hook: '([^']+)',$/gm)) {
    hooks.push(m[1]!.replace(/<br>/g, ' '))
  }

  if (existsSync(OUTDIR)) {
    for (const file of readdirSync(OUTDIR).filter((f) => f.endsWith('.json'))) {
      try {
        const show = JSON.parse(readFileSync(join(OUTDIR, file), 'utf8')) as SuggestedSlideshow
        if (show.hook) hooks.push(show.hook.replace(/<br>/g, ' '))
      } catch {
        // A hand-edited file that no longer parses is not this script's problem;
        // post.mts will complain about it loudly enough.
      }
    }
  }
  return hooks
}

/**
 * The next free number, so generated slideshows keep sorting after the written
 * ones. post.mts's own keys are `10-` through `14-`; a slideshow arriving from
 * here becomes `15-<key>` and so on.
 */
function nextIndex(): number {
  let highest = 9
  const post = readFileSync('scripts/content/post.mts', 'utf8')
  for (const m of post.matchAll(/^\s*key: '(\d+)-/gm)) highest = Math.max(highest, Number(m[1]))
  if (existsSync(OUTDIR)) {
    for (const file of readdirSync(OUTDIR)) {
      const m = /^(\d+)-/.exec(file)
      if (m) highest = Math.max(highest, Number(m[1]))
    }
  }
  return highest + 1
}

/* ── run ────────────────────────────────────────────────────────────── */

const avoid = existingHooks()
console.log(
  `Asking for ${COUNT}${opts.theme ? ` on "${opts.theme}"` : ''}, avoiding ${avoid.length} hook(s) already in play…\n`,
)

const { slideshows, rejected, model, costUsd } = await suggestSlideshows(COUNT, avoid, opts.theme)

for (const { key, why } of rejected) {
  console.log(`  rejected  ${key.padEnd(24)} ${why}`)
}

let index = nextIndex()
for (const show of slideshows) {
  const numbered = `${index}-${show.key}`
  console.log(`\n  ${numbered}  [${show.stock}]`)
  console.log(`    ${show.hook.replace(/<br>/g, ' / ')}`)
  for (const beat of show.beats) {
    if (beat.aside) console.log(`      ${beat.aside}`)
    console.log(`      ${beat.claim}`)
    if (beat.reason) console.log(`        ${beat.reason}`)
  }

  if (!PRINT) {
    mkdirSync(OUTDIR, { recursive: true })
    writeFileSync(
      join(OUTDIR, `${numbered}.json`),
      JSON.stringify({ ...show, key: numbered }, null, 2) + '\n',
    )
  }
  index++
}

console.log(
  `\n${slideshows.length} kept, ${rejected.length} rejected · ${model ?? 'unknown model'} · $${costUsd.toFixed(4)}`,
)
if (PRINT) {
  console.log('--print, so nothing was written.')
} else {
  console.log(`Written to ${OUTDIR}/. Render with: npx tsx scripts/content/post.mts --size story`)
}
process.exit(0)
