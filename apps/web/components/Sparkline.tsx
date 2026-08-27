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
   * and nothing else.
   *
   * A line gets this as well as a bar chart, and needs it more. The line is
   * usually a rolling mean, so the morning you log a figure half a kilo up from
   * the last one, the trace can still be falling — the reading that aged out of
   * the window was higher than either. Both numbers are right and the chart on
   * its own can only show one of them, which is exactly the shape of "the chart
   * is wrong". The readout carries the day's own value next to the line's.
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
  const bars = variant === 'bars';
  const reference = target ?? undefined;
  // Bars are read against zero; a bar chart with a floating baseline overstates
  // every difference on it.
  const lo = bars ? 0 : Math.min(...present, ...(reference ? [reference] : []));
  const hi = Math.max(...present, ...(reference ? [reference] : []));
  // Pad the domain so the trace sits in the body of the chart rather than
  // hugging an edge — a flat series against a distant target looks broken
  // otherwise.
  const pad = (hi - lo || Math.abs(hi) * 0.1 || 1) * 0.18;
  const min = bars ? 0 : lo - pad;
  const max = hi + pad;
  const span = max - min || 1;

  const x = (i: number) => (i / Math.max(1, points.length - 1)) * width;
  const y = (v: number) => height - ((v - min) / span) * (height - 10) - 5;

  // Switching 90d → 14d can leave the held index pointing past the end.
  const active = hovered !== null && hovered < points.length ? hovered : null;

  /*
   * Where a day sits along the chart, and the inverse — which day a pointer
   * that far across is asking about.
   *
   * The two shapes cannot share this. A bar owns a slot and is read by the slot
   * the pointer is inside; a line's samples sit *on* the ends, the first at 0
   * and the last at 1, and are read by whichever is nearest. Anchoring a line's
   * readout to slot centres would park it half a day off at both edges.
   */
  const anchor = (i: number) =>
    bars ? (i + 0.5) / points.length : i / Math.max(1, points.length - 1);
  const dayAt = (ratio: number) =>
    Math.min(
      points.length - 1,
      Math.max(
        0,
        bars ? Math.floor(ratio * points.length) : Math.round(ratio * (points.length - 1)),
      ),
    );

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

  let chart: React.ReactNode;
  /*
   * Which end of the chart the readout parks at.
   *
   * A bar grows from the floor, so a card pinned to the ceiling is always in
   * free space and stays there — it never moves as you scrub, which is what you
   * want of something you are reading. A trace has no such habit: it can be
   * anywhere, and at the top of the chart the card would sit exactly on the
   * point it is describing. So a line's card takes the half the point is not
   * in, and the point stays visible under it.
   */
  let place: 'top' | 'bottom' = 'top';

  if (bars) {
    // Leave a hairline of gap between bars, but never let them vanish on a
    // 365-day window — below about a pixel the chart reads as an empty box.
    const slot = width / points.length;
    const barWidth = Math.max(1.5, slot * 0.66);

    chart = (
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
  } else {
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

    // The point on the trace the readout is talking about. Null on a day the
    // line does not reach — before the first sample there is nothing to mark,
    // and the readout says so in words.
    const marked = active === null ? null : points[active]![accessor];
    if (marked !== null && y(marked) < height / 2) place = 'bottom';

    chart = (
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className={cn('w-full', !tooltip && className)}
        role="img"
        aria-hidden="true"
      >
        {targetLine}
        {/* Drawn before the trace, so pointing at a day never covers the shape
            you are pointing at. */}
        {active !== null && (
          <line
            x1={x(active).toFixed(1)}
            x2={x(active).toFixed(1)}
            y1="0"
            y2={height}
            className="stroke-border"
            strokeWidth="2"
            strokeLinecap="round"
          />
        )}
        <path
          d={path.trim()}
          fill="none"
          stroke={stroke}
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {marked !== null && (
          /* Ringed in the card's own colour so the dot reads as a dot against a
             trace of the same ink, at any density of samples. */
          <circle
            cx={x(active!).toFixed(1)}
            cy={y(marked).toFixed(1)}
            r="5"
            fill={stroke}
            className="stroke-card"
            strokeWidth="3"
          />
        )}
      </svg>
    );
  }

  if (!tooltip) return chart;

  const pick = (clientX: number, element: HTMLElement) => {
    const box = element.getBoundingClientRect();
    setHovered(dayAt((clientX - box.left) / (box.width || 1)));
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
        <Readout position={anchor(active)} place={place}>
          {tooltip(points[active]!, active)}
        </Readout>
      )}
    </div>
  );
}

/** The readout's widest allowed size, as a percentage of the chart. */
const READOUT_MAX = 70;

/**
 * The floating card, parked over the chart and anchored to the day under the
 * pointer.
 *
 * It slides rather than flips at the ends: the horizontal translation runs from
 * 0% at the left edge through 50% in the middle to 100% at the right, which
 * keeps the card inside the chart — and so inside the card the chart sits on,
 * which clips what overflows it — without jumping sideways as the pointer
 * crosses some threshold. `READOUT_MAX` is what makes that arithmetic safe: a
 * card no wider than that fraction can always be fitted.
 */
function Readout({
  position,
  place = 'top',
  children,
}: {
  position: number;
  place?: 'top' | 'bottom';
  children: React.ReactNode;
}) {
  const pct = position * 100;
  const shift = Math.min(
    Math.max(50, ((pct + READOUT_MAX - 100) * 100) / READOUT_MAX),
    (pct * 100) / READOUT_MAX,
  );

  return (
    <div
      className={cn('pointer-events-none absolute inset-x-0', place === 'top' ? 'top-0' : 'bottom-0')}
      role="status"
      aria-live="polite"
    >
      <div
        className={cn(
          'bg-card border-border chunk-sm absolute w-max max-w-[70%] rounded-xl border-2 px-2.5 py-1.5',
          place === 'top' ? 'top-0' : 'bottom-0',
        )}
        style={{ left: `${pct}%`, transform: `translateX(-${shift}%)` }}
      >
        {children}
      </div>
    </div>
  );
}
