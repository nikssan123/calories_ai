'use client';

import { cn } from '@/lib/utils';

/**
 * Apple Fitness-style activity ring. Rounded caps, a recessed track, and the
 * value spring-animating into place. Over-target is shown by colour rather than
 * by overshooting the ring, so the shape stays readable at a glance.
 */
export function CalorieRing({
  consumed,
  target,
  burned = 0,
  size = 176,
  strokeWidth = 14,
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
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          style={{
            stroke: over ? 'var(--destructive)' : 'var(--calories)',
            transition: 'stroke-dasharray 700ms cubic-bezier(0.34, 1.4, 0.64, 1), stroke 300ms',
          }}
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="tnum text-4xl font-semibold tracking-tight">
          {Math.round(Math.abs(remaining)).toLocaleString()}
        </span>
        <span className="text-footnote text-muted-foreground">
          {over ? 'over' : 'remaining'}
        </span>
        {burned > 0 && (
          <span className="tnum text-footnote mt-1 text-[var(--exercise)]">
            +{Math.round(burned)} burned
          </span>
        )}
      </div>
    </div>
  );
}
