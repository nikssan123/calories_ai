/**
 * The ring, as an SVG string.
 *
 * A widget is drawn by the launcher out of `RemoteViews`, which has no canvas
 * and no React — so this is the one place in the app where the ring is built by
 * concatenating strings rather than by rendering components. The geometry is
 * lifted from `CalorieRing` rather than re-derived: same depth ratio, same
 * radius, same rotation, so the thing on the home screen is recognisably the
 * thing inside the app rather than a second drawing of the same idea.
 *
 * That now includes the two things the first copy left out, both of which are
 * the reason the app's dial looks like an object rather than a stroke: the
 * ledge — the track again, pushed down by its own depth, in the shadow tone
 * every card uses — and the ramp across the arc, so a full day is visibly a
 * richer green at its end than at its start. They cost two more circles and a
 * gradient, and androidsvg draws all of it.
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
  track: string;
  fill: string;
  /** The far end of the arc's ramp — `logoRamp` in the app's palette. */
  ramp: string;
  /** The ledge's tone, and how much of it to let through. */
  ledge: string;
  ledgeOpacity: number;
  /** Over target turns the arc to ink rather than to red — see `CalorieRing`. */
  over: string;
}

export function ringSvg({
  consumed,
  target,
  size,
  strokeWidth,
  track,
  fill,
  ramp,
  ledge,
  ledgeOpacity,
  over,
}: Ring): string {
  // `CalorieRing`'s own arithmetic, verbatim.
  const depth = Math.max(3, Math.round(strokeWidth * 0.22));
  const radius = (size - strokeWidth - depth) / 2;
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
    circle(centre + depth, ledge, ` stroke-opacity="${ledgeOpacity}"`),
    circle(centre, track),
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
