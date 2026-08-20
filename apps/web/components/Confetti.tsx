'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * The celebration.
 *
 * Fired when a macro target is met — the one unambiguously good thing that
 * happens in a food tracker several times a day. Deliberately *not* fired for
 * hitting the calorie target: "you have eaten exactly enough" is not a moment,
 * and throwing a party at the point someone crosses their limit is the kind of
 * cheerfulness that reads as sarcasm by dinner.
 *
 * It burps out of the element it is placed in, so the parent needs to be
 * `relative`. Everything is transform and opacity on a fixed number of nodes,
 * which the compositor handles without a repaint, and the whole thing unmounts
 * itself when it is done rather than leaving fifteen absolutely positioned
 * spans behind for the rest of the session.
 */

const PIECES = 14;
const DURATION_MS = 1100;

interface Piece {
  dx: number;
  dy: number;
  dr: number;
  size: number;
  delay: number;
  round: boolean;
  color: string;
}

function burst(colors: string[]): Piece[] {
  return Array.from({ length: PIECES }, (_, i) => {
    // A cone pointing up and outwards, so the pieces arc away from the thing
    // that just succeeded rather than raining onto it.
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.9;
    const distance = 34 + Math.random() * 46;
    return {
      dx: Math.cos(angle) * distance,
      // Gravity, roughly: everything ends lower than it was thrown.
      dy: Math.sin(angle) * distance + 42,
      dr: (Math.random() - 0.5) * 720,
      size: 5 + Math.random() * 5,
      delay: Math.random() * 90,
      round: i % 3 === 0,
      color: colors[i % colors.length]!,
    };
  });
}

export function Confetti({
  /** Change this to fire. Any value works; only the change is read. */
  trigger,
  colors = ['var(--calories)', 'var(--protein)', 'var(--carbs)', 'var(--fat)', 'var(--exercise)'],
  className,
}: {
  trigger: number | string | null;
  colors?: string[];
  className?: string;
}) {
  const [pieces, setPieces] = useState<Piece[] | null>(null);
  // The first value of `trigger` is the state on arrival, not a thing that just
  // happened — an already-met target must not throw confetti on every reload.
  const seen = useRef<number | string | null | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Held in a ref so a caller passing an inline array does not re-fire forever.
  const colorsRef = useRef(colors);
  colorsRef.current = colors;

  useEffect(() => {
    const first = seen.current === undefined;
    const changed = seen.current !== trigger;
    seen.current = trigger;
    if (first || !changed || trigger === null) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    setPieces(burst(colorsRef.current));
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setPieces(null), DURATION_MS);
  }, [trigger]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const nodes = useMemo(
    () =>
      pieces?.map((piece, i) => (
        <span
          key={i}
          className={cn('absolute', piece.round ? 'rounded-full' : 'rounded-[2px]')}
          style={{
            width: piece.size,
            height: piece.size * (piece.round ? 1 : 1.6),
            background: piece.color,
            animation: `confetti-fly ${DURATION_MS - piece.delay}ms var(--ease-out) ${piece.delay}ms both`,
            ['--dx' as string]: `${piece.dx}px`,
            ['--dy' as string]: `${piece.dy}px`,
            ['--dr' as string]: `${piece.dr}deg`,
          }}
        />
      )),
    [pieces],
  );

  if (!nodes) return null;

  return (
    <span
      aria-hidden
      className={cn(
        'pointer-events-none absolute top-1/2 left-1/2 z-10 block size-0 overflow-visible',
        className,
      )}
    >
      {nodes}
    </span>
  );
}
