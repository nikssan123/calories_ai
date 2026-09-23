#!/usr/bin/env tsx
// What shipped, where, and how it did — into content/posted.csv.
//
//   npx tsx scripts/content/posted.mts --direct          # against DATABASE_URL
//   npx tsx scripts/content/posted.mts --direct --print   # show, write nothing
//
// §7 named this file and its columns — `date, file, hook, platform, views,
// likes, comments, installs` — before any of the tooling existed, and it has
// been empty ever since. The panel shows the same figures live; this is the
// archive, and the reason to keep one is that Buffer's free plan forgets
// anything older than thirty days.
//
// `installs` is left blank on purpose. It comes from Play Console and App Store
// Connect, neither of which attributes an install to a post — §7 says to pull
// the daily number by hand, and a column this script invented would be a guess
// dressed as a measurement. Fill it in yourself or leave it; the point of the
// row is that the hook and the date are recorded next to each other.
//
// Existing rows are kept and matched on (date, platform, file), so re-running
// updates the numbers for a post as Buffer catches up rather than duplicating
// it. That matters because metrics arrive late: a post published tonight reads
// zero everywhere until Buffer next polls.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const FLAGS = new Set(['out', 'print', 'direct'])
const BOOL = new Set(['print', 'direct'])
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

const OUT = opts.out ?? 'content/posted.csv'
const PRINT = opts.print === 'true'

if (opts.direct !== 'true') {
  console.error('Pass --direct. There is no HTTP path: /admin/* needs a session and this has none.')
  console.error('It reads whatever DATABASE_URL points at, so that deserves to be typed out.')
  process.exit(1)
}

const { postedPerformance } = await import('../../apps/api/src/services/social.ts')

const HEAD = 'date,file,hook,platform,views,likes,comments,installs'
const cell = (v: string | number) => {
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** The first metric present from a list of Buffer's names for the same idea. */
function pick(metrics: { name: string; value: number }[], names: string[]): string {
  for (const name of names) {
    const hit = metrics.find((m) => m.name === name)
    if (hit) return String(Math.round(hit.value))
  }
  return ''
}

const rows = new Map<string, string>()

// Carry over what is already there, so a hand-filled `installs` survives.
if (existsSync(OUT)) {
  for (const line of readFileSync(OUT, 'utf8').split('\n')) {
    if (!line.trim() || line.startsWith('date,')) continue
    const [date, file, , platform] = line.split(',')
    rows.set(`${date}|${platform}|${file}`, line)
  }
}
const carried = rows.size

const posted = await postedPerformance()
let written = 0
for (const item of posted) {
  for (const ch of item.channels) {
    // Undated until it has actually gone out: a scheduled post has no result.
    const when = ch.sentAt ?? ch.dueAt
    if (!when) continue
    const date = when.slice(0, 10)
    const key = `${date}|${ch.service}|${item.key}`
    const existing = rows.get(key)
    const installs = existing ? (existing.split(',')[7] ?? '') : ''
    rows.set(
      key,
      [
        date,
        item.key,
        // The caption's first line is the hook as posted, which is the thing
        // being tested and the only column worth reading a month later.
        cell(item.caption.split('\n')[0]!.slice(0, 120)),
        ch.service,
        pick(ch.metrics, ['views', 'impressions', 'reach']),
        pick(ch.metrics, ['likes', 'reactions']),
        pick(ch.metrics, ['comments']),
        installs,
      ].join(','),
    )
    written++
  }
}

const sorted = [...rows.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, line]) => line)
if (PRINT) {
  console.log([HEAD, ...sorted].join('\n'))
  console.log(`\n--print, so nothing was written. ${written} row(s) from Buffer, ${carried} carried.`)
} else {
  writeFileSync(OUT, [HEAD, ...sorted].join('\n') + '\n')
  console.log(`${sorted.length} row(s) -> ${OUT} (${written} from Buffer, ${carried} carried over)`)
  const blank = sorted.filter((l) => l.endsWith(',')).length
  if (blank) console.log(`${blank} row(s) have no installs figure — that column is filled by hand.`)
}
process.exit(0)
