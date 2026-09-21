'use client';

import { useId } from 'react';

/**
 * One icon family, in place of the emoji.
 *
 * Emoji were doing the illustrating — a flexed arm for protein, an avocado for
 * fat, a trainer for steps — and they had the two faults emoji always have:
 * they are drawn by the platform rather than by us, so a Mac, a Windows box and
 * an Android phone show three different pictures of the same macro, and none of
 * them ever matched the palette they sat in (GLOW-UP.md, "illustration").
 *
 * These are soft-lit and slightly round: a colour ramp from a highlight at the
 * top left to a darker rim, and a white sheen laid over the top. They read at
 * 16px in a macro row and at 56px in an empty state, and they are the same
 * picture on every platform and in the app, because they are paths.
 *
 * The paths are `apps/mobile/components/icons/Glossy.tsx`, unchanged — the same
 * viewBox, the same ramps, the same draw list. Two copies of a drawing is not
 * ideal and a shared package for nineteen icons would be worse; what matters is
 * that neither is redrawn by hand, so a change is a copy rather than a redesign.
 *
 * The gradients are per instance: SVG ids are document-global, so two icons of
 * the same kind on one page would otherwise share an id and whichever rendered
 * last would repaint the other.
 */
export type GlossyName =
  | 'protein'
  | 'carbs'
  | 'fat'
  | 'steps'
  | 'streak'
  | 'weight'
  | 'avocado'
  | 'egg'
  | 'fish'
  | 'apple'
  | 'bowl'
  | 'bar'
  | 'plate'
  | 'dumbbell'
  | 'calendar'
  | 'medal'
  | 'repeat'
  | 'chef'
  | 'basket';

type Ramp = readonly [string, string, string];

const RAMPS = {
  avo: ['#c9f27a', '#6cbf3a', '#2f7d22'],
  pit: ['#c58a4e', '#9a6231', '#6b3c17'],
  egg: ['#ffffff', '#f4ede1', '#e6dccb'],
  yolk: ['#ffe27a', '#ffc04a', '#ff9d1a'],
  fish: ['#ffb9a0', '#ff7a5c', '#d0432c'],
  apple: ['#ff8a8a', '#e8322f', '#951a1a'],
  bread: ['#ffd9a3', '#e6a25a', '#9c5d22'],
  drum: ['#ffcf8f', '#e58a3a', '#9f4f16'],
  drop: ['#e4cbff', '#b06bff', '#6a2fc4'],
  shoe: ['#9ad9ff', '#3b9eff', '#1c5bb3'],
  flame: ['#fff2a8', '#ffa51f', '#ff5fa2'],
  scale: ['#b8f5e2', '#23d3b0', '#0d8a70'],
  wood: ['#8a6a4a', '#5e422b', '#3b2415'],
  plate: ['#ffffff', '#f6efe4', '#e3d6c4'],
  pink: ['#ffc2dc', '#ff5fa2', '#c13a7a'],
  sky: ['#bfe3ff', '#3b9eff', '#1c5bb3'],
  gold: ['#fff2a8', '#ffc83d', '#c98a0b'],
  mint: ['#b8f5d8', '#12b76a', '#0a7a48'],
} satisfies Record<string, Ramp>;

type RampName = keyof typeof RAMPS;

export function Glossy({
  name,
  size = 24,
  className,
}: {
  name: GlossyName;
  size?: number;
  className?: string;
}) {
  const id = useId().replace(/:/g, '');
  const fill = (ramp: RampName) => `url(#${id}-${ramp})`;
  const sheen = `url(#${id}-hl)`;
  const used = RAMPS_FOR[name];

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      aria-hidden
      focusable="false"
    >
      <defs>
        <radialGradient id={`${id}-hl`} cx="0.35" cy="0.25" r="0.6">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="0.5" stopColor="#ffffff" stopOpacity="0.25" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        {used.map((ramp) => (
          <radialGradient
            key={ramp}
            id={`${id}-${ramp}`}
            cx={ramp === 'flame' ? '0.45' : '0.4'}
            cy={ramp === 'flame' ? '0.8' : '0.3'}
            r="0.8"
          >
            <stop offset="0" stopColor={RAMPS[ramp][0]} />
            <stop offset="0.6" stopColor={RAMPS[ramp][1]} />
            <stop offset="1" stopColor={RAMPS[ramp][2]} />
          </radialGradient>
        ))}
      </defs>
      {DRAW[name](fill, sheen)}
    </svg>
  );
}

const RAMPS_FOR: Record<GlossyName, RampName[]> = {
  protein: ['drum'],
  carbs: ['bread'],
  fat: ['drop'],
  steps: ['shoe'],
  streak: ['flame'],
  weight: ['scale'],
  avocado: ['avo', 'pit'],
  egg: ['egg', 'yolk'],
  fish: ['fish'],
  apple: ['apple'],
  bowl: ['wood'],
  bar: ['wood'],
  plate: ['plate', 'avo', 'fish'],
  dumbbell: ['pink'],
  calendar: ['sky', 'plate'],
  medal: ['gold', 'pink'],
  repeat: ['mint'],
  chef: ['plate'],
  basket: ['wood', 'apple', 'avo'],
};

type Fill = (ramp: RampName) => string;

const AVOCADO =
  'M32 6c9 0 12 10 14 18 3 10 10 12 10 22 0 9-11 14-24 14S8 55 8 46c0-10 7-12 10-22C20 16 23 6 32 6z';
const EGG = 'M10 40c0-8 8-12 14-20 5-7 10-10 18-8 8 2 14 10 14 18 0 12-10 20-24 20S10 50 10 40z';
const FISH = 'M6 32c8-12 20-18 32-16 6 1 10 5 14 10l6-8v28l-6-8c-4 5-8 9-14 10-12 2-24-4-32-16z';
const APPLE =
  'M32 18c6-6 14-6 20 0 8 8 6 26-4 36-4 4-8 4-12 2-4 2-8 2-12-2C14 44 12 26 20 18c4-4 8-4 12 0z';
const BREAD =
  'M14 22c0-8 8-12 18-12s18 4 18 12c0 3-1 5-3 6v24c0 3-2 5-5 5H22c-3 0-5-2-5-5V28c-2-1-3-3-3-6z';
const DRUM = 'M40 8c10 0 16 8 16 16 0 10-8 16-18 18l-6 6-6-6C16 40 8 32 12 22 16 12 30 8 40 8z';
const DROP = 'M32 6c8 14 20 24 20 36 0 11-9 18-20 18S12 53 12 42c0-12 12-22 20-36z';
const SHOE = 'M8 40c6-4 10-12 12-20 3 2 8 6 14 6 6 2 10 8 18 10 4 1 6 4 6 8v4H8z';
const FLAME =
  'M32 4c2 10 10 14 14 24 4 12-2 30-14 30S14 40 18 28c2-6 6-8 8-14 2 6 6 8 8 6-2-6-2-12-2-16z';
const BOWL = 'M6 30h52c0 14-10 26-26 26S6 44 6 30z';

const DRAW: Record<GlossyName, (fill: Fill, sheen: string) => React.ReactNode> = {
  avocado: (fill, sheen) => (
    <g>
      <path d={AVOCADO} fill={fill('avo')} />
      <ellipse cx="32" cy="42" rx="10" ry="9" fill={fill('pit')} />
      <ellipse cx="29" cy="39" rx="3.5" ry="2.4" fill="#fff" opacity={0.6} />
      <path d={AVOCADO} fill={sheen} />
    </g>
  ),
  egg: (fill, sheen) => (
    <g>
      <path d={EGG} fill={fill('egg')} />
      <circle cx="32" cy="36" r="10" fill={fill('yolk')} />
      <ellipse cx="28.5" cy="32.5" rx="3.5" ry="2.2" fill="#fff" opacity={0.75} />
      <path d={EGG} fill={sheen} opacity={0.6} />
    </g>
  ),
  fish: (fill, sheen) => (
    <g>
      <path d={FISH} fill={fill('fish')} />
      <path
        d="M22 20c6 6 6 18 0 24M30 18c5 7 5 21 0 28"
        stroke="#fff"
        strokeOpacity={0.55}
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
      />
      <circle cx="14" cy="30" r="2.4" fill="#3b1a12" />
      <path d={FISH} fill={sheen} opacity={0.7} />
    </g>
  ),
  apple: (fill, sheen) => (
    <g>
      <path d={APPLE} fill={fill('apple')} />
      <path
        d="M32 18c0-6 3-9 8-10"
        stroke="#5a3418"
        strokeWidth={3}
        fill="none"
        strokeLinecap="round"
      />
      <path d="M34 12c4-6 10-6 12-4-2 4-6 6-12 4z" fill="#5fae3a" />
      <path d={APPLE} fill={sheen} opacity={0.8} />
    </g>
  ),
  carbs: (fill, sheen) => (
    <g>
      <path d={BREAD} fill={fill('bread')} />
      <path
        d="M24 34c3-4 7-4 10 0M32 44c3-4 7-4 10 0"
        stroke="#fff"
        strokeOpacity={0.5}
        strokeWidth={2.5}
        fill="none"
        strokeLinecap="round"
      />
      <path d={BREAD} fill={sheen} opacity={0.7} />
    </g>
  ),
  protein: (fill, sheen) => (
    <g>
      <path d={DRUM} fill={fill('drum')} />
      <path d="M26 42l-6 6-4-2-4 4c-2 2-2 4 0 6s4 2 6 0l4-4-2-4 6-6z" fill="#f4e8d6" />
      <circle cx="14" cy="52" r="3" fill="#f4e8d6" />
      <path d={DRUM} fill={sheen} opacity={0.8} />
    </g>
  ),
  fat: (fill, sheen) => (
    <g>
      <path d={DROP} fill={fill('drop')} />
      <path d={DROP} fill={sheen} opacity={0.9} />
      <ellipse
        cx="24"
        cy="40"
        rx="3"
        ry="6"
        fill="#fff"
        opacity={0.45}
        transform="rotate(-10 24 40)"
      />
    </g>
  ),
  steps: (fill, sheen) => (
    <g>
      <path d={SHOE} fill={fill('shoe')} />
      <path d="M8 44h50v4c0 2-2 4-4 4H8z" fill="#1c3f7a" />
      <path
        d="M26 30l6-4M32 36l6-4M38 40l6-4"
        stroke="#fff"
        strokeOpacity={0.7}
        strokeWidth={2.5}
        strokeLinecap="round"
      />
      <path d={SHOE} fill={sheen} opacity={0.7} />
    </g>
  ),
  streak: (fill) => (
    <g>
      <path d={FLAME} fill={fill('flame')} />
      <path
        d="M32 34c2 4 8 8 6 14-1 5-4 8-6 8s-6-3-6-8c0-5 4-8 6-14z"
        fill="#fff6c8"
        opacity={0.9}
      />
    </g>
  ),
  weight: (fill, sheen) => (
    <g>
      <rect x="8" y="10" width="48" height="44" rx="10" fill={fill('scale')} />
      <path
        d="M18 30a14 14 0 0 1 28 0"
        stroke="#fff"
        strokeWidth={4}
        fill="none"
        strokeLinecap="round"
        opacity={0.9}
      />
      <path d="M32 30l6-8" stroke="#0d5c4a" strokeWidth={3} strokeLinecap="round" />
      <rect x="8" y="10" width="48" height="44" rx="10" fill={sheen} opacity={0.8} />
    </g>
  ),
  bowl: (fill, sheen) => (
    <g>
      <path d={BOWL} fill={fill('wood')} />
      <ellipse cx="32" cy="30" rx="26" ry="7" fill="#f4e8d6" />
      <circle cx="22" cy="28" r="4" fill="#6cbf3a" />
      <circle cx="34" cy="26" r="4.5" fill="#ff7a5c" />
      <circle cx="44" cy="29" r="3.5" fill="#ffd36a" />
      <path d={BOWL} fill={sheen} opacity={0.5} />
    </g>
  ),
  bar: (fill, sheen) => (
    <g>
      <rect x="8" y="16" width="48" height="32" rx="8" fill={fill('wood')} />
      <path
        d="M20 16v32M32 16v32M44 16v32M8 32h48"
        stroke="#fff"
        strokeOpacity={0.18}
        strokeWidth={2}
      />
      <rect x="8" y="16" width="48" height="32" rx="8" fill={sheen} opacity={0.5} />
    </g>
  ),
  plate: (fill, sheen) => (
    <g>
      <circle cx="32" cy="34" r="26" fill={fill('plate')} />
      <circle cx="32" cy="34" r="18" fill="none" stroke="#e3d6c4" strokeWidth={2} />
      <ellipse cx="26" cy="32" rx="8" ry="6" fill={fill('avo')} />
      <ellipse cx="38" cy="38" rx="7" ry="5" fill={fill('fish')} />
      <circle cx="32" cy="34" r="26" fill={sheen} opacity={0.6} />
    </g>
  ),
  dumbbell: (fill, sheen) => (
    <g>
      <rect x="22" y="29" width="20" height="6" rx="3" fill="#8a7a6c" />
      <rect x="12" y="18" width="10" height="28" rx="4" fill={fill('pink')} />
      <rect x="42" y="18" width="10" height="28" rx="4" fill={fill('pink')} />
      <rect x="5" y="24" width="7" height="16" rx="3" fill={fill('pink')} />
      <rect x="52" y="24" width="7" height="16" rx="3" fill={fill('pink')} />
      <rect x="12" y="18" width="10" height="28" rx="4" fill={sheen} opacity={0.7} />
      <rect x="42" y="18" width="10" height="28" rx="4" fill={sheen} opacity={0.7} />
    </g>
  ),
  calendar: (fill, sheen) => (
    <g>
      <rect x="8" y="12" width="48" height="44" rx="10" fill={fill('plate')} />
      <path d="M8 22a10 10 0 0 1 10-10h28a10 10 0 0 1 10 10v6H8z" fill={fill('sky')} />
      <rect x="19" y="6" width="5" height="12" rx="2.5" fill="#5e422b" />
      <rect x="40" y="6" width="5" height="12" rx="2.5" fill="#5e422b" />
      <circle cx="21" cy="38" r="3" fill="#c9b9a6" />
      <circle cx="32" cy="38" r="3" fill="#c9b9a6" />
      <circle cx="43" cy="38" r="3" fill={fill('sky')} />
      <circle cx="21" cy="48" r="3" fill="#c9b9a6" />
      <circle cx="32" cy="48" r="3" fill="#c9b9a6" />
      <rect x="8" y="12" width="48" height="44" rx="10" fill={sheen} opacity={0.6} />
    </g>
  ),
  medal: (fill, sheen) => (
    <g>
      <path d="M20 4h10l6 22H26z" fill={fill('pink')} />
      <path d="M44 4H34l-6 22h10z" fill={fill('pink')} opacity={0.85} />
      <circle cx="32" cy="40" r="18" fill={fill('gold')} />
      <circle cx="32" cy="40" r="12.5" fill="none" stroke="#fff" strokeOpacity={0.55} strokeWidth={2} />
      <path
        d="M32 31l2.6 5.4 5.9.8-4.3 4.1 1 5.9L32 44.4l-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z"
        fill="#fff"
        opacity={0.9}
      />
      <circle cx="32" cy="40" r="18" fill={sheen} opacity={0.7} />
    </g>
  ),
  repeat: (fill) => (
    <g>
      <path
        d="M14 34a18 18 0 0 1 30-13.4M50 30a18 18 0 0 1-30 13.4"
        stroke={fill('mint')}
        strokeWidth={9}
        strokeLinecap="round"
        fill="none"
      />
      <path d="M40 12l10 8-11 5z" fill={fill('mint')} />
      <path d="M24 52l-10-8 11-5z" fill={fill('mint')} />
      <path
        d="M14 34a18 18 0 0 1 30-13.4"
        stroke="#fff"
        strokeOpacity={0.45}
        strokeWidth={2.5}
        strokeLinecap="round"
        fill="none"
        transform="translate(-1 -3)"
      />
    </g>
  ),
  chef: (fill, sheen) => (
    <g>
      <path
        d="M18 38c-7 0-12-5-12-11s5-11 11-11c2-6 8-10 15-10s13 4 15 10c6 0 11 5 11 11s-5 11-12 11z"
        fill={fill('plate')}
      />
      <rect x="16" y="38" width="32" height="16" rx="4" fill={fill('plate')} />
      <path d="M16 44h32" stroke="#e3d6c4" strokeWidth={2} />
      <path d="M24 40v14M32 40v14M40 40v14" stroke="#e3d6c4" strokeWidth={1.6} />
      <path
        d="M18 38c-7 0-12-5-12-11s5-11 11-11c2-6 8-10 15-10s13 4 15 10c6 0 11 5 11 11s-5 11-12 11z"
        fill={sheen}
        opacity={0.8}
      />
    </g>
  ),
  basket: (fill, sheen) => (
    <g>
      <circle cx="24" cy="26" r="9" fill={fill('apple')} />
      <ellipse cx="40" cy="25" rx="9" ry="10" fill={fill('avo')} />
      <path d="M6 30h52l-6 24a4 4 0 0 1-4 3H16a4 4 0 0 1-4-3z" fill={fill('wood')} />
      <path d="M12 38h40M14 46h36" stroke="#fff" strokeOpacity={0.2} strokeWidth={2} />
      <path d="M22 30l-2 26M32 30v26M42 30l2 26" stroke="#fff" strokeOpacity={0.15} strokeWidth={2} />
      <path d="M6 30h52l-6 24a4 4 0 0 1-4 3H16a4 4 0 0 1-4-3z" fill={sheen} opacity={0.5} />
    </g>
  ),
};
