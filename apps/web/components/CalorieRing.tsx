'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * The day, as one shape.
 *
 * Two deliberate choices here:
 *
 * The ring springs and the number does not. A shape that overshoots reads as
 * energy; a *number* that overshoots reads as a bug — 450 briefly showing 438
 * on its way to settling would look like the total was wrong. So the arc gets
 * the spring and the figure gets a plain ease.
 *
 * Over target turns the ring to ink rather than to red. It is unmissable
 * either way, but one of those is information and the other is a telling-off,
 * and this is a food app.
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
  size = 176,
  strokeWidth = 16,
  className,
}: {
  consumed: number;
  target: number;
  burned?: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = target > 0 ? consumed / target : 0;
  const dash = circumference * Math.min(1, Math.max(0, ratio));
  const over = consumed > target;
  const remaining = target - consumed;

  const shown = useCountUp(Math.round(Math.abs(remaining)), 900);

  return (
    <div className={cn('relative inline-flex items-center justify-center', className)}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-muted"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          // A round cap on a zero-length dash still paints — an empty day would
          // otherwise wear a coloured dot at twelve o'clock as if something had
          // been logged.
          strokeLinecap={dash > 0 ? 'round' : 'butt'}
          strokeDasharray={`${dash} ${circumference}`}
          style={{
            stroke: over ? 'var(--foreground)' : 'var(--calories)',
            transition:
              'stroke-dasharray var(--dur-spring) var(--ease-spring), stroke var(--dur-quick) linear',
          }}
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="text-figure text-[2.75rem] leading-none"
          style={{ color: over ? 'var(--foreground)' : undefined }}
        >
          {Math.round(shown).toLocaleString()}
        </span>
        <span className="text-footnote text-muted-foreground mt-1.5">
          {over ? 'over' : 'remaining'}
        </span>
        {/* Tabular but not bold: the burn is context for the number above it,
            and at figure weight it read as the louder of the two. */}
        {burned > 0 && (
          <span className="tnum text-footnote mt-1 text-[var(--exercise)]">
            +{Math.round(burned)} burned
          </span>
        )}
      </div>
    </div>
  );
}
