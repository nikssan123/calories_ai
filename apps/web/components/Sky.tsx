'use client';

import { useEffect, useState } from 'react';
import { skyAt, type Sky as SkyColours } from '@/lib/sky';
import { useScheme } from '@/components/ThemeSync';
import { cn } from '@/lib/utils';

/** The sky of the hour, as a hook. */
export function useSky(): SkyColours {
  return skyAt(useMinute(), useScheme());
}

/**
 * The clock it reads: once a minute, never per frame.
 *
 * A minute is the resolution anybody could notice a sky change at, and it keeps
 * the whole effect to one state update a minute rather than an animation
 * running for as long as the tab is open — which, on the screen people leave
 * open on a second monitor, is a long time.
 *
 * It starts at a *fixed* time rather than at `new Date()` so the server and the
 * first client render agree; the real hour arrives in the effect below, one
 * tick later, which is also when the scheme resolves. Both corrections land in
 * the same paint.
 */
const DAWN = new Date(2000, 0, 1, 9, 0, 0);

function useMinute(): Date {
  const [now, setNow] = useState<Date>(DAWN);
  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/**
 * The header's light: three bands of the hour's sky, running down into the
 * page's own ground so there is no edge where the sky stops.
 *
 * Behind everything, and not a container: whatever it is lighting is laid out
 * over it in the normal flow, so nothing in the sky is ever drawn on top of a
 * word. That is the layout rule the app holds itself to (GLOW-UP.md, "Nothing
 * floats over text") and it is the reason this takes no children.
 *
 * The haze the ring sits in is deliberately not here — see <Haze>.
 */
export function Sky({
  sky,
  className,
  height = '26rem',
}: {
  sky: SkyColours;
  className?: string;
  height?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn('pointer-events-none absolute inset-x-0 top-0', className)}
      style={{
        height,
        /* Into transparent rather than into the ground colour, so the sky melts
           into whatever it is laid over — the page's ambient light — with no
           seam at its foot. */
        backgroundImage: `linear-gradient(180deg, ${sky.top} 0%, ${sky.mid} 46%, ${sky.low}cc 74%, ${sky.low}00 100%)`,
      }}
    />
  );
}

/**
 * The warm light the ring sits in, centred on whatever it is given as a parent.
 *
 * Separate from <Sky> because the two are pinned to different things: the sky
 * is a band across the top of the page, and the haze belongs to the ring, which
 * is centred on a phone and sits in the left column on a wide screen. Pinning
 * it to the ring rather than to the sky is what keeps it under the ring in both
 * layouts instead of half a column away in one of them.
 *
 * Not clipped, and allowed to spill past the sky's own foot, which is the
 * point: a light with an edge is a sticker.
 */
export function Haze({ sky, size = 480 }: { sky: SkyColours; size?: number }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute top-1/2 left-1/2 -z-10 -translate-x-1/2 -translate-y-1/2 rounded-full"
      style={{
        width: size,
        height: size,
        backgroundImage: `radial-gradient(circle, ${sky.haze} 0%, ${sky.haze.replace(/[\d.]+\)$/, '0)')} 62%)`,
      }}
    />
  );
}
