import type { TrendPoint } from '@ct/shared';
import { cn } from '@/lib/utils';

/**
 * The one chart in the product. Progress, the Exercise tab and the cards the
 * agent draws mid-conversation all render through here, so a calorie trend
 * looks the same wherever it is met.
 *
 * Two shapes, chosen by what the data is rather than by taste: a line for a
 * quantity that exists continuously and is merely sampled (weight, intake), and
 * bars for one that only exists on the days it happened (burn). Drawing a rest
 * day as a point on a line implies a value it does not have.
 */
export function Sparkline({
  points,
  accessor = 'average',
  stroke,
  target,
  variant = 'line',
  height = 72,
  className,
}: {
  points: TrendPoint[];
  accessor?: 'value' | 'average';
  stroke: string;
  target?: number | null;
  variant?: 'line' | 'bars';
  height?: number;
  className?: string;
}) {
  const values = points.map((p) => p[accessor]);
  const present = values.filter((v): v is number => v !== null);
  if (present.length < 2) return null;

  const width = 320;
  const reference = target ?? undefined;
  // Bars are read against zero; a bar chart with a floating baseline overstates
  // every difference on it.
  const lo = variant === 'bars' ? 0 : Math.min(...present, ...(reference ? [reference] : []));
  const hi = Math.max(...present, ...(reference ? [reference] : []));
  // Pad the domain so the trace sits in the body of the chart rather than
  // hugging an edge — a flat series against a distant target looks broken
  // otherwise.
  const pad = (hi - lo || Math.abs(hi) * 0.1 || 1) * 0.18;
  const min = variant === 'bars' ? 0 : lo - pad;
  const max = hi + pad;
  const span = max - min || 1;

  const x = (i: number) => (i / Math.max(1, points.length - 1)) * width;
  const y = (v: number) => height - ((v - min) / span) * (height - 10) - 5;

  const targetLine = reference !== undefined && (
    <line
      x1="0"
      x2={width}
      y1={y(reference)}
      y2={y(reference)}
      className="stroke-border"
      strokeDasharray="3 5"
      strokeWidth="1.5"
    />
  );

  if (variant === 'bars') {
    // Leave a hairline of gap between bars, but never let them vanish on a
    // 365-day window — below about a pixel the chart reads as an empty box.
    const slot = width / points.length;
    const barWidth = Math.max(1, slot * 0.62);

    return (
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className={cn('w-full', className)}
        role="img"
        aria-hidden="true"
      >
        {targetLine}
        {points.map((point, i) => {
          const v = point[accessor] ?? 0;
          const top = y(v);
          return (
            <rect
              key={point.local_date}
              x={(slot * i + (slot - barWidth) / 2).toFixed(1)}
              y={top.toFixed(1)}
              width={barWidth.toFixed(1)}
              // Nothing shorter than a hairline, so a light day still registers
              // as a day rather than as a gap.
              height={Math.max(v > 0 ? 1.5 : 0, height - 5 - top).toFixed(1)}
              rx={Math.min(1.5, barWidth / 2)}
              fill={stroke}
              opacity={v > 0 ? 1 : 0}
            />
          );
        })}
      </svg>
    );
  }

  // Skip gaps rather than drawing a line through days with no data.
  let path = '';
  let penDown = false;
  points.forEach((point, i) => {
    const v = point[accessor];
    if (v === null) {
      penDown = false;
      return;
    }
    path += `${penDown ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
    penDown = true;
  });

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={cn('w-full', className)}
      role="img"
      aria-hidden="true"
    >
      {targetLine}
      <path
        d={path.trim()}
        fill="none"
        stroke={stroke}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
