import { useId } from 'react';
import Svg, { Circle, Defs, Ellipse, G, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

/**
 * One icon family, in place of the emoji.
 *
 * Emoji were doing the illustrating — a flexed arm for protein, an avocado for
 * fat, a trainer for steps — and they had the two faults emoji always have: they
 * are drawn by the phone rather than by us, so iOS and Android show different
 * pictures of the same macro, and none of them ever matched the palette they
 * sat in (GLOW-UP.md, "illustration").
 *
 * These are soft-lit and slightly round: a colour ramp from a highlight at the
 * top left to a darker rim, and a white sheen laid over the top. They read at
 * 20pt in a macro row and at 56pt in an empty state, and they are the same on
 * both platforms because they are paths.
 *
 * The gradients are per instance. SVG ids are document-global on the web and
 * per-`Svg` here, but two icons of the same kind in one list would otherwise
 * share an id in the same native view tree on Android, and whichever mounted
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
  | 'plate';

type Ramp = readonly [string, string, string];

const RAMPS: Record<string, Ramp> = {
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
};

export function Glossy({ name, size = 24 }: { name: GlossyName; size?: number }) {
  const id = useId().replace(/:/g, '');
  const fill = (ramp: keyof typeof RAMPS) => `url(#${id}-${ramp})`;
  const sheen = `url(#${id}-hl)`;
  const used = RAMPS_FOR[name];

  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Defs>
        <RadialGradient id={`${id}-hl`} cx="0.35" cy="0.25" r="0.6">
          <Stop offset="0" stopColor="#ffffff" stopOpacity="0.95" />
          <Stop offset="0.5" stopColor="#ffffff" stopOpacity="0.25" />
          <Stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </RadialGradient>
        {used.map((ramp) => (
          <RadialGradient
            key={ramp}
            id={`${id}-${ramp}`}
            cx={ramp === 'flame' ? '0.45' : '0.4'}
            cy={ramp === 'flame' ? '0.8' : '0.3'}
            r="0.8"
          >
            <Stop offset="0" stopColor={RAMPS[ramp]![0]} />
            <Stop offset="0.6" stopColor={RAMPS[ramp]![1]} />
            <Stop offset="1" stopColor={RAMPS[ramp]![2]} />
          </RadialGradient>
        ))}
      </Defs>
      {DRAW[name](fill, sheen)}
    </Svg>
  );
}

const RAMPS_FOR: Record<GlossyName, (keyof typeof RAMPS)[]> = {
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
};

type Fill = (ramp: keyof typeof RAMPS) => string;

const AVOCADO = 'M32 6c9 0 12 10 14 18 3 10 10 12 10 22 0 9-11 14-24 14S8 55 8 46c0-10 7-12 10-22C20 16 23 6 32 6z';
const EGG = 'M10 40c0-8 8-12 14-20 5-7 10-10 18-8 8 2 14 10 14 18 0 12-10 20-24 20S10 50 10 40z';
const FISH = 'M6 32c8-12 20-18 32-16 6 1 10 5 14 10l6-8v28l-6-8c-4 5-8 9-14 10-12 2-24-4-32-16z';
const APPLE = 'M32 18c6-6 14-6 20 0 8 8 6 26-4 36-4 4-8 4-12 2-4 2-8 2-12-2C14 44 12 26 20 18c4-4 8-4 12 0z';
const BREAD = 'M14 22c0-8 8-12 18-12s18 4 18 12c0 3-1 5-3 6v24c0 3-2 5-5 5H22c-3 0-5-2-5-5V28c-2-1-3-3-3-6z';
const DRUM = 'M40 8c10 0 16 8 16 16 0 10-8 16-18 18l-6 6-6-6C16 40 8 32 12 22 16 12 30 8 40 8z';
const DROP = 'M32 6c8 14 20 24 20 36 0 11-9 18-20 18S12 53 12 42c0-12 12-22 20-36z';
const SHOE = 'M8 40c6-4 10-12 12-20 3 2 8 6 14 6 6 2 10 8 18 10 4 1 6 4 6 8v4H8z';
const FLAME = 'M32 4c2 10 10 14 14 24 4 12-2 30-14 30S14 40 18 28c2-6 6-8 8-14 2 6 6 8 8 6-2-6-2-12-2-16z';
const BOWL = 'M6 30h52c0 14-10 26-26 26S6 44 6 30z';

const DRAW: Record<GlossyName, (fill: Fill, sheen: string) => React.ReactNode> = {
  avocado: (fill, sheen) => (
    <G>
      <Path d={AVOCADO} fill={fill('avo')} />
      <Ellipse cx="32" cy="42" rx="10" ry="9" fill={fill('pit')} />
      <Ellipse cx="29" cy="39" rx="3.5" ry="2.4" fill="#fff" opacity={0.6} />
      <Path d={AVOCADO} fill={sheen} />
    </G>
  ),
  egg: (fill, sheen) => (
    <G>
      <Path d={EGG} fill={fill('egg')} />
      <Circle cx="32" cy="36" r="10" fill={fill('yolk')} />
      <Ellipse cx="28.5" cy="32.5" rx="3.5" ry="2.2" fill="#fff" opacity={0.75} />
      <Path d={EGG} fill={sheen} opacity={0.6} />
    </G>
  ),
  fish: (fill, sheen) => (
    <G>
      <Path d={FISH} fill={fill('fish')} />
      <Path
        d="M22 20c6 6 6 18 0 24M30 18c5 7 5 21 0 28"
        stroke="#fff"
        strokeOpacity={0.55}
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
      />
      <Circle cx="14" cy="30" r="2.4" fill="#3b1a12" />
      <Path d={FISH} fill={sheen} opacity={0.7} />
    </G>
  ),
  apple: (fill, sheen) => (
    <G>
      <Path d={APPLE} fill={fill('apple')} />
      <Path d="M32 18c0-6 3-9 8-10" stroke="#5a3418" strokeWidth={3} fill="none" strokeLinecap="round" />
      <Path d="M34 12c4-6 10-6 12-4-2 4-6 6-12 4z" fill="#5fae3a" />
      <Path d={APPLE} fill={sheen} opacity={0.8} />
    </G>
  ),
  carbs: (fill, sheen) => (
    <G>
      <Path d={BREAD} fill={fill('bread')} />
      <Path
        d="M24 34c3-4 7-4 10 0M32 44c3-4 7-4 10 0"
        stroke="#fff"
        strokeOpacity={0.5}
        strokeWidth={2.5}
        fill="none"
        strokeLinecap="round"
      />
      <Path d={BREAD} fill={sheen} opacity={0.7} />
    </G>
  ),
  protein: (fill, sheen) => (
    <G>
      <Path d={DRUM} fill={fill('drum')} />
      <Path d="M26 42l-6 6-4-2-4 4c-2 2-2 4 0 6s4 2 6 0l4-4-2-4 6-6z" fill="#f4e8d6" />
      <Circle cx="14" cy="52" r="3" fill="#f4e8d6" />
      <Path d={DRUM} fill={sheen} opacity={0.8} />
    </G>
  ),
  fat: (fill, sheen) => (
    <G>
      <Path d={DROP} fill={fill('drop')} />
      <Path d={DROP} fill={sheen} opacity={0.9} />
      <Ellipse cx="24" cy="40" rx="3" ry="6" fill="#fff" opacity={0.45} rotation={-10} originX={24} originY={40} />
    </G>
  ),
  steps: (fill, sheen) => (
    <G>
      <Path d={SHOE} fill={fill('shoe')} />
      <Path d="M8 44h50v4c0 2-2 4-4 4H8z" fill="#1c3f7a" />
      <Path
        d="M26 30l6-4M32 36l6-4M38 40l6-4"
        stroke="#fff"
        strokeOpacity={0.7}
        strokeWidth={2.5}
        strokeLinecap="round"
      />
      <Path d={SHOE} fill={sheen} opacity={0.7} />
    </G>
  ),
  streak: (fill) => (
    <G>
      <Path d={FLAME} fill={fill('flame')} />
      <Path d="M32 34c2 4 8 8 6 14-1 5-4 8-6 8s-6-3-6-8c0-5 4-8 6-14z" fill="#fff6c8" opacity={0.9} />
    </G>
  ),
  weight: (fill, sheen) => (
    <G>
      <Rect x="8" y="10" width="48" height="44" rx="10" fill={fill('scale')} />
      <Path d="M18 30a14 14 0 0 1 28 0" stroke="#fff" strokeWidth={4} fill="none" strokeLinecap="round" opacity={0.9} />
      <Path d="M32 30l6-8" stroke="#0d5c4a" strokeWidth={3} strokeLinecap="round" />
      <Rect x="8" y="10" width="48" height="44" rx="10" fill={sheen} opacity={0.8} />
    </G>
  ),
  bowl: (fill, sheen) => (
    <G>
      <Path d={BOWL} fill={fill('wood')} />
      <Ellipse cx="32" cy="30" rx="26" ry="7" fill="#f4e8d6" />
      <Circle cx="22" cy="28" r="4" fill="#6cbf3a" />
      <Circle cx="34" cy="26" r="4.5" fill="#ff7a5c" />
      <Circle cx="44" cy="29" r="3.5" fill="#ffd36a" />
      <Path d={BOWL} fill={sheen} opacity={0.5} />
    </G>
  ),
  bar: (fill, sheen) => (
    <G>
      <Rect x="8" y="16" width="48" height="32" rx="8" fill={fill('wood')} />
      <Path d="M20 16v32M32 16v32M44 16v32M8 32h48" stroke="#fff" strokeOpacity={0.18} strokeWidth={2} />
      <Rect x="8" y="16" width="48" height="32" rx="8" fill={sheen} opacity={0.5} />
    </G>
  ),
  plate: (fill, sheen) => (
    <G>
      <Circle cx="32" cy="34" r="26" fill={fill('plate')} />
      <Circle cx="32" cy="34" r="18" fill="none" stroke="#e3d6c4" strokeWidth={2} />
      <Ellipse cx="26" cy="32" rx="8" ry="6" fill={fill('avo')} />
      <Ellipse cx="38" cy="38" rx="7" ry="5" fill={fill('fish')} />
      <Circle cx="32" cy="34" r="26" fill={sheen} opacity={0.6} />
    </G>
  ),
};
