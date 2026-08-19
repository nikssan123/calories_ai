'use client';

import { useId } from 'react';

/**
 * The app mark: a progress ring that is also a speech bubble. The ring opens at
 * 10 o'clock the way the day's calories are still open, and the three dots read
 * at once as a typing indicator and as the macros — protein, carbs, fat.
 *
 * Colours come from the theme tokens (via `style`, since presentation
 * attributes don't resolve `var()`), so the mark follows the in-app light/dark
 * toggle rather than only the OS setting. `public/logo.svg` and `app/icon.svg`
 * are the same geometry with the colours baked in, for use outside React.
 */
export function Logo({ size = 28, className }: { size?: number; className?: string }) {
  // React's ids contain colons, which some engines choke on inside url(#…).
  const gradient = `logo-${useId().replace(/:/g, '')}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      role="img"
      aria-label="Nutrition"
      className={className}
    >
      <defs>
        {/* userSpaceOnUse so the ring and the tail share one continuous ramp. */}
        <linearGradient
          id={gradient}
          gradientUnits="userSpaceOnUse"
          x1="8.5"
          y1="6.8"
          x2="55.5"
          y2="57.2"
        >
          <stop offset="0" style={{ stopColor: 'var(--calories)' }} />
          <stop offset="1" style={{ stopColor: 'var(--brand-purple)' }} />
        </linearGradient>
      </defs>

      {/* The bubble's tail, hung off the lower-left of the ring. */}
      <path
        d="M27.28 50.76Q19.36 54.29 14.51 56.45A1.9 1.9 0 0 0 11.49 54.15Q12.17 48.71 13.29 39.83Z"
        fill={`url(#${gradient})`}
      />
      {/* 300° of ring — a day in progress, not a closed circle. */}
      <path
        d="M32 10.3A20 20 0 1 1 14.68 20.3"
        fill="none"
        stroke={`url(#${gradient})`}
        strokeWidth="7"
        strokeLinecap="round"
      />
      <circle cx="24" cy="30.3" r="2.8" style={{ fill: 'var(--protein)' }} />
      <circle cx="32" cy="30.3" r="2.8" style={{ fill: 'var(--carbs)' }} />
      <circle cx="40" cy="30.3" r="2.8" style={{ fill: 'var(--fat)' }} />
    </svg>
  );
}
