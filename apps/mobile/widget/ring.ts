/**
 * The ring, as an SVG string.
 *
 * A widget is drawn by the launcher out of `RemoteViews`, which has no canvas
 * and no React — so this is the one place in the app where the ring is built by
 * concatenating strings rather than by rendering components. The geometry is
 * lifted from `CalorieRing` rather than re-derived: same radius, same rotation,
 * so the thing on the home screen is recognisably the thing inside the app
 * rather than a second drawing of the same idea.
 *
 * The track is the day's budget rather than a neutral band, so a day nobody has
 * logged to yet reads as a remainder and not as a gap in the home screen. It used to sit on a ledge: the track again, pushed down
 * by its own depth, in the shadow tone every card used. In dark that tone is
 * `#000000` at 0.88, and a near-black crescent under a faint band is a hole
 * punched through the widget — behind which is the user's wallpaper. Depth
 * after dark is light, so the ledge has gone.
 *
 * What the app's ring puts there instead is a lit rim, and this does not have
 * one: the iOS face is laid out in SwiftUI (`ios/Face.tsx`) and cannot stroke a
 * gradient, and two home-screen widgets that disagree with each other would be
 * worse than one that is a shade plainer than the screen inside the app.
 *
 * The ramp across the arc stays, so a full day is visibly a richer green at its
 * end than at its start.
 *
 * No animation, and nothing to switch off for reduced motion. A widget is
 * repainted at whatever moment the launcher decides; there is no arrival to
 * animate and nobody watching when it happens.
 */

export interface Ring {
  consumed: number;
  target: number;
  size: number;
  strokeWidth: number;
  fill: string;
  /** The far end of the arc's ramp — `logoRamp` in the app's palette. */
  ramp: string;
  /** The track, and how much of it to let through. See `WidgetPalette`. */
  track: string;
  trackOpacity: number;
  /** Over target turns the arc to ink rather than to red — see `CalorieRing`. */
  over: string;
}

export function ringSvg({
  consumed,
  target,
  size,
  strokeWidth,
  fill,
  ramp,
  track,
  trackOpacity,
  over,
}: Ring): string {
  // `CalorieRing`'s own arithmetic, verbatim — which no longer reserves a drop
  // for the ledge, so the dial is its box less half a stroke either side.
  const radius = (size - strokeWidth) / 2;
  const centre = size / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = target > 0 ? consumed / target : 0;
  const dash = circumference * Math.min(1, Math.max(0, ratio));
  const past = consumed > target;

  const circle = (cy: number, stroke: string, extra = '') =>
    `<circle cx="${centre}" cy="${cy}" r="${radius}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}"${extra} />`;

  /*
   * Rotated so the arc starts at twelve o'clock. `stroke-linecap="round"` is
   * what gives the two ends their thickness — without it a nearly-empty ring
   * reads as a rendering fault rather than as a day barely begun.
   */
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`,
    `<defs><linearGradient id="arc" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${size}" y2="${size}">`,
    `<stop offset="0" stop-color="${fill}" /><stop offset="1" stop-color="${ramp}" />`,
    `</linearGradient></defs>`,
    circle(centre, track, ` stroke-opacity="${trackOpacity}"`),
    dash > 0
      ? circle(
          centre,
          past ? over : 'url(#arc)',
          ` stroke-linecap="round" stroke-dasharray="${dash} ${circumference}" transform="rotate(-90 ${centre} ${centre})"`,
        )
      : '',
    `</svg>`,
  ].join('');
}
