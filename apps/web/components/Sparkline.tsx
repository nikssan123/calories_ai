'use client';

import { useState } from 'react';
import type { TrendPoint } from '@ct/shared';
import { useT } from '@/lib/i18n';
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
  tooltip,
  label,
  className,
}: {
  points: TrendPoint[];
  accessor?: 'value' | 'average';
  stroke: string;
  target?: number | null;
  variant?: 'line' | 'bars';
  height?: number;
  /**
   * Opt in to inspecting a single day. The caller draws the contents, because
   * only it knows what the day *was* — this component has a date and a number
   * and nothing else. Bars only: a bar is a day you can point at, where a
   * line's value between two samples is an interpolation nobody logged.
   */
  tooltip?: (point: TrendPoint, index: number) => React.ReactNode;
  /** Names the chart for screen readers, once `tooltip` makes it focusable. */
  label?: string;
  className?: string;
}) {
  const t = useT();
  const [hovered, setHovered] = useState<number | null>(null);

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
      strokeDasharray="2 6"
      strokeWidth="2"
      strokeLinecap="round"
    />
  );

  if (variant === 'bars') {
    // Leave a hairline of gap between bars, but never let them vanish on a
    // 365-day window — below about a pixel the chart reads as an empty box.
    const slot = width / points.length;
    const barWidth = Math.max(1.5, slot * 0.66);
    // Switching 90d → 14d can leave the held index pointing past the end.
    const active = hovered !== null && hovered < points.length ? hovered : null;

    const chart = (
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className={cn('w-full', !tooltip && className)}
        role="img"
        aria-hidden="true"
      >
        {targetLine}
        {active !== null && (
          /* The whole slot lights up rather than the bar: a rest day has no bar
             to light and still has to be findable. */
          <rect
            x={(slot * active).toFixed(1)}
            y="0"
            width={slot.toFixed(1)}
            height={height}
            rx={Math.min(4, slot / 2).toFixed(1)}
            className="fill-foreground/10"
          />
        )}
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
              rx={Math.min(3, barWidth / 2)}
              fill={stroke}
              opacity={v > 0 ? (active === null || active === i ? 1 : 0.35) : 0}
            />
          );
        })}
      </svg>
    );

    if (!tooltip) return chart;

    const pick = (clientX: number, element: HTMLElement) => {
      const box = element.getBoundingClientRect();
      const ratio = (clientX - box.left) / (box.width || 1);
      setHovered(Math.min(points.length - 1, Math.max(0, Math.floor(ratio * points.length))));
    };

    const step = (by: number) =>
      setHovered((prev) => {
        const next = prev === null ? (by > 0 ? 0 : points.length - 1) : prev + by;
        return Math.min(points.length - 1, Math.max(0, next));
      });

    return (
      <div
        className={cn(
          'focus-visible:ring-ring relative rounded-lg outline-none focus-visible:ring-2',
          className,
        )}
        role="group"
        tabIndex={0}
        aria-label={t('chart.arrowHint')(label ?? t('chart.daily'))}
        /* Pointer rather than mouse, so a finger held on the chart reads a day
           the same way a cursor over it does. Touch clears on lift: a tap that
           left the card parked over the chart for good would be worse than no
           card at all. */
        onPointerMove={(e) => {
          if (e.pointerType === 'mouse') pick(e.clientX, e.currentTarget);
        }}
        onPointerDown={(e) => pick(e.clientX, e.currentTarget)}
        onPointerUp={(e) => {
          if (e.pointerType !== 'mouse') setHovered(null);
        }}
        onPointerCancel={() => setHovered(null)}
        onPointerLeave={() => setHovered(null)}
        onBlur={() => setHovered(null)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') step(1);
          else if (e.key === 'ArrowLeft') step(-1);
          else if (e.key === 'Escape') setHovered(null);
          else return;
          e.preventDefault();
        }}
      >
        {chart}
        {active !== null && (
          <Readout position={(active + 0.5) / points.length}>
            {tooltip(points[active]!, active)}
          </Readout>
        )}
      </div>
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
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** The readout's widest allowed size, as a percentage of the chart. */
const READOUT_MAX = 70;

/**
 * The floating card, parked over the top of the chart and anchored to the day
 * under the pointer.
 *
 * It slides rather than flips at the ends: the horizontal translation runs from
 * 0% at the left edge through 50% in the middle to 100% at the right, which
 * keeps the card inside the chart — and so inside the card the chart sits on,
 * which clips what overflows it — without jumping sideways as the pointer
 * crosses some threshold. `READOUT_MAX` is what makes that arithmetic safe: a
 * card no wider than that fraction can always be fitted.
 */
function Readout({ position, children }: { position: number; children: React.ReactNode }) {
  const pct = position * 100;
  const shift = Math.min(
    Math.max(50, ((pct + READOUT_MAX - 100) * 100) / READOUT_MAX),
    (pct * 100) / READOUT_MAX,
  );

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0" role="status" aria-live="polite">
      <div
        className="bg-card border-border chunk-sm absolute top-0 w-max max-w-[70%] rounded-xl border-2 px-2.5 py-1.5"
        style={{ left: `${pct}%`, transform: `translateX(-${shift}%)` }}
      >
        {children}
      </div>
    </div>
  );
}
