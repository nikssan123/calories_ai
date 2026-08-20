'use client';

import { Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * How much of it you actually ate.
 *
 * A recipe card without this quietly assumes one serving, which is wrong often
 * enough to matter: a traybake that makes four gets eaten two at a time, and
 * half a portion is what is left at nine o'clock. Logging 300 kcal when someone
 * ate 600 is the failure mode the whole app exists to avoid, and it is worse
 * than not logging at all — a wrong number is trusted, a missing one is not.
 *
 * Halves rather than free text. A stepper cannot be given nonsense, needs no
 * keyboard on a phone, and "1½ portions" is as fine-grained as anybody's
 * estimate of what they ate actually is — offering three decimal places would
 * be false precision in a control.
 */

export const SERVING_STEP = 0.5;
export const MAX_SERVINGS = 12;

export function Servings({
  value,
  onChange,
  unit,
  className,
}: {
  value: number;
  onChange: (next: number) => void;
  /** What one of them is, in the recipe's own words. */
  unit: string;
  className?: string;
}) {
  const step = (delta: number) =>
    onChange(clamp(Math.round((value + delta) / SERVING_STEP) * SERVING_STEP));

  return (
    <div className={cn('flex items-center justify-between gap-3', className)}>
      <div className="min-w-0">
        <p className="text-[15px]">How much did you have?</p>
        <p className="text-footnote text-muted-foreground truncate">
          {formatServings(value)} × {unit}
        </p>
      </div>

      <div className="bg-muted/60 flex shrink-0 items-center rounded-full">
        <button
          type="button"
          onClick={() => step(-SERVING_STEP)}
          disabled={value <= SERVING_STEP}
          aria-label="Less"
          className="text-muted-foreground hover:text-foreground flex size-9 items-center justify-center rounded-full disabled:opacity-40"
        >
          <Minus size={15} />
        </button>
        <span
          className="tnum w-10 text-center text-[15px] font-medium"
          aria-live="polite"
          aria-label={`${formatServings(value)} servings`}
        >
          {formatServings(value)}
        </span>
        <button
          type="button"
          onClick={() => step(SERVING_STEP)}
          disabled={value >= MAX_SERVINGS}
          aria-label="More"
          className="text-muted-foreground hover:text-foreground flex size-9 items-center justify-center rounded-full disabled:opacity-40"
        >
          <Plus size={15} />
        </button>
      </div>
    </div>
  );
}

function clamp(n: number): number {
  return Math.min(MAX_SERVINGS, Math.max(SERVING_STEP, n));
}

/** "½", "1½", "2" — a fraction reads faster than 1.5 at this size. */
export function formatServings(value: number): string {
  const whole = Math.floor(value);
  const half = value - whole >= 0.25;
  if (whole === 0) return '½';
  return half ? `${whole}½` : String(whole);
}

/** Macros for `servings` of something priced per serving. */
export function scale(perServing: number, servings: number): number {
  return perServing * servings;
}
