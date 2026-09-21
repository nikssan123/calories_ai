#!/usr/bin/env tsx
// The install ad, per locale — `content/copy/ad-fr.md` and `ad-bg.md` in motion.
//
//   npx tsx scripts/content/ad.mts --locale fr
//   npx tsx scripts/content/ad.mts --locale bg --fps 10    # fast proof of timing
//
// Fifteen seconds, 1080x1920 at 60fps: a lunch logged in a sentence, then
// corrected in another one, with generated B-roll on either end. The claim is
// the middle — the meal that is already recorded changes because somebody said
// a sentence about it — because that is the storage model (README §1).
//
// Renders land in content/out/ads/, which is scratch. The cut that ships is
// copied to content/ads/ — the same arrangement as post.mts and content/social/
// — beside the B-roll it is built from in content/ads/broll/. Those clips are
// committed because they are not reproducible exactly: scripts/content/broll.py
// records the prompt and seed behind each one.
//
// ── The screen is read off the source, not off a screenshot ─────────────────
//
//   apps/mobile/app/(tabs)/_layout.tsx  TABS — **Journal is the first tab**.
//   apps/mobile/app/(tabs)/index.tsx    StatusBar/StatusLine: sky band, serif
//                                       greeting, MiniRing, serif figure. Sizes
//                                       from its StyleSheet (ring 46, stroke 5.5,
//                                       figure 26/30, padding 16, row gap 12).
//   apps/mobile/components/Composer.tsx multiline, maxHeight 132 — it grows, so a
//                                       long sentence wraps rather than running
//                                       its caret off the edge.
//   apps/mobile/theme/motion.ts         the three easings, verbatim.
//   apps/mobile/hooks/useCountUp.ts     figures travel, they do not swap.
//   CAST.md §112                        the meal's journey.
//
// ── Why this does not look laggy any more ───────────────────────────────────
//
// The first cut of this file read as laggy, and three separate things did it:
//
//  1. **24fps.** The app runs at 60Hz or better, and a count-up or a spring
//     sampled at 24 steps a second is visibly stepped next to the real thing.
//     This renders at 60. The B-roll is 24fps from WAN, so it is motion-
//     interpolated (ffmpeg `minterpolate`, mci) and retimed to its slot in the
//     same pass rather than having frames repeated, which would judder.
//  2. **The thread snapped.** A card entering reserved its full height in one
//     frame, so everything above it jumped ~500px. A chat does not do that: it
//     scrolls to the end. The thread here is laid out for real in the browser
//     and its offset is eased toward the bottom every frame (time constant
//     85ms), so new content pushes the conversation up rather than teleporting
//     it. That smoothing carries state between frames, which is why frames are
//     rendered in order on one page.
//  3. **A Chrome launch per frame** (reel.mts's approach) is slow enough that
//     60fps was impractical, and a font that lost the race to the screenshot
//     would flicker. One persistent page via playwright-core — the same house
//     pattern as store/tools/compose-shot.cjs — waits for `document.fonts.ready`
//     once and renders 900 frames in a couple of minutes.
//
// Replies also *stream* — words arrive over ~0.8s in reserved space — because
// that is how the journal writes, and a paragraph popping in whole is its own
// kind of lag.
//
// ── Type ────────────────────────────────────────────────────────────────────
//
// Fraunces for Latin and **Literata for Cyrillic** (typography.ts SERIF_FACES:
// Fraunces has no Cyrillic). The bundled Nunito woff2 files are Latin-subset,
// so body text uses the full Nunito TTFs. All in `content/fonts/` (gitignored):
//
//   for p in fraunces literata nunito; do npm i --prefix "$TMPDIR/f" @expo-google-fonts/$p; done
//   then copy Fraunces_{400Regular,500Medium}, Literata_{400Regular,500Medium} and
//   Nunito_{400Regular,600SemiBold,700Bold,800ExtraBold} .ttf into content/fonts/
//
// playwright-core is resolved like compose-shot.cjs does it: $PLAYWRIGHT_CORE,
// then node_modules. It drives the installed Chrome, so nothing is downloaded:
//
//   npm i --prefix "$TMPDIR/pw-core" playwright-core
//   PLAYWRIGHT_CORE="$TMPDIR/pw-core/node_modules/playwright-core" npx tsx scripts/content/ad.mts

import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, writeFileSync, rmSync, statSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { figureMarkup, GRID, type CastName, type Mood } from '../../packages/shared/src/cast'

const FLAGS = new Set(['locale', 'fps', 'out', 'cafe', 'street', 'music', 'music-start'])
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
  opts[name] = argv[++i]
}

/* ── copy, per locale ────────────────────────────────────────────────── */

interface Locale {
  serif: 'fraunces' | 'literata'
  nav: [string, string, string, string, string, string]
  greetLead: string
  greetStress: string
  toGo: string
  placeholder: string
  meal: string
  mi: [string, string, string]
  typed1: string
  reply1: string
  typed2: string
  reply2: string
  cardTitle: string
  emoji: string
  itemsBig: string
  itemsSmall: string
  hook: string
  closeHead: string
  closeSub: string
  appSub: string
  cafe: string
  street: string
}

const LOCALES: Record<string, Locale> = {
  fr: {
    serif: 'fraunces',
    nav: ['Journal', 'Aujourd’hui', 'Cuisine', 'Sport', 'Progrès', 'Profil'],
    greetLead: '',
    greetStress: 'Bonjour',
    toGo: 'restantes',
    placeholder: 'Deux œufs et une tartine…',
    meal: 'Déjeuner',
    mi: ['P', 'G', 'L'],
    typed1: 'croque-monsieur, des frites et un verre de vin à midi',
    reply1:
      'Croque au jambon-fromage. J’ai supposé une portion moyenne de frites et un verre de rouge de 150 ml — le dîner a un peu de travail devant lui.',
    typed2: 'les frites c’était une petite portion',
    reply2: 'Petite portion, alors. Ça te laisse nettement plus de marge pour ce soir.',
    cardTitle: 'Croque-monsieur, frites et vin',
    emoji: '🥪',
    itemsBig: 'Croque-monsieur ~180 g · Frites ~110 g · Vin rouge ~150 ml',
    itemsSmall: 'Croque-monsieur ~180 g · Frites ~70 g · Vin rouge ~150 ml',
    hook: '«&nbsp;J’ai trop mangé<br>à midi.&nbsp;»',
    closeHead: 'Tu as changé<br>d’avis ?',
    closeSub: 'Dis-le : le repas enregistré se met à jour.',
    appSub: 'Compteur&nbsp;Calories · Sur&nbsp;Google&nbsp;Play',
    cafe: 'content/ads/broll/fr-cafe.webm',
    street: 'content/ads/broll/fr-street.webm',
  },
  bg: {
    serif: 'literata',
    nav: ['Дневник', 'Днес', 'Кухня', 'Движение', 'Напредък', 'Профил'],
    greetLead: 'Добър ',
    greetStress: 'ден',
    toGo: 'остават',
    placeholder: 'Две яйца и филия…',
    meal: 'Обяд',
    mi: ['П', 'В', 'М'],
    typed1: 'кюфтета с пържени картофи и една бира на обяд',
    reply1:
      'Кюфтета с пържени картофи и бира — сметнах картофите за средна порция. За вечерята остава по-малко от обикновено.',
    typed2: 'картофите бяха малка порция',
    reply2: 'Малка порция, значи. Така за вечерята остава доста повече.',
    cardTitle: 'Кюфтета с картофи и бира',
    emoji: '🍽️',
    itemsBig: 'Кюфтета ~180 g · Пържени картофи ~110 g · Бира ~330 ml',
    itemsSmall: 'Кюфтета ~180 g · Пържени картофи ~70 g · Бира ~330 ml',
    hook: 'Преядох<br>на обяд.',
    closeHead: 'Промени ли<br>решението си?',
    closeSub: 'Кажи го — записаното хранене се обновява.',
    appSub: 'Брояч&nbsp;на&nbsp;калории · в&nbsp;Google&nbsp;Play',
    cafe: 'content/ads/broll/bg-cafe.webm',
    street: 'content/ads/broll/bg-street.webm',
  },
}

const LOC = opts.locale ?? 'fr'
const L = LOCALES[LOC]
if (!L) {
  console.error(`Unknown --locale ${LOC}. Known: ${Object.keys(LOCALES).join(', ')}`)
  process.exit(1)
}

const FPS = Number(opts.fps ?? 60)
const OUTDIR = opts.out ?? 'content/out/ads'
const CAFE = opts.cafe ?? L.cafe
const STREET = opts.street ?? L.street
const MUSIC = opts.music ?? 'content/music/pixabay-leberch-cozy-ambience.mp3'
const MUSIC_START = Number(opts['music-start'] ?? 81.5)
const W = 1080
const H = 1920
/** 1080px over a ~390pt phone: every measurement lifted from the app scales by this. */
const S = W / 390

const FONTS = {
  n400: 'content/fonts/Nunito_400Regular.ttf',
  n600: 'content/fonts/Nunito_600SemiBold.ttf',
  n700: 'content/fonts/Nunito_700Bold.ttf',
  n800: 'content/fonts/Nunito_800ExtraBold.ttf',
  serif: L.serif === 'fraunces' ? 'content/fonts/Fraunces_400Regular.ttf' : 'content/fonts/Literata_400Regular.ttf',
  serifMed: L.serif === 'fraunces' ? 'content/fonts/Fraunces_500Medium.ttf' : 'content/fonts/Literata_500Medium.ttf',
}
const ICON = 'store/icon-512.png'

/* ── palette (apps/mobile/theme/colors.ts, light) ────────────────────── */

const C = {
  background: '#fff6ec',
  card: '#ffffff',
  ink: '#31261e',
  muted: '#77685b',
  border: '#eadcc9',
  track: 'rgba(120, 90, 50, 0.12)',
  calories: '#12b76a',
  caloriesText: '#07804f',
  caloriesWash: 'rgba(18, 183, 106, 0.45)',
  protein: '#ffa51f',
  proteinText: '#a85a08',
  carbs: '#3b9eff',
  carbsText: '#1a66c2',
  fat: '#b06bff',
  fatText: '#7c3ee0',
  shadow: '0px 14px 30px -18px rgba(120, 80, 20, 0.42)',
  ramp: 'linear-gradient(135deg, #12b76a 0%, #23d3b0 100%)',
  sky: 'linear-gradient(180deg, #ffd39b 0%, #ffe4c4 38%, #fff1e2 72%, rgba(255,246,236,0) 100%)',
}

/* ── the day and the meal ────────────────────────────────────────────── */

const TARGET = 2000
const EARLIER = 400
const LUNCH_BIG = { kcal: 950, p: 38, c: 78, f: 48 }
const LUNCH_SMALL = { kcal: 820, p: 36, c: 58, f: 38 }

/* ── timeline ────────────────────────────────────────────────────────── */

const SEGMENTS = [
  { key: 'hook', seconds: 2.6 },
  { key: 'app', seconds: 9.0 },
  { key: 'close', seconds: 2.0 },
  { key: 'end', seconds: 1.4 },
] as const
const TOTAL = SEGMENTS.reduce((n, s) => n + s.seconds, 0)
const FRAMES = Math.round(TOTAL * FPS)

/** Seconds into the nine-second app scene. */
const T = {
  type1To: 1.8,
  send1: 1.8,
  wait1: 1.95,
  reply1: 2.45,
  reply1Dur: 0.85,
  card1: 2.75,
  fly1: 2.8,
  spark1: 3.3,
  ring1: 3.6,
  home1: 3.85,
  type2From: 4.3,
  type2To: 5.9,
  send2: 5.9,
  wait2: 6.05,
  reply2: 6.45,
  reply2Dur: 0.55,
  morph: 6.6,
  fly2: 6.6,
  spark2: 7.1,
  ring2: 7.4,
  home2: 7.8,
}
const FLY = 0.5
const HOME = 0.45
const SPARK = 0.3

/* ── easing: the app's three curves, verbatim ────────────────────────── */

const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t)
function bezier(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by
  const fx = (t: number) => ((ax * t + bx) * t + cx) * t
  const dfx = (t: number) => (3 * ax * t + 2 * bx) * t + cx
  return (x: number) => {
    x = clamp01(x)
    let t = x
    for (let i = 0; i < 8; i++) {
      const err = fx(t) - x
      if (Math.abs(err) < 1e-6) break
      const d = dfx(t)
      if (Math.abs(d) < 1e-6) break
      t -= err / d
    }
    return ((ay * t + by) * t + cy) * t
  }
}
/** motion.ts: one spring with real overshoot, one sharper pop, one plain ease. */
const easeSpring = bezier(0.2, 1.7, 0.4, 1)
const easePop = bezier(0.3, 2.2, 0.5, 1)
const easeOut = bezier(0.22, 1, 0.36, 1)
/** useCountUp's own curve. A figure travels; it must not overshoot. */
const countEase = (t: number) => 1 - Math.pow(1 - clamp01(t), 3)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/* ── synthesised fallback bed (--music none) ─────────────────────────── */

const SAMPLE_RATE = 44100
function bed(seconds: number): Buffer {
  const n = Math.ceil(seconds * SAMPLE_RATE)
  const data = Buffer.alloc(n * 2)
  const PAD = [130.81, 196.0, 261.63, 329.63]
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE
    let v = 0
    for (let p = 0; p < PAD.length; p++) v += (0.028 / (1 + p * 0.35)) * Math.sin(2 * Math.PI * PAD[p] * t)
    v *= Math.min(1, t / 0.35) * Math.min(1, (seconds - t) / 0.9)
    data.writeInt16LE(Math.round(Math.tanh(v * 1.1) * 32767), i * 2)
  }
  const head = Buffer.alloc(44)
  head.write('RIFF', 0); head.writeUInt32LE(36 + data.length, 4); head.write('WAVE', 8)
  head.write('fmt ', 12); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22)
  head.writeUInt32LE(SAMPLE_RATE, 24); head.writeUInt32LE(SAMPLE_RATE * 2, 28)
  head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34); head.write('data', 36)
  head.writeUInt32LE(data.length, 40)
  return Buffer.concat([head, data])
}

/* ── markup ──────────────────────────────────────────────────────────── */

const url = (p: string) => pathToFileURL(resolve(p)).href
function figSvg(name: CastName, mood: Mood, prefix: string): string {
  const f = figureMarkup(name, mood, prefix)
  return `<svg viewBox="0 0 ${GRID} ${GRID}" xmlns="http://www.w3.org/2000/svg"><defs>${f.defs}</defs>${f.shapes}</svg>`
}
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const nbsp = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f')

function mealAt(mix: number) {
  return {
    kcal: Math.round(lerp(LUNCH_BIG.kcal, LUNCH_SMALL.kcal, mix)),
    p: Math.round(lerp(LUNCH_BIG.p, LUNCH_SMALL.p, mix)),
    c: Math.round(lerp(LUNCH_BIG.c, LUNCH_SMALL.c, mix)),
    f: Math.round(lerp(LUNCH_BIG.f, LUNCH_SMALL.f, mix)),
    items: mix > 0.5 ? L.itemsSmall : L.itemsBig,
  }
}

/** The journal header (index.tsx StatusBar). */
function header(shown: number, arcRatio: number, glow: number): string {
  const size = Math.round(46 * S), stroke = 5.5 * S, r = 17.5 * S
  const circ = 2 * Math.PI * r
  const greet = `${esc(L.greetLead)}<i>${esc(L.greetStress)}</i>`
  return (
    `<div class="status"><div class="sky"></div>` +
    `<div class="hello">${greet}</div>` +
    `<div class="statusRow"><div class="ringWrap" id="ring">` +
    (glow > 0.01 ? `<span class="ringGlow" style="opacity:${(glow * 0.6).toFixed(3)};transform:scale(${(0.7 + glow * 0.5).toFixed(3)})"></span>` : '') +
    `<svg class="ringSvg" viewBox="0 0 ${size} ${size}">` +
    `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${C.track}" stroke-width="${stroke}"/>` +
    `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${C.calories}" stroke-width="${stroke}" stroke-linecap="round"` +
    ` stroke-dasharray="${(circ * Math.max(0, arcRatio)).toFixed(2)} ${circ.toFixed(2)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>` +
    `</svg></div>` +
    `<div class="statusText">` +
    `<div class="statusFigure">${nbsp(shown)}<span class="toGo">  ${esc(L.toGo)}</span></div>` +
    `<div class="statusSub">${nbsp(TARGET - shown)} / ${nbsp(TARGET)} kcal</div>` +
    `</div></div></div>`
  )
}

function mealCard(mix: number, appear: number, flash: number): string {
  const { kcal, p, c, f, items } = mealAt(mix)
  const kp = p * 4, kc = c * 4, kf = f * 9
  const kt = Math.max(1, kp + kc + kf)
  const consumed = EARLIER + kcal
  return (
    `<div class="cardwrap" style="opacity:${clamp01(appear * 1.6).toFixed(3)};transform:translateY(${((1 - appear) * 34).toFixed(1)}px) scale(${(0.96 + 0.04 * appear).toFixed(4)})">` +
    `<span id="seat"></span>` +
    `<div class="card" style="box-shadow:${C.shadow}${flash > 0.01 ? `,0 0 0 ${(flash * 5).toFixed(1)}px rgba(18,183,106,${(flash * 0.3).toFixed(3)})` : ''}">` +
    `<div class="chead"><span class="cemoji">${L.emoji}</span>` +
    `<div class="ctitles"><div class="ctitle">${esc(L.cardTitle)}</div><div class="cmeal">${esc(L.meal)}</div></div>` +
    `<div class="ckcal"><span class="cfig">~${nbsp(kcal)}</span><span class="cunit">kcal</span></div></div>` +
    `<div class="macros">` +
    `<span class="mseg" style="background:${C.protein};width:${((kp / kt) * 100).toFixed(2)}%"></span>` +
    `<span class="mseg" style="background:${C.carbs};width:${((kc / kt) * 100).toFixed(2)}%"></span>` +
    `<span class="mseg" style="background:${C.fat};width:${((kf / kt) * 100).toFixed(2)}%"></span></div>` +
    `<div class="mrow"><span style="color:${C.proteinText}">${p}${L.mi[0]}</span>` +
    `<span style="color:${C.carbsText}">${c}${L.mi[1]}</span>` +
    `<span style="color:${C.fatText}">${f}${L.mi[2]}</span></div>` +
    `<div class="citems">${esc(items)}</div>` +
    `<div class="crule"></div>` +
    `<div class="daybar"><span style="width:${((consumed / TARGET) * 100).toFixed(2)}%"></span></div>` +
    `</div></div>`
  )
}

/** A reply as it streams: every word laid out from the start, revealed in turn. */
function streamed(text: string, p: number): string {
  const words = text.split(' ')
  const shown = p * words.length
  return words
    .map((w, i) => `<span style="opacity:${clamp01((shown - i) / 1.6).toFixed(3)}">${esc(w)}</span>`)
    .join(' ')
}

const IC = {
  chat: `<path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H10l-4 3.5V16h-.5A1.5 1.5 0 0 1 4 14.5z"/>`,
  flame: `<path d="M12 3s5 4.2 5 8.6A5 5 0 0 1 7 12c0-1.7.8-3 1.7-4 .2 1.2.9 2 1.8 2 1.3 0 1.8-1.4 1.5-3-.2-1.3-.6-2.6 0-4z"/>`,
  chef: `<path d="M7 20h10v-6H7zM7 14a4 4 0 0 1-1-7.9 3.6 3.6 0 0 1 6.9-1.6A3.6 3.6 0 0 1 18 6.1 4 4 0 0 1 17 14z"/>`,
  person: `<circle cx="13.5" cy="4.8" r="1.8"/><path d="M7 20l3-5 3 1.5 1-4M10 15l-1.5-4L12 9l3 2 2.5.5M6.5 11.5 9 9"/>`,
  chart: `<path d="M4 17l4.5-5 3.5 3L20 7"/>`,
  user: `<circle cx="12" cy="8" r="3.6"/><path d="M5 20c.6-3.6 3.4-5.5 7-5.5s6.4 1.9 7 5.5"/>`,
  camera: `<path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h1.2l1-1.6h6.6l1 1.6h1.2A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5z"/><circle cx="12" cy="12.5" r="3.4"/>`,
  mic: `<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3"/>`,
}
const svg = (d: string, col: string, sw = 1.7) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="${col}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`

/** TABS in _layout.tsx order: Journal FIRST. */
const TAB_BAR =
  `<div class="tabs">` +
  ([IC.chat, IC.flame, IC.chef, IC.person, IC.chart, IC.user] as string[])
    .map((d, i) => `<div class="tab${i === 0 ? ' on' : ''}"><span class="tico">${svg(d, i === 0 ? C.caloriesText : C.muted, i === 0 ? 2.6 : 2.1)}</span><span class="tlbl">${esc(L.nav[i])}</span></div>`)
    .join('') +
  `</div>`

const CAST: CastName[] = ['ember', 'skye', 'plum']
/** Ledge figures idle-hop out of phase; in the reply row they bounce harder. */
function figures(t: number, frame: number, where: 'ledge' | 'row', hidePlum: boolean): string {
  return CAST.map((n, k) => {
    const amp = where === 'row' ? 22 : 12
    const speed = where === 'row' ? 2.2 : 0.85
    const hop = Math.max(0, Math.sin(2 * Math.PI * (t * speed - k * 0.22))) ** 2
    const id = where === 'ledge' ? ` id="l${n[0]}"` : ''
    const vis = hidePlum && n === 'plum' ? 'visibility:hidden;' : ''
    return `<span class="dot"${id} style="${vis}transform:translateY(${(-hop * amp).toFixed(2)}px)">${figSvg(n, where === 'row' ? 'hop' : 'idle', `${where[0]}${k}f${frame}`)}</span>`
  }).join('')
}

interface Flight { from: string; to: string; p: number; arc: number; svg: string; size: number }
interface Frame { bg: string | null; html: string; carrier: Flight | null; spark: Flight | null; dt: number }

/** One frame of the nine-second app scene. */
function appFrame(tt: number, frame: number): Omit<Frame, 'bg' | 'dt'> {
  const typing1 = tt < T.send1
  const typed1 = Math.round(clamp01(tt / T.type1To) * L.typed1.length)
  const typed2 = Math.round(clamp01((tt - T.type2From) / (T.type2To - T.type2From)) * L.typed2.length)
  const composerText = typing1 ? L.typed1.slice(0, typed1) : tt < T.send2 ? L.typed2.slice(0, typed2) : ''

  const waiting = (tt >= T.wait1 && tt < T.reply1) || (tt >= T.wait2 && tt < T.reply2)
  const bubble = (from: number) => (tt >= from ? clamp01(easePop((tt - from) / 0.42)) : 0)
  const b1 = bubble(T.send1)
  const b2 = bubble(T.send2)
  const card = tt >= T.card1 ? clamp01(easeSpring((tt - T.card1) / 0.7)) : 0
  const mix = countEase((tt - T.morph) / 0.9)
  const flash = tt >= T.morph ? Math.max(0, Math.sin(Math.PI * clamp01((tt - T.morph) / 0.9))) : 0

  // The ring holds its number until the spark lands (CAST.md §112), then the
  // figure counts on a plain ease and the arc springs with overshoot.
  const L0 = TARGET - EARLIER
  const L1 = L0 - LUNCH_BIG.kcal
  const L2 = L0 - LUNCH_SMALL.kcal
  let shown = L0, arc = EARLIER / TARGET, glow = 0
  if (tt >= T.ring2) {
    shown = lerp(L1, L2, countEase((tt - T.ring2) / 0.9))
    arc = lerp((TARGET - L1) / TARGET, (TARGET - L2) / TARGET, easeSpring((tt - T.ring2) / 0.7))
  } else if (tt >= T.ring1) {
    shown = lerp(L0, L1, countEase((tt - T.ring1) / 0.9))
    arc = lerp((TARGET - L0) / TARGET, (TARGET - L1) / TARGET, easeSpring((tt - T.ring1) / 0.7))
  }
  for (const r of [T.ring1, T.ring2]) {
    const d = tt - r
    if (d >= 0 && d < 0.84) glow = d < 0.14 ? d / 0.14 : 1 - (d - 0.14) / 0.7
  }

  const thread: string[] = []
  const bubbleHtml = (text: string, p: number) =>
    `<div class="me" style="opacity:${clamp01(p * 2).toFixed(3)};transform:translateY(${((1 - p) * 20).toFixed(1)}px) scale(${(0.92 + 0.08 * p).toFixed(4)})">${esc(text)}</div>`
  if (b1 > 0) thread.push(bubbleHtml(L.typed1, b1))
  if (tt >= T.wait1 && tt < T.reply1) thread.push(`<div class="waiting">${figures(tt, frame, 'row', false)}</div>`)
  if (tt >= T.reply1) thread.push(`<div class="ai">${streamed(L.reply1, clamp01((tt - T.reply1) / T.reply1Dur))}</div>`)
  if (card > 0) thread.push(mealCard(tt >= T.morph ? mix : 0, card, flash))
  if (b2 > 0) thread.push(bubbleHtml(L.typed2, b2))
  if (tt >= T.wait2 && tt < T.reply2) thread.push(`<div class="waiting">${figures(tt, frame, 'row', false)}</div>`)
  if (tt >= T.reply2) thread.push(`<div class="ai">${streamed(L.reply2, clamp01((tt - T.reply2) / T.reply2Dur))}</div>`)

  // Plum's trips: ledge → card (spring), cheers on the seat, then home.
  const size = Math.round(30 * S)
  let carrier: Flight | null = null
  for (const [fly, home] of [[T.fly1, T.home1], [T.fly2, T.home2]] as const) {
    if (tt < fly || tt >= home + HOME) continue
    if (tt < fly + FLY) carrier = { from: '#lp', to: '#seat', p: easeSpring((tt - fly) / FLY), arc: 150, svg: figSvg('plum', 'hop', `cf${frame}`), size }
    else if (tt < home) carrier = { from: '#lp', to: '#seat', p: 1, arc: 0, svg: figSvg('plum', 'cheer', `cc${frame}`), size }
    else carrier = { from: '#seat', to: '#lp', p: easeOut((tt - home) / HOME), arc: 110, svg: figSvg('plum', 'hop', `ch${frame}`), size }
  }
  let spark: Flight | null = null
  for (const s of [T.spark1, T.spark2]) {
    if (tt >= s && tt < s + SPARK) spark = { from: '#seat', to: '#ring', p: easeOut((tt - s) / SPARK), arc: 260, svg: '', size: 34 }
  }

  const caret = composerText.length > 0 && Math.floor(tt * 2.2) % 2 === 0 ? '<span class="caret"></span>' : ''
  const field = composerText.length === 0 && tt < T.send1 ? `<span class="ph">${esc(L.placeholder)}</span>` : `${esc(composerText)}${caret}`

  const html =
    `<div class="app">` +
    header(shown, arc, glow) +
    `<div class="thread" id="thread"><div id="threadContent">${thread.join('')}</div></div>` +
    `<div class="composer">` +
    `<div class="cast" style="opacity:${waiting ? 0 : 1}">${figures(tt, frame, 'ledge', carrier !== null)}</div>` +
    `<span class="cam">${svg(IC.camera, C.muted)}</span>` +
    `<div class="field">${field}</div>` +
    `<span class="micb">${svg(IC.mic, C.muted)}</span></div>` +
    TAB_BAR +
    `</div>`
  return { html, carrier, spark }
}

let cafeFrames: string[] = []
let streetFrames: string[] = []
const grab = (frames: string[], p: number) => frames[Math.min(frames.length - 1, Math.max(0, Math.round(p * (frames.length - 1))))]

function frameAt(i: number): Frame {
  const t = i / FPS
  let acc = 0
  let seg: string = SEGMENTS[SEGMENTS.length - 1].key
  let local = 0
  for (const s of SEGMENTS) {
    if (t < acc + s.seconds) { seg = s.key; local = t - acc; break }
    acc += s.seconds
  }
  const dt = 1 / FPS
  if (seg === 'hook') {
    const inA = easeOut(local / 0.45)
    const outA = 1 - easeOut((local - (SEGMENTS[0].seconds - 0.3)) / 0.3)
    return {
      bg: url(grab(cafeFrames, local / SEGMENTS[0].seconds)), dt, carrier: null, spark: null,
      html: `<div class="scrim"></div><div class="over" style="opacity:${Math.min(inA, outA).toFixed(3)};transform:translateY(${((1 - inA) * 26).toFixed(1)}px)"><div class="hook">${L.hook}</div></div>`,
    }
  }
  if (seg === 'app') {
    const a = appFrame(local, i)
    return { bg: null, dt, ...a, html: `<div style="opacity:${easeOut(local / 0.25).toFixed(3)}">${a.html}</div>` }
  }
  if (seg === 'close') {
    const headIn = easeOut(local / 0.45)
    const subIn = easeOut((local - 0.4) / 0.45)
    const outA = 1 - easeOut((local - (SEGMENTS[2].seconds - 0.28)) / 0.28)
    return {
      bg: url(grab(streetFrames, local / SEGMENTS[2].seconds)), dt, carrier: null, spark: null,
      html: `<div class="scrim"></div><div class="over" style="opacity:${outA.toFixed(3)}">` +
        `<div class="hook" style="opacity:${headIn.toFixed(3)};transform:translateY(${((1 - headIn) * 26).toFixed(1)}px)">${L.closeHead}</div>` +
        `<div class="sub" style="opacity:${subIn.toFixed(3)};transform:translateY(${((1 - subIn) * 18).toFixed(1)}px)">${esc(L.closeSub)}</div></div>`,
    }
  }
  const markIn = clamp01(easePop(local / 0.55))
  const lineIn = easeOut((local - 0.3) / 0.45)
  return {
    bg: null, dt, carrier: null, spark: null,
    html: `<div class="end"><div class="mark" style="opacity:${markIn.toFixed(3)};transform:scale(${(0.86 + 0.14 * markIn).toFixed(4)})"><img src="${url(ICON)}" alt=""></div>` +
      `<div class="ename" style="opacity:${lineIn.toFixed(3)}">Day So Far</div>` +
      `<div class="esub" style="opacity:${lineIn.toFixed(3)}">${L.appSub}</div></div>`,
  }
}

/* ── the page ────────────────────────────────────────────────────────── */

const STYLE = `
@font-face{font-family:'T';src:url('${url(FONTS.n400)}') format('truetype');font-weight:400}
@font-face{font-family:'T';src:url('${url(FONTS.n600)}') format('truetype');font-weight:600}
@font-face{font-family:'T';src:url('${url(FONTS.n700)}') format('truetype');font-weight:700}
@font-face{font-family:'T';src:url('${url(FONTS.n800)}') format('truetype');font-weight:800}
@font-face{font-family:'S';src:url('${url(FONTS.serif)}') format('truetype');font-weight:400}
@font-face{font-family:'S';src:url('${url(FONTS.serifMed)}') format('truetype');font-weight:500}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${W}px;height:${H}px;overflow:hidden;background:#000}
body{-webkit-font-smoothing:antialiased;color:${C.ink};position:relative}
#bg{position:absolute;inset:0;width:${W}px;height:${H}px;object-fit:cover;display:none}
#root{position:absolute;inset:0}
#carrier,#spark{position:absolute;display:none;z-index:9;pointer-events:none}
#carrier svg{width:100%;height:100%;overflow:visible}
#spark{border-radius:50%;background:radial-gradient(circle,#efe0ff 0%,${C.fat} 45%,rgba(176,107,255,0) 72%)}

.scrim{position:absolute;inset:0;background:linear-gradient(180deg,rgba(20,14,8,.46) 0%,rgba(20,14,8,.10) 34%,rgba(20,14,8,.18) 64%,rgba(20,14,8,.62) 100%)}
.over{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:flex-end;padding:0 84px 200px}
.hook{font-family:'S',serif;font-weight:400;font-size:${LOC === 'bg' ? 96 : 108}px;line-height:1.08;letter-spacing:-.022em;color:#fff;text-shadow:0 6px 44px rgba(0,0,0,.5)}
.sub{font-family:'T',sans-serif;font-weight:600;font-size:40px;line-height:1.3;color:#fff;margin-top:28px;text-shadow:0 4px 28px rgba(0,0,0,.55)}

.app{position:absolute;inset:0;display:flex;flex-direction:column;background:${C.background}}
.status{position:relative;flex:none;padding:${Math.round(21 * S)}px ${Math.round(16 * S)}px ${Math.round(12 * S)}px}
.sky{position:absolute;left:0;right:0;top:0;height:600px;background:${C.sky}}
.hello{position:relative;font-family:'S',serif;font-weight:400;font-size:${Math.round(22 * S)}px;letter-spacing:-.2px;color:${C.ink};margin-bottom:${Math.round(6 * S)}px}
.hello i{font-style:italic}
.statusRow{position:relative;display:flex;align-items:center;gap:${Math.round(12 * S)}px}
.ringWrap{position:relative;flex:none;width:${Math.round(46 * S)}px;height:${Math.round(46 * S)}px}
.ringSvg{width:100%;height:100%;display:block}
.ringGlow{position:absolute;left:${Math.round(-22 * S)}px;top:${Math.round(-22 * S)}px;width:${Math.round(90 * S)}px;height:${Math.round(90 * S)}px;border-radius:50%;background:radial-gradient(circle,rgba(18,183,106,.55) 0%,rgba(18,183,106,0) 70%)}
.statusText{flex:1;min-width:0}
.statusFigure{font-family:'S',serif;font-weight:500;font-size:${Math.round(26 * S)}px;line-height:${Math.round(30 * S)}px;letter-spacing:-.4px;color:${C.ink};font-variant-numeric:tabular-nums}
.toGo{font-family:'T',sans-serif;font-weight:700;font-size:${Math.round(13 * S)}px;color:${C.muted}}
.statusSub{font-family:'T',sans-serif;font-weight:600;font-size:${Math.round(13 * S)}px;color:${C.muted};margin-top:2px;font-variant-numeric:tabular-nums}

.thread{position:relative;flex:1;overflow:hidden}
#threadContent{position:absolute;left:0;right:0;top:0;display:flex;flex-direction:column;gap:${Math.round(9 * S)}px;padding:${Math.round(8 * S)}px ${Math.round(16 * S)}px ${Math.round(26 * S)}px;will-change:transform}
.me{align-self:flex-end;max-width:80%;background-image:${C.ramp};color:${C.ink};border-radius:${Math.round(14 * S)}px;padding:${Math.round(9 * S)}px ${Math.round(13 * S)}px;font-family:'T',sans-serif;font-weight:600;font-size:${Math.round(14 * S)}px;line-height:1.38;box-shadow:0 12px 26px -14px rgba(18,183,106,.75);transform-origin:100% 100%}
.ai{align-self:flex-start;max-width:92%;font-family:'T',sans-serif;font-weight:400;font-size:${Math.round(14 * S)}px;line-height:1.5;color:${C.ink};padding:0 4px}
.waiting{align-self:flex-start;display:flex;gap:${Math.round(6 * S)}px;padding:${Math.round(8 * S)}px 6px 0}
.waiting .dot{width:${Math.round(20 * S)}px;height:${Math.round(20 * S)}px}

.cardwrap{position:relative;align-self:stretch;transform-origin:50% 60%}
#seat{position:absolute;top:${Math.round(-9 * S)}px;right:${Math.round(34 * S)}px;width:0;height:0}
.card{position:relative;background:${C.card};border-radius:${Math.round(12 * S)}px;padding:${Math.round(11 * S)}px ${Math.round(12 * S)}px}
.chead{display:flex;align-items:flex-start;gap:${Math.round(8 * S)}px}
.cemoji{font-size:${Math.round(17 * S)}px;line-height:1;flex:none}
.ctitles{flex:1;min-width:0}
.ctitle{font-family:'T',sans-serif;font-weight:700;font-size:${Math.round(13.5 * S)}px;line-height:1.25;color:${C.ink}}
.cmeal{font-family:'T',sans-serif;font-weight:400;font-size:${Math.round(11.5 * S)}px;color:${C.muted};margin-top:2px}
.ckcal{flex:none;display:flex;align-items:baseline;gap:5px}
.cfig{font-family:'S',serif;font-weight:500;font-size:${Math.round(19 * S)}px;letter-spacing:-.4px;color:${C.ink};font-variant-numeric:tabular-nums}
.cunit{font-family:'T',sans-serif;font-weight:400;font-size:${Math.round(10.5 * S)}px;color:${C.muted}}
.macros{display:flex;gap:4px;margin-top:${Math.round(9 * S)}px;height:${Math.round(6 * S)}px}
.mseg{height:100%;border-radius:999px}
.mrow{display:flex;gap:${Math.round(10 * S)}px;margin-top:${Math.round(5 * S)}px;font-family:'T',sans-serif;font-weight:800;font-size:${Math.round(12 * S)}px}
.citems{font-family:'T',sans-serif;font-weight:400;font-size:${Math.round(10.5 * S)}px;color:${C.muted};margin-top:${Math.round(6 * S)}px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.crule{border-top:2px dashed ${C.border};margin:${Math.round(7 * S)}px 0 ${Math.round(6 * S)}px}
.daybar{height:${Math.round(5 * S)}px;background:rgba(120,90,50,.10);border-radius:999px;overflow:hidden}
.daybar span{display:block;height:100%;background:${C.caloriesWash};border-radius:999px}

.composer{flex:none;position:relative;display:flex;align-items:flex-end;gap:${Math.round(8 * S)}px;padding:0 ${Math.round(14 * S)}px ${Math.round(7 * S)}px}
.cast{position:absolute;top:${Math.round(-19 * S)}px;left:${Math.round(56 * S)}px;display:flex;gap:${Math.round(5 * S)}px}
.dot{display:block;width:${Math.round(19 * S)}px;height:${Math.round(19 * S)}px}
.dot svg{width:100%;height:100%;overflow:visible}
.cam{flex:none;width:${Math.round(21 * S)}px;height:${Math.round(21 * S)}px;display:block;margin-bottom:${Math.round(6.5 * S)}px}
.micb{flex:none;width:${Math.round(30 * S)}px;height:${Math.round(30 * S)}px;background:${C.card};border-radius:999px;padding:${Math.round(8 * S)}px;box-shadow:${C.shadow};margin-bottom:${Math.round(2 * S)}px}
.cam svg,.micb svg{width:100%;height:100%;display:block}
.field{flex:1;background:${C.card};border-radius:${Math.round(17 * S)}px;padding:${Math.round(8 * S)}px ${Math.round(14 * S)}px;font-family:'T',sans-serif;font-weight:600;font-size:${Math.round(13.5 * S)}px;line-height:1.35;color:${C.ink};min-height:${Math.round(34 * S)}px;max-height:${Math.round(132 * S)}px;box-shadow:${C.shadow};overflow:hidden}
.ph{color:${C.muted};font-weight:400}
.caret{display:inline-block;width:3px;height:${Math.round(15 * S)}px;background:${C.calories};vertical-align:-6px;margin-left:2px}

.tabs{flex:none;display:flex;justify-content:space-between;align-items:center;background:${C.card};margin:${Math.round(4 * S)}px ${Math.round(12 * S)}px ${Math.round(16 * S)}px;border-radius:${Math.round(28 * S)}px;padding:${Math.round(6 * S)}px;box-shadow:${C.shadow}}
.tab{flex:1;display:flex;flex-direction:column;align-items:center;gap:${Math.round(2 * S)}px;color:${C.muted}}
.tab.on{color:${C.caloriesText}}
.tico{width:${Math.round(17 * S)}px;height:${Math.round(17 * S)}px;display:block;padding:${Math.round(2.5 * S)}px;border-radius:999px}
.tab.on .tico{background:rgba(18,183,106,.16)}
.tico svg{width:100%;height:100%;display:block}
.tlbl{font-family:'T',sans-serif;font-weight:600;font-size:${Math.round(8.5 * S)}px}
.tab.on .tlbl{font-weight:700}

.end{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:34px;background:${C.background}}
.mark img{width:220px;height:220px;border-radius:54px;display:block;box-shadow:${C.shadow}}
.ename{font-family:'S',serif;font-weight:500;font-size:88px;letter-spacing:-.02em;color:${C.ink}}
.esub{font-family:'T',sans-serif;font-weight:600;font-size:34px;color:${C.muted};margin-top:-16px}
`

/**
 * Runs inside the page, once per frame, in order. Holds the thread's scroll
 * offset between frames — that carried state is what turns a new card from a
 * 500px jump into a glide — and places Plum and the spark from the real
 * rectangles of the ledge, the card's seat and the ring.
 */
const RENDER_FRAME = `
window.renderFrame = async (f) => {
  const bg = document.getElementById('bg');
  if (f.bg) {
    if (bg.dataset.src !== f.bg) { bg.src = f.bg; bg.dataset.src = f.bg; await bg.decode(); }
    bg.style.display = 'block';
  } else bg.style.display = 'none';
  document.getElementById('root').innerHTML = f.html;

  const th = document.getElementById('thread'), tc = document.getElementById('threadContent');
  if (th && tc) {
    const target = th.clientHeight - tc.scrollHeight;
    if (window.__off === undefined) window.__off = target;
    window.__off += (target - window.__off) * (1 - Math.exp(-f.dt / 0.085));
    tc.style.transform = 'translateY(' + window.__off.toFixed(2) + 'px)';
  } else window.__off = undefined;

  const centre = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };
  const place = (el, fl, inner) => {
    if (!fl) { el.style.display = 'none'; return; }
    const a = centre(fl.from), b = centre(fl.to);
    if (!a || !b) { el.style.display = 'none'; return; }
    const p = fl.p, arcP = Math.min(1, Math.max(0, p));
    const x = a.x + (b.x - a.x) * p;
    const y = a.y + (b.y - a.y) * p - Math.sin(Math.PI * arcP) * fl.arc;
    if (inner !== undefined) el.innerHTML = inner;
    el.style.cssText = 'display:block;left:' + (x - fl.size / 2) + 'px;top:' + (y - fl.size / 2) + 'px;width:' + fl.size + 'px;height:' + fl.size + 'px';
  };
  place(document.getElementById('carrier'), f.carrier, f.carrier ? f.carrier.svg : undefined);
  place(document.getElementById('spark'), f.spark);
};
`

/* ── render ──────────────────────────────────────────────────────────── */

const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((p) => existsSync(p))
if (!CHROME) { console.error('No Chrome or Edge found to rasterise with.'); process.exit(1) }

function loadChromium() {
  const candidates = [process.env.PLAYWRIGHT_CORE, resolve('node_modules/playwright-core')].filter(Boolean) as string[]
  for (const dir of candidates) {
    try { return createRequire(join(dir, 'package.json'))('playwright-core').chromium } catch {}
  }
  console.error('playwright-core not found. Set PLAYWRIGHT_CORE=<path to an install> — see the header of this file.')
  process.exit(2)
}

for (const f of [...Object.values(FONTS), ICON, CAFE, STREET]) {
  if (!existsSync(f)) {
    console.error(`Missing asset: ${f}`)
    if (f.startsWith('content/fonts/')) console.error('  See the Type note at the top of this file.')
    process.exit(1)
  }
}
const useMusic = MUSIC !== 'none'
if (useMusic && !existsSync(MUSIC)) { console.error(`Missing music: ${MUSIC}`); process.exit(1) }

mkdirSync(OUTDIR, { recursive: true })
const work = join(tmpdir(), `dsf-ad-${LOC}`)
rmSync(work, { recursive: true, force: true })
mkdirSync(work, { recursive: true })

function duration(p: string): number {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', resolve(p)], { encoding: 'utf8' })
  return Number((r.stdout ?? '').trim()) || 2
}

/**
 * Retime a clip to its slot and bring it to the film's frame rate by motion
 * interpolation, not repetition — 24fps frames shown 2.5 times each judder.
 */
function explode(clip: string, tag: string, seconds: number): string[] {
  const dir = join(work, tag)
  mkdirSync(dir, { recursive: true })
  const stretch = (seconds / duration(clip)).toFixed(4)
  const rate = FPS >= 30
    ? `minterpolate=fps=${FPS}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1`
    : `fps=${FPS}`
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', resolve(clip),
    '-vf', `setpts=PTS*${stretch},${rate},scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1`,
    join(dir, '%04d.png')], { encoding: 'utf8' })
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.png')).sort() : []
  if (!files.length) { console.error(`No frames out of ${clip}:\n${(r.stderr ?? '').trim()}`); process.exit(1) }
  return files.map((f) => join(dir, f))
}

console.log(`locale ${LOC} · serif ${L.serif} · ${FPS}fps`)
console.log('  interpolating B-roll…')
cafeFrames = explode(CAFE, 'cafe', SEGMENTS[0].seconds)
streetFrames = explode(STREET, 'street', SEGMENTS[2].seconds)
console.log(`  cafe ${cafeFrames.length} frames, street ${streetFrames.length} frames`)

const shell = join(work, 'shell.html')
writeFileSync(shell,
  `<!doctype html><html><head><meta charset="utf-8"><style>${STYLE}</style></head>` +
  `<body><img id="bg" alt=""><div id="root"></div><span id="carrier"></span><span id="spark"></span>` +
  `<script>${RENDER_FRAME}</script></body></html>`, 'utf8')

const chromium = loadChromium()
const browser = await chromium.launch({ executablePath: CHROME, args: ['--hide-scrollbars', '--force-device-scale-factor=1'] })
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })
await page.goto(url(shell))
// Every face used anywhere in the film, forced to load before frame one.
await page.evaluate(async () => {
  const probes = ["400 20px T", "600 20px T", "700 20px T", "800 20px T", "400 20px S", "italic 400 20px S", "500 20px S"]
  await Promise.all(probes.map((f) => (document as any).fonts.load(f, 'AaЖж0')))
  await (document as any).fonts.ready
})

console.log(`${TOTAL.toFixed(1)}s @ ${FPS}fps = ${FRAMES} frames, ${W}x${H}`)
const started = Date.now()
for (let i = 0; i < FRAMES; i++) {
  await page.evaluate((f: Frame) => (window as any).renderFrame(f), frameAt(i))
  await page.screenshot({ path: join(work, `f${String(i).padStart(4, '0')}.png`), type: 'png' })
  if ((i + 1) % 100 === 0 || i === FRAMES - 1) {
    const s = (Date.now() - started) / 1000
    console.log(`  ${i + 1}/${FRAMES}  ${s.toFixed(0)}s`)
  }
}
await browser.close()

let wav: string
if (useMusic) wav = resolve(MUSIC)
else { wav = join(work, 'bed.wav'); writeFileSync(wav, bed(TOTAL)) }

const mp4 = join(OUTDIR, `ad-${LOC}.mp4`)
const r = spawnSync('ffmpeg', ['-v', 'error', '-y',
  '-framerate', String(FPS), '-i', join(work, 'f%04d.png'), '-i', wav,
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-r', String(FPS),
  '-af', (useMusic && MUSIC_START > 0 ? `atrim=start=${MUSIC_START}:end=${(MUSIC_START + TOTAL).toFixed(2)},asetpts=PTS-STARTPTS,` : '') +
    `afade=t=in:st=0:d=0.8,afade=t=out:st=${(TOTAL - 1.4).toFixed(2)}:d=1.4,loudnorm=I=-14:TP=-1.5:LRA=11`,
  '-c:a', 'aac', '-b:a', '160k', '-ar', '44100', '-t', String(TOTAL), '-movflags', '+faststart',
  resolve(mp4)], { encoding: 'utf8' })
if (!existsSync(mp4)) { console.error(`ffmpeg failed:\n${(r.stderr ?? '').trim()}`); process.exit(1) }

rmSync(work, { recursive: true, force: true })
console.log(`\n${(statSync(mp4).size / 1024 / 1024).toFixed(1)} MB -> ${mp4}`)
