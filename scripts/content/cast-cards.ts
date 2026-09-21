#!/usr/bin/env -S npx tsx
/**
 * Instagram posts with the cast in them.
 *
 *   pnpm cards:cast                          # every post, 1080x1350
 *   pnpm cards:cast -- --size story          # 1080x1920
 *   pnpm cards:cast -- --only journal --out /tmp/x
 *
 * The deck is `content/copy/cast-posts.ts`. Ember, Skye and Plum are drawn from
 * `@ct/shared/cast` — the same geometry the phone, the widget and the website
 * draw, so a post and the app are provably one drawing rather than two people's
 * idea of the same character.
 *
 * **Why two renderers.** Shapes go through librsvg (via sharp), which is the
 * only thing here that can turn the cast's paths into pixels. Text does *not*:
 * fontconfig on this machine has no config file at all, so librsvg resolves
 * every family to a Helvetica fallback and Baloo never appears. ffmpeg's
 * `drawtext` takes a font *file* and goes straight to FreeType, which is why
 * `cards.mjs` has always used it. So: sharp draws the scene, ffmpeg writes on
 * it. The one cost is that this file has to measure its own text — see `face`.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { drawing, figureMarkup, GRID, type CastName, type Mood, type Prop } from '../../packages/shared/src/cast.ts'
import { POSTS, type Post } from '../../content/copy/cast-posts.ts'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

/* ---- The page ------------------------------------------------------------ */

const SIZES = {
  post: { w: 1080, h: 1350 }, // Instagram feed portrait, the densest slot
  story: { w: 1080, h: 1920 }, // Stories / Reels / TikTok cover
  square: { w: 1080, h: 1080 },
} as const

type SizeName = keyof typeof SIZES

/**
 * Sampled from `store/feature-graphic.png` and `apps/mobile/theme/colors.ts`,
 * so a post, the Play listing and the app itself share one ground. The three
 * macro colours are the cast's own body ramps — that is the whole trick the
 * brand runs on, and it is not a coincidence to be maintained in two places:
 * `ember`, `skye` and `plum` below are read out of the drawing.
 */
const INK = '#1b1a15'
const CREAM = '#f7efe6'
const MUTED = '#8f8880'
const JADE = '#3ddc97'
/** The card's surface, a shade off the cream so it reads as a thing on a page. */
const SURFACE = '#fffaf3'

const MACRO: Record<CastName, { colour: string; deep: string; label: string }> = {
  ember: { ...ramp('ember'), label: 'protein' },
  skye: { ...ramp('skye'), label: 'carbs' },
  plum: { ...ramp('plum'), label: 'fat' },
}

function ramp(name: CastName) {
  const [, colour, deep] = drawing(name, 'idle').gradients.body
  return { colour, deep }
}

/* ---- Fonts --------------------------------------------------------------- */

/** Where the app's own faces are installed — they are its dependency, not this script's. */
const FONT_DIR = join(ROOT, 'apps/mobile/node_modules/@expo-google-fonts')

const FONTS = {
  /** Baloo 2 ExtraBold: the shouting. Vendored in the app, so read from there. */
  display: join(ROOT, 'apps/mobile/assets/fonts/Baloo2_800ExtraBold.ttf'),
  /**
   * Baloo 2 has no Cyrillic at all (see `DISPLAY_FACES` in
   * `apps/mobile/theme/typography.ts`), so a Bulgarian headline set in it falls
   * back per glyph. Nunito Black stands in, exactly as it does in the app.
   */
  displayCyrillic: join(FONT_DIR, 'nunito/900Black/Nunito_900Black.ttf'),
  body: join(FONT_DIR, 'nunito/600SemiBold/Nunito_600SemiBold.ttf'),
  bodyBold: join(FONT_DIR, 'nunito/800ExtraBold/Nunito_800ExtraBold.ttf'),
  serif: join(FONT_DIR, 'fraunces/400Regular/Fraunces_400Regular.ttf'),
} as const

type FontName = keyof typeof FONTS

const CYRILLIC = /[Ѐ-ӿ]/

/** The display face a headline needs, by what it is written in. */
const displayFor = (text: string): FontName => (CYRILLIC.test(text) ? 'displayCyrillic' : 'display')

/**
 * Advance widths, straight out of the font file.
 *
 * ffmpeg will centre a line for us (`x=(w-text_w)/2`) but it will not say how
 * wide it is, and half of what is drawn here is a shape wrapped *around* text:
 * a chat bubble, a macro pill, a card that has to be tall enough for its title.
 * So the `cmap`, `hhea` and `hmtx` tables are read here and the same arithmetic
 * FreeType does is done twice. No kerning, which is what `drawtext` does too.
 */
interface Face {
  upem: number
  ascent: number
  descent: number
  width: (text: string, size: number) => number
  /** The line box: what a line of this face occupies, at this size. */
  line: (size: number) => number
}

const faces = new Map<FontName, Face>()

function face(name: FontName): Face {
  const cached = faces.get(name)
  if (cached) return cached
  const built = readFace(FONTS[name])
  faces.set(name, built)
  return built
}

function readFace(path: string): Face {
  const d = readFileSync(path)
  const tables = new Map<string, number>()
  const count = d.readUInt16BE(4)
  for (let i = 0; i < count; i++) {
    const at = 12 + 16 * i
    tables.set(d.toString('latin1', at, at + 4), d.readUInt32BE(at + 8))
  }
  const head = tables.get('head')!
  const hhea = tables.get('hhea')!
  const hmtx = tables.get('hmtx')!
  const upem = d.readUInt16BE(head + 18)
  const ascent = d.readInt16BE(hhea + 4)
  const descent = -d.readInt16BE(hhea + 6)
  const longMetrics = d.readUInt16BE(hhea + 34)

  const advance = (glyph: number) => {
    const i = Math.min(glyph, longMetrics - 1)
    return d.readUInt16BE(hmtx + 4 * i)
  }

  const map = readCmap(d, tables.get('cmap')!)
  const widths = (text: string, size: number) => {
    let sum = 0
    for (const ch of text) sum += advance(map(ch.codePointAt(0)!))
    return (sum * size) / upem
  }
  return {
    upem,
    ascent,
    descent,
    width: widths,
    line: (size) => ((ascent + descent) * size) / upem,
  }
}

/** Format 4 is enough: every script this app ships in lives in the BMP. */
function readCmap(d: Buffer, cmap: number): (code: number) => number {
  const n = d.readUInt16BE(cmap + 2)
  let best = 0
  for (let i = 0; i < n; i++) {
    const at = cmap + 4 + 8 * i
    const platform = d.readUInt16BE(at)
    const encoding = d.readUInt16BE(at + 2)
    const offset = d.readUInt32BE(at + 4)
    const windowsUnicode = platform === 3 && (encoding === 1 || encoding === 10)
    if (windowsUnicode || (platform === 0 && best === 0)) best = cmap + offset
  }
  if (!best || d.readUInt16BE(best) !== 4) return () => 0
  const segs = d.readUInt16BE(best + 6) / 2
  const ends = best + 14
  const starts = ends + segs * 2 + 2
  const deltas = starts + segs * 2
  const ranges = deltas + segs * 2
  return (code) => {
    for (let i = 0; i < segs; i++) {
      if (d.readUInt16BE(ends + i * 2) < code) continue
      if (d.readUInt16BE(starts + i * 2) > code) return 0
      const rangeOffset = d.readUInt16BE(ranges + i * 2)
      if (rangeOffset === 0) return (code + d.readInt16BE(deltas + i * 2)) & 0xffff
      const at = ranges + i * 2 + rangeOffset + (code - d.readUInt16BE(starts + i * 2)) * 2
      const glyph = d.readUInt16BE(at)
      return glyph === 0 ? 0 : (glyph + d.readInt16BE(deltas + i * 2)) & 0xffff
    }
    return 0
  }
}

/** Greedy wrap on measured widths rather than on a character count. */
function wrap(text: string, font: FontName, size: number, max: number): string[] {
  const f = face(font)
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word
    if (!line || f.width(next, size) <= max) line = next
    else {
      lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  return lines
}

/**
 * The size a headline has to come down to for it to fit in `max` wide and
 * `lines` tall. Type scales to the card, never the card to the type.
 */
function fit(text: string, font: FontName, start: number, max: number, lines: number): { size: number; rows: string[] } {
  let size = start
  for (;;) {
    const rows = wrap(text, font, size, max)
    if (rows.length <= lines || size <= start * 0.5) return { size: Math.round(size), rows }
    size *= 0.94
  }
}

/* ---- Drawing the cast ---------------------------------------------------- */

/**
 * One figure, placed. `x` and `y` are the *centre of its feet*, which is how
 * you actually think about a character standing on something.
 *
 * The drawing is on a 120-unit grid whose baseline is the bottom of the box, so
 * a figure `size` tall sits with its feet at `y` when the group is translated
 * to `y - size`.
 */
function figure(
  name: CastName,
  mood: Mood,
  size: number,
  x: number,
  y: number,
  options: { prop?: Prop; flip?: boolean; id?: string } = {},
): { defs: string; body: string } {
  const prefix = `${name}${options.id ?? ''}-`
  const { defs, shapes } = figureMarkup(name, mood, prefix, options.prop)
  const scale = size / GRID
  const flip = options.flip ? ` scale(-1 1) translate(${-GRID} 0)` : ''
  return {
    defs,
    body: `<g transform="translate(${x - size / 2} ${y - size}) scale(${scale})${flip}">${shapes}</g>`,
  }
}

/**
 * The two paws on a card's top edge — the front half of a figure that is drawn
 * *behind* the card, exactly as `PeekHands` is on the phone.
 *
 * Without them the card's edge cuts the figure in half and reads as a clipping
 * mistake; with them it reads as somebody holding on and looking over the top.
 */
function paws(name: CastName, x: number, y: number, size: number): string {
  const [light, mid, deep] = drawing(name, 'idle').gradients.body
  const r = size * 0.115
  const one = (cx: number) =>
    `<g><ellipse cx="${cx}" cy="${y + r * 0.2}" rx="${r}" ry="${r * 0.69}" fill="${deep}" opacity="0.35"/>` +
    `<ellipse cx="${cx}" cy="${y}" rx="${r * 0.96}" ry="${r * 0.67}" fill="${mid}" stroke="${deep}" stroke-width="${r * 0.19}"/>` +
    `<ellipse cx="${cx - r * 0.3}" cy="${y - r * 0.21}" rx="${r * 0.33}" ry="${r * 0.19}" fill="${light}" opacity="0.8"/></g>`
  return one(x - size * 0.17) + one(x + size * 0.17)
}

/**
 * The moods that hold their arms up. A figure peeking over a card's edge has
 * its paws on the rim (`paws`) — but only while its arms are *down*, or the
 * drawing grows a second pair of hands. The app has the same rule the other way
 * round: the hands fade out as the carrier pops up to cheer.
 */
const RAISED = new Set<Mood>(['cheer', 'wave', 'proud', 'hopeful', 'stretch', 'surprised'])

/**
 * A chat bubble with one corner tucked in, the way the journal draws the one
 * you typed — the tuck is what makes a bubble read as coming *from* somewhere
 * (`userBubble` in the journal's styles).
 *
 * SVG has no per-corner radius, so it is a rounded rect with a small square
 * patch drawn over the corner that is meant to be tight.
 */
function bubble(x: number, y: number, w: number, h: number, fill: string, tuck: 'right' | 'left' = 'right'): string {
  const r = Math.round(h * 0.34)
  const nib = Math.round(r * 0.55)
  const cut = tuck === 'right' ? x + w - nib : x
  return (
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}"/>` +
    `<rect x="${cut}" y="${y + h - nib}" width="${nib}" height="${nib}" fill="${fill}"/>`
  )
}

/* ---- Text, as ffmpeg draws it -------------------------------------------- */

interface Line {
  text: string
  font: FontName
  size: number
  colour: string
  /** Left edge, or `'centre'` for the canvas centre. */
  x: number | 'centre'
  /** Top of the line box. */
  y: number
}

/* ---- The layouts --------------------------------------------------------- */

interface Scene {
  defs: string
  shapes: string
  lines: Line[]
  bg: string
}

interface Page {
  w: number
  h: number
}

/** The margin every layout breathes in. */
const PAD = 96

/**
 * The ground a post is printed on.
 *
 * A grid of nothing but ink is handsome and monotonous; a grid of nothing but
 * colour is a toy. Three grounds, chosen per post, give the profile a rhythm
 * without giving it a second identity: the type, the cast and the wordmark do
 * not change.
 *
 * `macro` is the character's own deep colour — the Duolingo move, where the
 * page is the character rather than a stage for it.
 */
export type Ground = 'ink' | 'cream' | 'macro'

interface Theme {
  bg: string
  head: string
  sub: string
  /** Whether the cast needs a light behind them. On colour they do not. */
  lit: boolean
}

function theme(ground: Ground | undefined, who: CastName): Theme {
  switch (ground ?? 'ink') {
    case 'cream':
      return { bg: CREAM, head: INK, sub: MUTED, lit: false }
    case 'macro':
      return { bg: MACRO[who].deep, head: CREAM, sub: '#ffffff', lit: false }
    default:
      return { bg: INK, head: CREAM, sub: MUTED, lit: true }
  }
}

/**
 * Where the words go, and what is left over for the drawing.
 *
 * Laid out from both ends rather than down the page: the headline hangs from
 * the top, the subline and the wordmark stand on the bottom, and whatever is
 * between them is the band the art is centred in. Stacking downwards instead is
 * what put a subline through the wordmark on the first render — the art's own
 * height decided where the words started, so anything tall pushed them off the
 * page.
 */
interface Frame {
  lines: Line[]
  top: number
  bottom: number
}

function frame(page: Page, palette: Theme, head: string, sub: string | undefined, headStart = 100): Frame {
  const inner = page.w - PAD * 2
  const lines: Line[] = []
  const font = displayFor(head)
  const headFit = fit(head, font, headStart, inner, 3)
  const headStep = Math.round(headFit.size * 1.1)
  headFit.rows.forEach((text, i) =>
    lines.push({ text, font, size: headFit.size, colour: palette.head, x: 'centre', y: PAD * 1.25 + i * headStep }),
  )
  const top = PAD * 1.25 + headFit.rows.length * headStep + 24

  const markTop = page.h - PAD - 6
  lines.push({ text: 'Day So Far', font: 'body', size: 34, colour: palette.sub, x: 'centre', y: markTop })

  let bottom = markTop - 44
  if (sub) {
    const subFit = fit(sub, 'body', 44, inner * 0.88, 3)
    const subStep = Math.round(subFit.size * 1.3)
    const subTop = bottom - subFit.rows.length * subStep
    subFit.rows.forEach((text, i) =>
      lines.push({ text, font: 'body', size: subFit.size, colour: palette.sub, x: 'centre', y: subTop + i * subStep }),
    )
    bottom = subTop - 40
  }
  return { lines, top, bottom }
}

/**
 * The shadow a figure casts on what it is standing on — the app's own `contact`
 * style, an ellipse under the feet rather than a halo round the whole drawing.
 *
 * A drawn ledge was the first try and it read as a scrollbar: a straight bar
 * across a post is a piece of interface, not a floor.
 */
function contact(x: number, y: number, size: number, colour: string): string {
  return `<ellipse cx="${x}" cy="${y}" rx="${size * 0.3}" ry="${size * 0.055}" fill="${colour}" opacity="0.22"/>`
}

/** Nothing drawn — a glow that isn't needed, on a ground that is already lit. */
const BLANK = { defs: '', shapes: '' }

/**
 * A soft glow of somebody's own colour behind them, so a dark post is still
 * *their* post. Not a gradient on the figure: a light in the room.
 */
function glow(name: CastName, cx: number, cy: number, r: number, id: string): { defs: string; shapes: string } {
  const { colour } = MACRO[name]
  return {
    defs: `<radialGradient id="${id}" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${colour}" stop-opacity="0.34"/><stop offset="0.55" stop-color="${colour}" stop-opacity="0.11"/><stop offset="1" stop-color="${colour}" stop-opacity="0"/></radialGradient>`,
    shapes: `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${id})"/>`,
  }
}

/**
 * **solo** — one of them, big, with one line over their head.
 *
 * The Duolingo shape, and it is the shape because it works: the character is
 * the post, the words are a caption on it, and the logo is nowhere. Ours keeps
 * a wordmark because nobody knows the cast yet; the day somebody recognises
 * Ember without being told is the day it can come off.
 */
function solo(post: Extract<Post, { layout: 'solo' }>, page: Page): Scene {
  const palette = theme(post.ground, post.who)
  const f = frame(page, palette, post.head, post.sub, 104)
  // As big as the band will take, and no bigger than the page can carry.
  const size = Math.round(Math.min(f.bottom - f.top, page.h * 0.46))
  const feet = Math.round(f.top + (f.bottom - f.top + size) / 2)
  const lit = palette.lit ? glow(post.who, page.w / 2, feet - size * 0.45, size * 0.95, 'solo-glow') : BLANK
  const who = figure(post.who, post.mood ?? 'wave', size, page.w / 2, feet, { prop: post.prop })
  return { defs: lit.defs + who.defs, shapes: lit.shapes + who.body, lines: f.lines, bg: palette.bg }
}

/**
 * **trio** — the three of them on the ledge, which is where they live.
 *
 * Their sizes are not equal on purpose: Plum is a drop and Skye a sprout, and
 * drawn to the same box Skye looks like the big one. These are the phone's own
 * proportions, from `CastLedge`.
 */
function trio(post: Extract<Post, { layout: 'trio' }>, page: Page): Scene {
  const palette = theme(post.ground, 'skye')
  const f = frame(page, palette, post.head, post.sub, 98)
  const inner = page.w - PAD * 2
  const band = f.bottom - f.top
  // Big enough to read at a thumbnail, small enough that three of them do not
  // touch. They stand closer than a third of the page each: the three of them
  // are a group, and a group has to look like one.
  const gap = Math.round(inner * 0.3)
  const base = Math.round(Math.min(band * 0.78, gap * 1.28))
  const feet = Math.round(f.top + (band + base) / 2)
  const cast: { name: CastName; scale: number; mood: Mood }[] = [
    { name: 'ember', scale: 0.94, mood: post.moods?.[0] ?? 'hop' },
    { name: 'skye', scale: 1, mood: post.moods?.[1] ?? 'wave' },
    { name: 'plum', scale: 0.92, mood: post.moods?.[2] ?? 'idle' },
  ]
  const defs: string[] = []
  const shapes: string[] = []
  cast.forEach((member, i) => {
    const x = page.w / 2 + (i - 1) * gap
    const size = Math.round(base * member.scale)
    const lit = palette.lit ? glow(member.name, x, feet - size * 0.45, size, `trio-${i}`) : BLANK
    const who = figure(member.name, member.mood, size, x, feet, { id: String(i) })
    defs.push(lit.defs, who.defs)
    shapes.push(lit.shapes, contact(x, feet - 2, size, MACRO[member.name].deep), who.body)
  })
  return { defs: defs.join(''), shapes: shapes.join(''), lines: f.lines, bg: palette.bg }
}

/**
 * **journal** — the app's own moment, which is the one thing no competitor can
 * copy: somebody types what they ate, a card lands, and whoever the meal is
 * mostly made of catches it.
 *
 * Everything in here is a real part of the product — the bubble is the
 * composer's, the card is `ChatCard`'s, the carrier is picked by the same rule
 * `dominant()` uses in `components/cast/Presence.tsx`. Which is the point: it
 * is a screenshot that happens to be drawn rather than captured, so it can be
 * set in any language, at any size, without a simulator and without waiting for
 * a build.
 */
function journal(post: Extract<Post, { layout: 'journal' }>, page: Page): Scene {
  const who = post.who ?? dominant(post)
  const palette = theme(post.ground, who)
  const caught = post.caught ?? `${title(who)} caught it — mostly ${MACRO[who].label}`
  const f = frame(page, palette, post.head ?? 'A sentence is a log', caught, 82)
  const inner = page.w - PAD * 2
  const lines = [...f.lines]
  const defs: string[] = []
  const shapes: string[] = []

  /* The card is the fixed object; the bubble hangs above it, and between them
     is exactly the room the carrier needs to stand up out of the card's edge.
     Left to the leftovers it was drawn under the bubble. */
  const cardH = Math.round(page.h * 0.235)
  const peek = Math.round(cardH * 0.95)
  const typedSize = 46
  const bubbleH = Math.round(typedSize * 1.9)
  const clear = Math.round(peek * 0.82)
  const band = f.bottom - f.top
  let y = Math.round(f.top + (band - (bubbleH + clear + cardH)) / 2)

  /* The typed line, in a bubble sized to it — the app's own accent, tucked at
     the corner the way the composer's bubbles are. */
  const typed = face('bodyBold').width(post.typed, typedSize)
  const bubbleW = Math.round(Math.min(inner, typed + 76))
  const bubbleX = page.w - PAD - bubbleW
  shapes.push(bubble(bubbleX, y, bubbleW, bubbleH, JADE))
  lines.push({
    text: post.typed,
    font: 'bodyBold',
    size: typedSize,
    colour: INK,
    x: Math.round(bubbleX + (bubbleW - typed) / 2),
    y: Math.round(y + bubbleH * 0.24),
  })
  y += bubbleH + clear

  /* The card, with the carrier behind it and its paws on the rim. */
  const cardX = PAD
  const peekX = Math.round(cardX + inner - peek * 0.62)
  /* Cheering, they are popped up over the rim with their hands in the air;
     at rest they are sunk behind it, holding on. Both are the app's. */
  const mood = post.mood ?? 'cheer'
  const cheering = RAISED.has(mood)
  const feet = y + peek * (cheering ? 0.06 : 0.26)
  const lit = palette.lit ? glow(who, peekX, y - peek * 0.3, peek * 1.2, 'journal-glow') : BLANK
  const carrier = figure(who, mood, peek, peekX, feet, { id: 'peek' })
  defs.push(lit.defs, carrier.defs)
  shapes.push(lit.shapes, carrier.body)
  shapes.push(`<rect x="${cardX}" y="${y}" width="${inner}" height="${cardH}" rx="34" fill="${SURFACE}"/>`)
  if (!cheering) shapes.push(paws(who, peekX, y + 1, peek))

  const nameSize = 44
  lines.push({ text: post.meal, font: 'bodyBold', size: nameSize, colour: MUTED, x: cardX + 44, y: y + 34 })
  lines.push({
    text: `${post.kcal} kcal`,
    font: 'display',
    size: 82,
    colour: INK,
    x: cardX + 40,
    y: y + 34 + Math.round(nameSize * 1.3),
  })

  /* The three macros, in the three colours, in the app's own order. */
  const pillY = y + cardH - 80
  let pillX = cardX + 44
  const macros: [CastName, number][] = [
    ['ember', post.protein],
    ['skye', post.carbs],
    ['plum', post.fat],
  ]
  for (const [name, grams] of macros) {
    const text = `${grams} g ${MACRO[name].label}`
    const w = Math.round(face('bodyBold').width(text, 32) + 70)
    shapes.push(
      `<rect x="${pillX}" y="${pillY}" width="${w}" height="54" rx="27" fill="${MACRO[name].colour}" opacity="0.2"/>`,
      `<circle cx="${pillX + 27}" cy="${pillY + 27}" r="9" fill="${MACRO[name].colour}"/>`,
    )
    lines.push({ text, font: 'bodyBold', size: 32, colour: MACRO[name].deep, x: pillX + 46, y: pillY + 9 })
    pillX += w + 16
  }
  return { defs: defs.join(''), shapes: shapes.join(''), lines, bg: palette.bg }
}

/**
 * **guess** — a meal, the three of them, and a question.
 *
 * The one format in the deck written to be answered rather than read. Yazio's
 * grid is half this ("which potato is joining your dinner?") and it is the
 * cheapest engagement in the category; the difference is that ours has a right
 * answer and the app is the thing that knows it.
 */
function guess(post: Extract<Post, { layout: 'guess' }>, page: Page): Scene {
  const palette = theme(post.ground, 'ember')
  const f = frame(page, palette, post.head, post.sub ?? 'Answer in the comments', 92)
  const inner = page.w - PAD * 2
  const lines = [...f.lines]
  const defs: string[] = []
  const shapes: string[] = []

  const typedSize = 44
  const bubbleH = Math.round(typedSize * 1.9)
  const band = f.bottom - f.top
  const gap = Math.round(inner * 0.3)
  const size = Math.round(Math.min((band - bubbleH) * 0.62, gap * 1.28))
  const stack = bubbleH + Math.round(page.h * 0.05) + size + 82
  let y = Math.round(f.top + (band - stack) / 2)

  /* The meal, typed the way somebody would type it. */
  const typed = face('bodyBold').width(post.typed, typedSize)
  const bubbleW = Math.round(Math.min(inner, typed + 76))
  const bubbleX = Math.round((page.w - bubbleW) / 2)
  shapes.push(bubble(bubbleX, y, bubbleW, bubbleH, JADE, 'left'))
  lines.push({
    text: post.typed,
    font: 'bodyBold',
    size: typedSize,
    colour: INK,
    x: Math.round(bubbleX + (bubbleW - typed) / 2),
    y: Math.round(y + bubbleH * 0.24),
  })
  y += bubbleH + Math.round(page.h * 0.05)

  /* Three of them in a row, each labelled with the macro they carry, so the
     question can be answered by somebody who has never seen the app. */
  const feet = y + size
  const names: CastName[] = ['ember', 'skye', 'plum']
  names.forEach((name, i) => {
    const x = page.w / 2 + (i - 1) * gap
    const lit = palette.lit ? glow(name, x, feet - size * 0.45, size, `guess-${i}`) : BLANK
    const who = figure(name, i === 1 ? 'hopeful' : 'idle', size, x, feet, { id: String(i) })
    defs.push(lit.defs, who.defs)
    shapes.push(lit.shapes, contact(x, feet - 2, size, MACRO[name].deep), who.body)
    const label = MACRO[name].label
    const w = Math.round(face('bodyBold').width(label, 34) + 60)
    shapes.push(
      `<rect x="${Math.round(x - w / 2)}" y="${feet + 26}" width="${w}" height="56" rx="28" fill="${MACRO[name].colour}" opacity="0.22"/>`,
    )
    lines.push({
      text: label,
      font: 'bodyBold',
      size: 34,
      colour: MACRO[name].colour,
      x: Math.round(x - w / 2 + 30),
      y: feet + 35,
    })
  })
  return { defs: defs.join(''), shapes: shapes.join(''), lines, bg: palette.bg }
}

/**
 * Whoever the meal is mostly made of, by calories — the same three lines as
 * `dominant()` in `components/cast/Presence.tsx`, and they have to stay the
 * same three: a post that gives a meal to the wrong character is a post that
 * contradicts the app.
 */
function dominant({ protein, carbs, fat }: { protein: number; carbs: number; fat: number }): CastName {
  const p = protein * 4
  const c = carbs * 4
  const f = fat * 9
  if (f > p && f > c) return 'plum'
  if (c > p) return 'skye'
  return 'ember'
}

const title = (s: string) => s[0]!.toUpperCase() + s.slice(1)

/* ---- Rendering ----------------------------------------------------------- */

function build(post: Post, page: Page): Scene {
  switch (post.layout) {
    case 'solo':
      return solo(post, page)
    case 'trio':
      return trio(post, page)
    case 'journal':
      return journal(post, page)
    case 'guess':
      return guess(post, page)
  }
}

async function render(post: Post, page: Page, dest: string, tmp: string) {
  const scene = build(post, page)
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${page.w}" height="${page.h}" viewBox="0 0 ${page.w} ${page.h}">` +
    `<defs>${scene.defs}</defs>` +
    `<rect width="${page.w}" height="${page.h}" fill="${scene.bg}"/>` +
    scene.shapes +
    `</svg>`
  const base = join(tmp, 'scene.png')
  await sharp(Buffer.from(svg)).png().toFile(base)

  // One `drawtext` per line: a newline inside one draws a .notdef box, and the
  // text goes to a file rather than into the graph because half of this copy
  // contains apostrophes and colons, which are graph syntax there.
  const draws = scene.lines.map((line, i) => {
    const file = join(tmp, `line${i}.txt`)
    writeFileSync(file, line.text, 'utf8')
    const x = line.x === 'centre' ? '(w-text_w)/2' : String(Math.round(line.x))
    return (
      `drawtext=fontfile='${esc(FONTS[line.font])}':textfile='${esc(file)}'` +
      `:fontcolor=0x${line.colour.replace('#', '')}:fontsize=${line.size}:x=${x}:y=${Math.round(line.y)}`
    )
  })
  const r = spawnSync(
    'ffmpeg',
    ['-v', 'error', '-y', '-i', base, '-vf', `${draws.join(',')},format=rgb24`, '-frames:v', '1', dest],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  )
  if (r.error) throw new Error(`ffmpeg not on PATH? ${r.error.message}`)
  if (r.status !== 0) throw new Error((r.stderr || '').trim().split('\n').slice(-3).join('\n'))
}

/** Forward slashes and an escaped colon survive the filter parser. */
const esc = (p: string) => p.replace(/\\/g, '/').replace(/:/g, '\\:')

/* ---- The command --------------------------------------------------------- */

const FLAGS = new Set(['out', 'size', 'only', 'limit'])
const argv = process.argv.slice(2)
const opts: Record<string, string> = {}
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]!
  if (!a.startsWith('--')) continue
  const name = a.slice(2)
  if (!FLAGS.has(name)) {
    console.error(`Unknown flag --${name}. Known: ${[...FLAGS].join(', ')}`)
    process.exit(1)
  }
  opts[name] = argv[++i]!
}

const SIZE = (opts.size ?? 'post') as SizeName
if (!SIZES[SIZE]) {
  console.error(`Unknown --size ${SIZE}. Known: ${Object.keys(SIZES).join(', ')}`)
  process.exit(1)
}
const OUTDIR = opts.out ?? join(ROOT, 'content/out/cast')
const page = SIZES[SIZE]

for (const [label, path] of Object.entries(FONTS)) {
  if (!existsSync(path)) {
    console.error(`Missing font ${label}: ${path}\nRun pnpm install first.`)
    process.exit(1)
  }
}

let deck = POSTS
if (opts.only) deck = deck.filter((p) => p.layout === opts.only)
if (opts.limit) deck = deck.slice(0, Number(opts.limit))
if (!deck.length) {
  console.error('Nothing to render. Check --only against the layouts in content/copy/cast-posts.ts.')
  process.exit(1)
}

mkdirSync(OUTDIR, { recursive: true })
/* Last run's pages, cleared: the file names carry the post's place in the deck,
   so adding one in the middle otherwise leaves an orphan of the old numbering
   in the folder somebody is about to post from. */
if (!opts.only && !opts.limit) {
  for (const file of readdirSync(OUTDIR)) {
    if (file.startsWith(`${SIZE}-`) && file.endsWith('.png')) unlinkSync(join(OUTDIR, file))
  }
}
const tmp = join(OUTDIR, '.tmp')
mkdirSync(tmp, { recursive: true })
console.log(`${deck.length} post(s), ${page.w}x${page.h} -> ${OUTDIR}/\n`)

let ok = 0
for (const [i, post] of deck.entries()) {
  const n = String(i + 1).padStart(2, '0')
  const dest = join(OUTDIR, `${SIZE}-${post.layout}-${n}.png`)
  try {
    await render(post, page, dest, tmp)
    ok++
    const kb = (statSync(dest).size / 1024).toFixed(0).padStart(4)
    console.log(`  ${n}  ${post.layout.padEnd(8)} ${kb} KB  ${label(post)}`)
  } catch (e) {
    console.error(`  ${n}  ${post.layout.padEnd(8)} FAILED  ${label(post)}\n      ${(e as Error).message}`)
  }
}

rmSync(tmp, { recursive: true, force: true })
console.log(`\n${ok}/${deck.length} written to ${OUTDIR}/`)
process.exit(ok === deck.length ? 0 : 1)

function label(post: Post): string {
  return post.layout === 'journal' ? post.typed : post.layout === 'guess' ? post.typed : post.head
}
