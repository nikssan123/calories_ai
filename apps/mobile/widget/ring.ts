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
  /** Over target turns the arc to ink rather than to red — see `CalorieRing`. */
  over: string;
}

export function ringSvg({ consumed, target, size, strokeWidth, track, fill, over }: Ring): string {
  // `CalorieRing`'s own arithmetic, verbatim.
  const depth = Math.max(3, Math.round(strokeWidth * 0.22));
  const radius = (size - strokeWidth - depth) / 2;
  const centre = size / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = target > 0 ? consumed / target : 0;
  const dash = circumference * Math.min(1, Math.max(0, ratio));
  const colour = consumed > target ? over : fill;

  /*
   * Rotated so the arc starts at twelve o'clock. `stroke-linecap="round"` is
   * what gives the two ends their thickness — without it a nearly-empty ring
   * reads as a rendering fault rather than as a day barely begun.
   */
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`,
    `<circle cx="${centre}" cy="${centre}" r="${radius}" fill="none" stroke="${track}" stroke-width="${strokeWidth}" />`,
    dash > 0
      ? `<circle cx="${centre}" cy="${centre}" r="${radius}" fill="none" stroke="${colour}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-dasharray="${dash} ${circumference}" transform="rotate(-90 ${centre} ${centre})" />`
      : '',
    `</svg>`,
  ].join('');
}
