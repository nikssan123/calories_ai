'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Whether the visitor has asked for less movement. Starts false so the
 * server-rendered markup is the plain one, and settles on the first effect.
 */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setReduced(media.matches);
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, []);

  return reduced;
}

/**
 * The page's one motion idea: eight pixels of rise and a fade as a section
 * arrives, on the app's own plain ease — this is chrome settling, not a number
 * reporting itself, so it gets `--ease-out` and never the spring. Everything
 * moves the same way and nothing moves twice, so the page settles rather than
 * performs.
 *
 * Content is never the animation — with `prefers-reduced-motion` this renders
 * the resting state and observes nothing.
 */
export function Reveal({
  delay = 0,
  className,
  children,
}: {
  delay?: number;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  const reduced = useReducedMotion();

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setShown(true);
        // Once revealed, always revealed. Scrolling back up should not replay
        // the page.
        observer.disconnect();
      },
      // Fire a little inside the bottom edge, so a section has finished
      // settling by the time it is properly on screen.
      { rootMargin: '0px 0px -8% 0px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      // `min-w-0`: as a grid item this would otherwise refuse to shrink below
      // its content's min-content width, and one unbreakable line — the TDEE
      // formula — would widen its whole column past the viewport.
      className={cn(
        'min-w-0',
        shown || reduced ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0',
        className,
      )}
      style={
        reduced
          ? undefined
          : {
              transition:
                'opacity var(--dur-spring) var(--ease-out), transform var(--dur-spring) var(--ease-out)',
              transitionDelay: `${delay}ms`,
            }
      }
    >
      {children}
    </div>
  );
}
