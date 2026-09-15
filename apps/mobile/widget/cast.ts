import { localDateFor } from '@ct/shared';
import { GRID, figureMarkup, type CastName, type Mood } from '@/components/cast/figure';
import type { DaySnapshot } from '@/lib/snapshot';

/**
 * The cast on the home screen (CAST.md), as one SVG string for `SvgWidget`.
 *
 * Same geometry as `Character`, from `figure.ts`, so the figure on the home
 * screen is the one in the app. It stands still, for the reason `ring.ts` gives:
 * the launcher repaints whenever it chooses, so there is no arrival to animate
 * and nobody watching.
 *
 * androidsvg is an SVG 1.1 renderer, so the shadow is a hex colour with a
 * `fill-opacity` rather than an `rgba()`.
 */
export interface Placed {
  name: CastName;
  mood: Mood;
  /** The figure's box, in dp: its left edge, top edge and side. */
  x: number;
  y: number;
  size: number;
}

export function castSvg({
  width,
  height,
  placed,
  shadow,
  shadowOpacity,
}: {
  width: number;
  height: number;
  placed: Placed[];
  shadow: string;
  shadowOpacity: number;
}): string {
  const figures = placed.map((figure, i) => ({ figure, ...figureMarkup(figure.name, figure.mood, `c${i}`) }));
  const ground = `<ellipse cx="60" cy="109" rx="28" ry="4.5" fill="${shadow}" fill-opacity="${shadowOpacity}"/>`;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<defs>${figures.map((f) => f.defs).join('')}</defs>`,
    ...figures.map(
      ({ figure, shapes }) =>
        `<g transform="translate(${figure.x} ${figure.y}) scale(${(figure.size / GRID).toFixed(4)})">${ground}${shapes}</g>`,
    ),
    '</svg>',
  ].join('');
}

/**
 * The three side by side, overlapping a little, in a box `size` tall.
 *
 * Returns the width the row needs, so a layout can reserve it.
 */
export function trio(size: number, moods: readonly [Mood, Mood, Mood]): { width: number; placed: Placed[] } {
  const step = Math.round(size * 0.8);
  return {
    width: size + 2 * step,
    placed: [
      { name: 'ember', mood: moods[0], x: 0, y: 0, size },
      { name: 'skye', mood: moods[1], x: step, y: 0, size },
      { name: 'plum', mood: moods[2], x: 2 * step, y: 0, size },
    ],
  };
}

/**
 * Who stands beside the ring, and how.
 *
 * Read off what somebody has done today and what time it is, never off what
 * the number came to. Skye says hello while nothing is logged yet. Plum is
 * asleep in the hours after midnight that still belong to the evening before.
 * The rest of the day it's Ember, standing by.
 */
export function companion(snapshot: DaySnapshot, now: Date = new Date()): { name: CastName; mood: Mood } {
  const context = { timezone: snapshot.timezone, dayStartHour: snapshot.dayStartHour };
  const filed = localDateFor(now, context);
  const calendar = localDateFor(now, { ...context, dayStartHour: 0 });
  if (snapshot.dayStartHour > 0 && filed !== calendar) return { name: 'plum', mood: 'sleepy' };
  if (snapshot.consumed === 0) return { name: 'skye', mood: 'wave' };
  return { name: 'ember', mood: 'idle' };
}
