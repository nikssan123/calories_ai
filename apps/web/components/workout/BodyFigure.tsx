import type { MuscleGroup } from '@ct/shared';
import { FIGURE_BOX, FIGURE_PARTS, litRegions, muscleLabel, viewForMuscles } from '@ct/shared';

/**
 * An exercise drawn as the muscles it works — the web half of GYM-CARD.md §1.
 *
 * The geometry is in `@ct/shared` so the phone and the browser cannot disagree
 * about where a deltoid is; this is only the plain-SVG rendering of it. Colours
 * come from the CSS custom properties the rest of the app uses, so the figure
 * follows the theme without this file knowing which theme is on.
 *
 * A coach reading a client's session sees the icon the client saw, which is the
 * whole reason the web got this rather than keeping the emoji.
 */
export function BodyFigure({
  muscles,
  size = 22,
  className,
}: {
  /** Primary first, exactly as the catalogue stores it. */
  muscles: readonly MuscleGroup[];
  size?: number;
  className?: string;
}) {
  if (muscles.length === 0) return null;

  const view = viewForMuscles(muscles);
  const lit = litRegions(muscles, view);
  const [cx, cy, r] = FIGURE_PARTS.head;

  return (
    <svg
      width={size}
      height={Math.round((size * FIGURE_BOX.height) / FIGURE_BOX.width)}
      viewBox={`0 0 ${FIGURE_BOX.width} ${FIGURE_BOX.height}`}
      className={className}
      role="img"
      aria-label={muscles.map(muscleLabel).join(', ')}
    >
      <g fill="var(--border)">
        <circle cx={cx} cy={cy} r={r} />
        {FIGURE_PARTS.blocks.map(([x, y, w, h, rx], i) => (
          <rect key={i} x={x} y={y} width={w} height={h} rx={rx} ry={rx} />
        ))}
      </g>
      {lit.map((region, i) => (
        <g
          key={i}
          fill="var(--exercise)"
          /* Primary solid, secondaries faded — an exercise that lit four
             muscles equally would say "compound" and nothing more. */
          fillOpacity={region.primary ? 1 : 0.34}
        >
          {region.shapes.map(([x, y, w, h, rx], j) => (
            <rect key={j} x={x} y={y} width={w} height={h} rx={rx} ry={rx} />
          ))}
        </g>
      ))}
    </svg>
  );
}
