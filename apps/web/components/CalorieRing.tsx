'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';

/**
 * The day, as one fat shape.
 *
 * Three deliberate choices here:
 *
 * The ring has a ledge. A second track, offset four pixels down in the same
 * shadow colour every card uses, turns a flat annulus into something with a
 * bottom edge — the ring reads as a physical dial sitting on the page rather
 * than a stroke drawn on it. It is the single change that does most of the work
 * on this screen, and it costs one extra circle.
 *
 * The ring springs and the number does not. A shape that overshoots reads as
 * energy; a *number* that overshoots reads as a bug — 450 briefly showing 438
 * on its way to settling would look like the total was wrong. So the arc gets
 * the spring, the figure gets a plain ease, and the figure gets a one-shot pop
 * on arrival instead, which is the same feeling without the same lie.
 *
 * Over target turns the ring to ink rather than to red. It is unmissable either
 * way, but one of those is information and the other is a telling-off, and this
 * is a food app.
 */

/** Counts to `value`, from wherever it currently is. Honours reduced motion. */
function useCountUp(value: number, duration: number): number {
  const [shown, setShown] = useState(value);
  const fromRef = useRef(value);
  const frameRef = useRef<number>(undefined);

  useEffect(() => {
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const from = fromRef.current;
    const delta = value - from;
    if (reduced || delta === 0) {
      fromRef.current = value;
      setShown(value);
      return;
    }

    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // Matches --ease-out: settles without overshooting.
      const eased = 1 - Math.pow(1 - t, 3);
      const current = from + delta * eased;
      setShown(current);
      if (t < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = value;
      }
    };
    frameRef.current = requestAnimationFrame(tick);

    return () => {
      if (frameRef.current !== undefined) cancelAnimationFrame(frameRef.current);
      // Whatever we reached is the honest starting point for the next change.
      fromRef.current = shown;
    };
    // `shown` is read only in cleanup; depending on it would restart the run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration]);

  return shown;
}

export function CalorieRing({
  consumed,
  target,
  burned = 0,
  size = 184,
  strokeWidth = 22,
  className,
}: {
  consumed: number;
  target: number;
  burned?: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  const t = useT();
  const gradient = `ring-${useId().replace(/:/g, '')}`;
  // The ledge, scaled with the stroke so a small ring in the day rail does not
  // wear a shadow half as thick as its own track.
  const depth = Math.max(3, Math.round(strokeWidth * 0.22));
  const radius = (size - strokeWidth - depth) / 2;
  const centre = size / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = target > 0 ? consumed / target : 0;
  const dash = circumference * Math.min(1, Math.max(0, ratio));
  const over = consumed > target;
  const remaining = target - consumed;
  // The figure is a fraction of the dial rather than a fixed size. A quarter of
  // the diameter is exactly the 46px the default ring has always used, and it
  // is the only version of that number which survives being asked for a small
  // ring: at any size below the default a fixed 46px walks a four-digit total
  // straight out through the track.
  const figure = Math.round(size * 0.25);

  const shown = useCountUp(Math.round(Math.abs(remaining)), 900);

  // Remounting the figure is what restarts the pop; a class toggle would only
  // fire on the first change, because the animation is already on the element.
  const [popKey, setPopKey] = useState(0);
  const lastConsumed = useRef(consumed);
  useEffect(() => {
    if (lastConsumed.current !== consumed) {
      lastConsumed.current = consumed;
      setPopKey((k) => k + 1);
    }
  }, [consumed]);

  return (
    <div className={cn('relative inline-flex items-center justify-center', className)}>
      <svg width={size} height={size} aria-hidden>
        <defs>
          {/* The arc ramps across its own length, so a full day is visibly a
              richer green at the end than at the start. */}
          <linearGradient id={gradient} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={size} y2={size}>
            <stop offset="0" stopColor="var(--calories)" />
            <stop offset="1" stopColor="var(--logo-ramp)" />
          </linearGradient>
        </defs>

        {/* The ledge: the track again, pushed down by its own depth. */}
        <circle
          cx={centre}
          cy={centre + depth}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          stroke="var(--chunk)"
        />
        <circle
          cx={centre}
          cy={centre}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-muted"
        />

        <g transform={`rotate(-90 ${centre} ${centre})`}>
          <circle
            cx={centre}
            cy={centre}
            r={radius}
            fill="none"
            strokeWidth={strokeWidth}
            // A round cap on a zero-length dash still paints — an empty day
            // would otherwise wear a coloured dot at twelve o'clock as if
            // something had been logged.
            strokeLinecap={dash > 0 ? 'round' : 'butt'}
            strokeDasharray={`${dash} ${circumference}`}
            style={{
              stroke: over ? 'var(--foreground)' : `url(#${gradient})`,
              transition:
                'stroke-dasharray var(--dur-spring) var(--ease-spring), stroke var(--dur-quick) linear',
            }}
          />
        </g>
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          key={popKey}
          className="text-figure animate-pop leading-none"
          style={{ fontSize: `${figure}px`, color: over ? 'var(--foreground)' : undefined }}
        >
          {Math.round(shown).toLocaleString()}
        </span>
        <span className="text-footnote text-muted-foreground mt-1 font-bold">
          {over ? t('today.over') : t('today.toGo')}
        </span>
        {/* Tabular but not at figure weight: the burn is context for the number
            above it, and set heavy it read as the louder of the two. */}
        {burned > 0 && (
          <span className="tnum text-footnote mt-1 font-semibold text-[var(--exercise-text)]">
            {t('today.burned')(String(Math.round(burned)))}
          </span>
        )}
      </div>
    </div>
  );
}
