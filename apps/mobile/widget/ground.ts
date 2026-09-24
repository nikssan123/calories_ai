import { split, type WidgetPalette } from './theme';

/**
 * The light a tile stands in, as an SVG string.
 *
 * This is `Backdrop` — the washes behind every screen in the app — plus the lit
 * edge every surface in it wears. Both arrived with the glow-up, and the widget
 * had neither: a flat cream rectangle inside a two-point tan outline, which is
 * what the app looked like before ("The flat cream sheet was the single largest
 * reason the app read as dull", GLOW-UP.md).
 *
 * Drawn rather than styled because `RemoteViews` has no gradient worth the name
 * — one linear ramp per view, and it replaces the background *and* the border —
 * and because an SVG can be rounded at its own corners. A bitmap child does not
 * clip to its parent's radius, so a wash laid on as a sibling view would paint
 * four square corners of tint over the rounded ground beneath it.
 *
 * It costs nothing to ship. The library rasterises the whole widget tree to a
 * single bitmap and hands the launcher a file URI, so a second `SvgWidget` adds
 * a few drawing operations to a render that was already happening and not one
 * byte to the `RemoteViews` that crosses the process boundary.
 */
export function groundSvg({
  width,
  height,
  radius,
  colors,
}: {
  width: number;
  height: number;
  /** The tile's own corner, so the wash stops exactly where the ground does. */
  radius: number;
  colors: WidgetPalette;
}): string {
  const edge = split(colors.glassEdge);
  const hair = split(colors.hairline);

  /*
   * The washes are ellipses and a radial gradient is a circle, so each one is a
   * circle of its own horizontal radius squashed vertically about its centre.
   * `colors.ts` writes them as `radial-gradient(120% 60% at 0% 0%, …)`; `Wash`
   * has already multiplied that through to the point the colour reaches
   * nothing, which is all a gradient with two stops needs to know.
   */
  const washes = colors.ambient.map((wash, index) => {
    const cx = wash.x * width;
    const cy = wash.y * height;
    const rx = Math.max(1, wash.rx * width);
    const ry = Math.max(1, wash.ry * height);
    return {
      id: `wash${index}`,
      def:
        `<radialGradient id="wash${index}" gradientUnits="userSpaceOnUse" cx="${r(cx)}" cy="${r(cy)}" r="${r(rx)}" ` +
        `gradientTransform="translate(${r(cx)} ${r(cy)}) scale(1 ${r(ry / rx, 4)}) translate(${r(-cx)} ${r(-cy)})">` +
        `<stop offset="0" stop-color="${wash.color}" stop-opacity="${wash.opacity}" />` +
        `<stop offset="1" stop-color="${wash.color}" stop-opacity="0" />` +
        `</radialGradient>`,
    };
  });

  /*
   * The outline and the lit edge, as one stroke.
   *
   * In the app they are two things — `borderWidth: 1` in `hairline` all the way
   * round, and `Chunk`'s `inset 0px 1px 0px` in `glassEdge` along the top — and
   * on a shape with a 28pt corner they meet anyway: the inset highlight follows
   * the rounded contour and dies into the outline about a third of the way
   * down. Drawing that as a single gradient stroke is the same picture, and it
   * avoids asking Android to draw a rounded border with four different colours,
   * which it does by mitring the corners rather than by blending them.
   *
   * The third thing in the app is a shadow, and there is none to be had here:
   * the launcher composites this tile onto a wallpaper the process drawing it
   * never sees, so there is nothing to cast onto and no room outside the tile
   * to cast into. What the bottom gets instead is shade — the ring's own rim
   * logic, lit at twelve and darkening towards six (`RingRim`), at the same
   * weight — which is the half of a shadow that fits inside the object. Without
   * it a cream tile on a pale wallpaper has no bottom edge at all, which is the
   * one thing the two-point tan border was genuinely doing.
   */
  const lit =
    `<linearGradient id="edge" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${r(height)}">` +
    `<stop offset="0" stop-color="${edge.color}" stop-opacity="${edge.opacity}" />` +
    `<stop offset="0.3" stop-color="${hair.color}" stop-opacity="${hair.opacity}" />` +
    `<stop offset="0.75" stop-color="${hair.color}" stop-opacity="${hair.opacity}" />` +
    `<stop offset="1" stop-color="#000000" stop-opacity="${colors.rimShade}" />` +
    `</linearGradient>`;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${r(width)}" height="${r(height)}" viewBox="0 0 ${r(width)} ${r(height)}">`,
    `<defs>${washes.map((wash) => wash.def).join('')}${lit}</defs>`,
    ...washes.map(
      (wash) =>
        `<rect x="0" y="0" width="${r(width)}" height="${r(height)}" rx="${r(radius)}" fill="url(#${wash.id})" />`,
    ),
    /* Inset by half the stroke, so the whole point of it lands inside the tile
     * rather than half outside it where the launcher clips. */
    `<rect x="0.5" y="0.5" width="${r(width - 1)}" height="${r(height - 1)}" rx="${r(Math.max(0, radius - 0.5))}" fill="none" stroke="url(#edge)" stroke-width="1" />`,
    `</svg>`,
  ].join('');
}

/** Short decimals: an SVG string this long is mostly digits nobody can see. */
const r = (value: number, places = 2) => Number(value.toFixed(places));
