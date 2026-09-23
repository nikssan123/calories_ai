#!/usr/bin/env tsx
// Ask the model for meme lines, and write them where memepost.mts will find them.
//
//   npx tsx scripts/content/memes.mts                   # six, to content/memes/
//   npx tsx scripts/content/memes.mts --count 10
//   npx tsx scripts/content/memes.mts --print           # show them, write nothing
//   npx tsx scripts/content/memes.mts --theme 'giving up in week two'
//
// The front of the meme chain:
//
//   clips.mts   downloads footage         -> content/clips/<set>/<id>.mp4
//   memes.mts   asks for lines            -> content/memes/<key>.json   (this)
//   memepost.mts composites the two     -> content/out/memes/<key>.mp4
//   the panel   upload, approve, schedule
//
// The sibling of suggest.mts, and deliberately a separate script rather than a
// flag on it. The two formats want different output shapes and, much more
// importantly, different voices: a slideshow explains something and a meme
// refuses to. Sharing one prompt would average them into copy that does
// neither, which is what marketing writing usually is.
//
// It runs on the Claude Code subscription by name — see ai/memes.ts — because a
// batch of short copy on Opus is a real bill on a metered key and nothing on a
// subscription already being paid for. Billed as `content_plan`.
//
// Keys are prefixed with the next free number so a generated meme sorts after
// the slideshows and memepost.mts's --only keeps working on it.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { suggestMemes, type SuggestedMeme } from '../../apps/api/src/ai/memes.ts'

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

const COUNT = Number(opts.count ?? 6)
const OUTDIR = opts.out ?? 'content/memes'
const PRINT = opts.print === 'true'

/* ── what not to repeat ─────────────────────────────────────────────── */

/**
 * The lines already in play, read out of the files rather than kept in a list
 * so it cannot drift. Both formats count: a meme that restates a slideshow's
 * hook is the same post twice as far as anybody scrolling is concerned.
 */
function existingLines(): string[] {
  const lines: string[] = []

  if (existsSync(OUTDIR)) {
    for (const file of readdirSync(OUTDIR).filter((f) => f.endsWith('.json'))) {
      try {
        const meme = JSON.parse(readFileSync(join(OUTDIR, file), 'utf8')) as SuggestedMeme
        if (meme.hook) lines.push(meme.hook.replace(/<br>/g, ' '))
      } catch {
        // A hand-edited file that no longer parses is memepost.mts's problem to
        // report, with the filename, rather than this script's to die on.
      }
    }
  }

  if (existsSync('content/slides')) {
    for (const file of readdirSync('content/slides').filter((f) => f.endsWith('.json'))) {
      try {
        const show = JSON.parse(readFileSync(join('content/slides', file), 'utf8')) as {
          hook?: string
        }
        if (show.hook) lines.push(show.hook.replace(/<br>/g, ' '))
      } catch {
        /* same */
      }
    }
  }
  return lines
}

/** The next free number, shared with the slideshows so keys never collide. */
function nextIndex(): number {
  let highest = 9
  const post = readFileSync('scripts/content/post.mts', 'utf8')
  for (const m of post.matchAll(/^\s*key: '(\d+)-/gm)) highest = Math.max(highest, Number(m[1]))
  for (const dir of ['content/slides', OUTDIR]) {
    if (!existsSync(dir)) continue
    for (const file of readdirSync(dir)) {
      const m = /^(\d+)-/.exec(file)
      if (m) highest = Math.max(highest, Number(m[1]))
    }
  }
  return highest + 1
}

/* ── run ────────────────────────────────────────────────────────────── */

const avoid = existingLines()
console.log(
  `Asking for ${COUNT}${opts.theme ? ` on "${opts.theme}"` : ''}, avoiding ${avoid.length} line(s) already in play…\n`,
)

const { memes, rejected, model, costUsd } = await suggestMemes(COUNT, avoid, opts.theme)

for (const { key, why } of rejected) {
  console.log(`  rejected  ${key.padEnd(24)} ${why}`)
}

let index = nextIndex()
for (const meme of memes) {
  const numbered = `${index}-${meme.key}`
  console.log(`\n  ${numbered}  [${meme.clip}]`)
  console.log(`    ${meme.hook.replace(/<br>/g, ' / ')}`)
  if (meme.sub) console.log(`      ${meme.sub}`)

  if (!PRINT) {
    mkdirSync(OUTDIR, { recursive: true })
    writeFileSync(
      join(OUTDIR, `${numbered}.json`),
      JSON.stringify({ ...meme, key: numbered }, null, 2) + '\n',
    )
  }
  index++
}

console.log(
  `\n${memes.length} kept, ${rejected.length} rejected · ${model ?? 'unknown model'} · $${costUsd.toFixed(4)}`,
)
if (PRINT) {
  console.log('--print, so nothing was written.')
} else {
  console.log(`Written to ${OUTDIR}/. Render with: npx tsx scripts/content/memepost.mts`)
}
process.exit(0)
