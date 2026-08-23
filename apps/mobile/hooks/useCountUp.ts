import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/**
 * Counts to `value`, from wherever it currently is.
 *
 * The most-noticed animation in the app, and for a while the only figure that
 * had it was the ring's. A number that swaps has changed; a number that travels
 * has *moved*, which is the sentence every total on these screens is trying to
 * say — and the swap is particularly weak where the change was something the
 * reader just did, because they are looking straight at it waiting for an
 * answer.
 *
 * It starts from the value it is first handed rather than from zero, so a
 * screen opening does not count anything up. That is deliberate: counting from
 * zero on every navigation is a tax dressed as a delight, and it would arrive
 * at exactly the moment the reader is trying to read the number.
 *
 * A plain ease rather than the spring the ring's arc gets: a total that
 * overshoots on its way to settling reads as the number being wrong for a
 * moment, which is a lie the arc can tell and a figure cannot.
 */
export function useCountUp(value: number, ms: number): number {
  const [shown, setShown] = useState(value);
  const fromRef = useRef(value);
  const frame = useRef<ReturnType<typeof requestAnimationFrame>>(undefined);
  const reduced = useReducedMotion();

  useEffect(() => {
    const from = fromRef.current;
    const delta = value - from;
    if (reduced || delta === 0) {
      fromRef.current = value;
      setShown(value);
      return;
    }

    const start = Date.now();
    const tick = () => {
      const p = Math.min(1, (Date.now() - start) / ms);
      // Matches --ease-out: settles without overshooting.
      setShown(from + delta * (1 - Math.pow(1 - p, 3)));
      if (p < 1) {
        frame.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = value;
      }
    };
    frame.current = requestAnimationFrame(tick);

    return () => {
      if (frame.current !== undefined) cancelAnimationFrame(frame.current);
      // Whatever we reached is the honest starting point for the next change.
      fromRef.current = shown;
    };
    // `shown` is read only in cleanup; depending on it would restart the run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, ms, reduced]);

  return shown;
}
