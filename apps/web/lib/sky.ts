/**
 * The sky over Today, by the hour.
 *
 * The name of the app is a time of day, so the one thing on the first screen
 * that should visibly know what time it is, is the screen itself. It is
 * atmosphere and nothing else: there is no sun and no moon in it — the ring is
 * the only object in this sky, and a second body up there would be competing
 * with the number people opened the app to read.
 *
 * Keyframes rather than a formula, because a sky is not a function of the hour
 * anybody could write down. Dawn is violet going to apricot, midday is teal
 * over cream, the last hour before dusk goes gold, and night in the *light*
 * theme is a soft indigo that still resolves into the cream ground below it —
 * the light theme is a promise about the page, not about the time.
 *
 * Dark is a setting and not an hour, so it has its own set: every hour again,
 * dimmed, and resolving into the dark ground rather than into cream.
 *
 * Ported whole from `apps/mobile/theme/sky.ts`, keyframes included. The app is
 * the reference implementation and the two tables have to stay identical — a
 * site whose evening starts an hour before the app's is worse than a site with
 * no sky at all. What is deliberately *not* ported is `sceneSkyAt`: that is the
 * weather a mobile illustration shows through a window, and there are no
 * illustrated scenes here.
 */

export type Scheme = 'light' | 'dark';

export interface Sky {
  /** The top of the header. */
  top: string;
  /** Half way down. */
  mid: string;
  /** Where the sky meets the ground — always close to the ground itself. */
  low: string;
  /** The warm light the ring sits in. */
  haze: string;
  /** Whether the top is dark enough that words on it need light ink. */
  inkLight: boolean;
  /**
   * How far into the night this sky is: 0 in full daylight, 1 after dark.
   *
   * `inkLight` without the cliff. Ink has to flip — a letter is either readable
   * on this ground or it is not, and a half-lit one is just a bad letter. An
   * *object* has no such excuse, so anything that is lit rather than read reads
   * this instead and the hour arrives rather than happening.
   */
  night: number;
}

type Key = [hour: number, top: string, mid: string, low: string, haze: string];

const LIGHT: Key[] = [
  [0, '#2c3160', '#6a6a98', '#f3e2d2', 'rgba(150, 160, 255, 0.22)'],
  [4.5, '#2c3160', '#6a6a98', '#f3e2d2', 'rgba(150, 160, 255, 0.22)'],
  [6.5, '#7a6aa0', '#f2a883', '#ffe6c2', 'rgba(255, 170, 110, 0.45)'],
  [9, '#56b4d2', '#afe3de', '#fff2de', 'rgba(255, 200, 90, 0.35)'],
  [13, '#47b9cb', '#aee8da', '#fff3df', 'rgba(255, 190, 80, 0.35)'],
  [17, '#5a97bd', '#f5bd74', '#ffe7c0', 'rgba(255, 160, 60, 0.42)'],
  [19, '#48467a', '#e28a77', '#f9cc96', 'rgba(255, 120, 80, 0.42)'],
  [21, '#2f3466', '#77689a', '#f0d9c8', 'rgba(180, 150, 255, 0.25)'],
  [24, '#2c3160', '#6a6a98', '#f3e2d2', 'rgba(150, 160, 255, 0.22)'],
];

const DARK: Key[] = [
  [0, '#0f1330', '#1a1d3c', '#1f1a22', 'rgba(120, 140, 255, 0.16)'],
  [4.5, '#0f1330', '#1a1d3c', '#1f1a22', 'rgba(120, 140, 255, 0.16)'],
  [6.5, '#302649', '#6e3c3a', '#2a211d', 'rgba(255, 150, 100, 0.24)'],
  [9, '#173d52', '#1f5559', '#221b17', 'rgba(255, 200, 90, 0.18)'],
  [13, '#135560', '#1c6e69', '#211a16', 'rgba(255, 190, 80, 0.2)'],
  [17, '#1d3d5c', '#6f4424', '#231b16', 'rgba(255, 160, 60, 0.24)'],
  [19, '#211d46', '#633038', '#221a1a', 'rgba(255, 120, 80, 0.24)'],
  [21, '#141430', '#2a2242', '#1f1a1f', 'rgba(150, 130, 255, 0.16)'],
  [24, '#0f1330', '#1a1d3c', '#1f1a22', 'rgba(120, 140, 255, 0.16)'],
];

/** The two keys this hour falls between, and how far between them it is. */
function around(date: Date, keys: Key[]): [Key, Key, number] {
  const hour = date.getHours() + date.getMinutes() / 60;
  let i = 0;
  while (i < keys.length - 2 && keys[i + 1]![0] <= hour) i++;
  const a = keys[i]!;
  const b = keys[i + 1]!;
  return [a, b, Math.min(1, Math.max(0, (hour - a[0]) / (b[0] - a[0])))];
}

export function skyAt(date: Date, scheme: Scheme): Sky {
  const [a, b, t] = around(date, scheme === 'dark' ? DARK : LIGHT);
  const top = mixHex(a[1], b[1], t);
  return {
    top,
    mid: mixHex(a[2], b[2], t),
    low: mixHex(a[3], b[3], t),
    haze: mixRgba(a[4], b[4], t),
    /*
     * Measured, not assumed per keyframe: dusk in the light theme crosses the
     * line part way between two keys, and a heading that flipped ink on the
     * hour rather than when the sky actually darkened would sit unreadable for
     * forty minutes every evening.
     */
    inkLight: luminance(top) < 0.2,
    night: nightness(luminance(top)),
  };
}

/**
 * Full daylight at or above this, full night at or below the next one, and a
 * smoothstep between. The window is the two hours either side of dusk, which is
 * where the light theme's sky actually turns over; dark's skies are below the
 * floor at every hour, so on dark this is simply 1 and nothing has to special-
 * case the scheme.
 */
const DAYLIGHT = 0.34;
const NIGHTFALL = 0.1;

function nightness(lum: number): number {
  const t = Math.min(1, Math.max(0, (DAYLIGHT - lum) / (DAYLIGHT - NIGHTFALL)));
  /* Smoothstep, so the ends ease rather than arriving on a corner. */
  return t * t * (3 - 2 * t);
}

/**
 * The time-of-day word a greeting would use. Night starts at nine and runs to
 * five, which is when the sky above is dark rather than when the clock says
 * evening.
 */
export type DayPart = 'morning' | 'afternoon' | 'evening' | 'night';

export function dayPartAt(date: Date): DayPart {
  const hour = date.getHours();
  if (hour < 5) return 'night';
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  if (hour < 21) return 'evening';
  return 'night';
}

function channels(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mixHex(a: string, b: string, t: number): string {
  const A = channels(a);
  const B = channels(b);
  return `#${A.map((v, i) =>
    Math.round(v + (B[i]! - v) * t)
      .toString(16)
      .padStart(2, '0'),
  ).join('')}`;
}

function mixRgba(a: string, b: string, t: number): string {
  const A = a.match(/[\d.]+/g)!.map(Number);
  const B = b.match(/[\d.]+/g)!.map(Number);
  const c = A.map((v, i) => v + (B[i]! - v) * t);
  return `rgba(${Math.round(c[0]!)}, ${Math.round(c[1]!)}, ${Math.round(c[2]!)}, ${c[3]!.toFixed(3)})`;
}

function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
