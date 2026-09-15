import { useId, type ReactNode } from 'react';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Polygon, RadialGradient, Rect, Stop } from 'react-native-svg';
import type { AchievementGroupKey, AchievementKey } from '@ct/shared';
import { ACHIEVEMENT_GROUPS } from '@ct/shared';

/**
 * A badge, struck as a medal.
 *
 * These were emoji until the cast arrived (CAST.md). Emoji were the last chrome
 * in the app drawn by the phone rather than by us, and the wall showed it most:
 * fourteen pictures from two different artists depending on the platform, none
 * of them in the palette.
 *
 * The colour says which group a badge belongs to, so a strip of fourteen reads
 * as four runs before any single one is recognised: streaks amber, training
 * pink, firsts teal, totals blue. The glyph says what the badge was for. An
 * unearned badge is the same medal, faint. Its silhouette is the hint, which is
 * the reason the wall never used padlocks.
 *
 * Glyphs are plain shapes on a 100-unit grid, cream on the disc, with a darker
 * copy offset underneath so they read as stamped rather than pasted. No text:
 * "100" is drawn, not set, so it cannot fall back to a system face.
 */
type Tier = readonly [light: string, mid: string, dark: string, deep: string];

const TIERS: Record<AchievementGroupKey, Tier> = {
  streaks: ['#ffe8ad', '#ffb43d', '#e07a0c', '#b85f06'],
  training: ['#ffd3e5', '#ff5fa2', '#c93f80', '#9a2c61'],
  firsts: ['#c8f7ea', '#23d3b0', '#0f9478', '#0a6e59'],
  totals: ['#cfe7ff', '#3b9eff', '#1f6fd1', '#1a55a8'],
};

const GROUP_OF = new Map<AchievementKey, AchievementGroupKey>(
  ACHIEVEMENT_GROUPS.flatMap((group) => group.keys.map((key) => [key, group.key] as const)),
);

const CREAM = '#fffaf0';

function starPoints(cx: number, cy: number, outer: number, inner: number): string {
  return Array.from({ length: 10 }, (_, i) => {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 === 0 ? outer : inner;
    return `${(cx + r * Math.cos(angle)).toFixed(1)},${(cy + r * Math.sin(angle)).toFixed(1)}`;
  }).join(' ');
}

/** Bars and gaps, left to right, for the first scan. */
const BARS = [3, 1.5, 2, 1.5, 4, 1.5, 2.5, 3, 1.5, 2, 1.5, 3];

/**
 * Each glyph drawn twice by `Medal`: once in `ink` as the stamp's shadow and
 * once in cream. `tier` is for the few details that sit in the disc's colour.
 */
function glyph(key: AchievementKey, ink: string, tier: Tier, shadow: boolean): ReactNode {
  const accent = shadow ? ink : tier[2];
  switch (key) {
    case 'streak_7':
      return (
        <G>
          <Path d="M50 27C57 36 65 42 65 55C65 65 58 72 50 72C42 72 35 65 35 55C35 47 40 43 42 35C45 41 47 43 49 43C48 37 48 32 50 27Z" fill={ink} />
          {!shadow && <Path d="M50 51C54 56 57 58 57 63C57 67 54 70 50 70C46 70 43 67 43 63C43 58 47 56 50 51Z" fill={tier[1]} opacity={0.6} />}
        </G>
      );
    case 'streak_30':
      return <Polygon points={starPoints(50, 52, 21, 9)} fill={ink} strokeLinejoin="round" stroke={ink} strokeWidth={2} />;
    case 'streak_100':
      return (
        <G stroke={ink} strokeWidth={4.2} strokeLinecap="round" fill="none">
          <Path d="M31 45L36 41V63" />
          <Ellipse cx={50} cy={52} rx={5.5} ry={10} />
          <Ellipse cx={66} cy={52} rx={5.5} ry={10} />
        </G>
      );
    case 'streak_365':
      return (
        <G fill={ink}>
          <Path d="M31 61L33 38L42 48L50 32L58 48L67 38L69 61Z" strokeLinejoin="round" stroke={ink} strokeWidth={1.5} />
          <Rect x={31} y={63} width={38} height={6} rx={2} />
        </G>
      );
    case 'exercise_weeks_4':
      return (
        <G fill={ink} rotation={-24} origin="50, 51">
          <Rect x={29} y={44} width={6} height={14} rx={2} />
          <Rect x={35} y={40} width={7} height={22} rx={2.5} />
          <Rect x={42} y={48.5} width={16} height={5} rx={1.5} />
          <Rect x={58} y={40} width={7} height={22} rx={2.5} />
          <Rect x={65} y={44} width={6} height={14} rx={2} />
        </G>
      );
    case 'exercise_weeks_12':
      return (
        <G fill={ink}>
          <Path d="M38 33H62V42C62 51 57 57 50 57C43 57 38 51 38 42Z" />
          <Path d="M38 37H32V40C32 45 35 48 39 48M62 37H68V40C68 45 65 48 61 48" stroke={ink} strokeWidth={3} fill="none" strokeLinecap="round" />
          <Rect x={47} y={56} width={6} height={8} />
          <Rect x={39} y={63} width={22} height={6} rx={2} />
        </G>
      );
    case 'exercise_weeks_52':
      return (
        <G fill={ink}>
          <Path d="M38 28H47L53 44H44Z" />
          <Path d="M62 28H53L47 44H56Z" />
          <Circle cx={50} cy={57} r={14} />
          {!shadow && <Polygon points={starPoints(50, 57.5, 7.5, 3.3)} fill={accent} />}
        </G>
      );
    case 'first_photo':
      return (
        <G>
          <Path d="M36 42H42L45 37H55L58 42H64A4 4 0 0 1 68 46V64A4 4 0 0 1 64 68H36A4 4 0 0 1 32 64V46A4 4 0 0 1 36 42Z" fill={ink} />
          {!shadow && <Circle cx={50} cy={55} r={8.5} fill={accent} />}
          {!shadow && <Circle cx={50} cy={55} r={4} fill={CREAM} />}
        </G>
      );
    case 'first_barcode': {
      let x = 34;
      const bars: ReactNode[] = [];
      BARS.forEach((width, i) => {
        if (i % 2 === 0) bars.push(<Rect key={i} x={x} y={37} width={width} height={26} rx={0.6} />);
        x += width + 1.2;
      });
      return <G fill={ink}>{bars}</G>;
    }
    case 'first_workout':
      // A stopwatch: the first session timed. Not a kettlebell, whose handle
      // over a body reads as a padlock at 24pt, and the wall has no padlocks.
      return (
        <G>
          <Rect x={46} y={30} width={8} height={6} rx={1.5} fill={ink} />
          <Rect x={63} y={37} width={6} height={5} rx={1.5} fill={ink} rotation={40} origin="66, 39.5" />
          <Circle cx={50} cy={55} r={16} fill={ink} />
          {!shadow && <Path d="M50 55V45M50 55L56 60" stroke={accent} strokeWidth={3} strokeLinecap="round" />}
          {!shadow && <Circle cx={50} cy={55} r={2.2} fill={accent} />}
        </G>
      );
    case 'first_weigh_in':
      return (
        <G>
          <Rect x={32} y={33} width={36} height={37} rx={10} fill={ink} />
          {!shadow && <Path d="M40 49A11 11 0 0 1 60 49" fill="none" stroke={accent} strokeWidth={3} strokeLinecap="round" />}
          {!shadow && <Path d="M50 51L55 43" stroke={tier[3]} strokeWidth={2.4} strokeLinecap="round" />}
        </G>
      );
    case 'days_100':
    case 'days_365':
      return (
        <G>
          <Rect x={33} y={37} width={34} height={31} rx={5} fill={ink} />
          <Rect x={40} y={32} width={4} height={9} rx={2} fill={ink} />
          <Rect x={56} y={32} width={4} height={9} rx={2} fill={ink} />
          {!shadow &&
            (key === 'days_100' ? (
              <G fill={accent}>
                {[42, 50, 58].map((cx) => (
                  <G key={cx}>
                    <Circle cx={cx} cy={52} r={2.2} />
                    <Circle cx={cx} cy={60} r={2.2} />
                  </G>
                ))}
              </G>
            ) : (
              <Polygon points={starPoints(50, 55, 9, 4)} fill={accent} />
            ))}
          {!shadow && <Rect x={33} y={44} width={34} height={2} fill={accent} opacity={0.35} />}
        </G>
      );
    case 'workouts_100':
      return (
        <Path d="M40 31H45C46 37 54 37 55 31H60V39C60 43 64 45 66 47V69H34V47C36 45 40 43 40 39Z" fill={ink} strokeLinejoin="round" />
      );
  }
}

export function Medal({ badgeKey, got, size }: { badgeKey: AchievementKey; got: boolean; size: number }) {
  const id = useId().replace(/:/g, '');
  const tier = TIERS[GROUP_OF.get(badgeKey) ?? 'firsts'];

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" opacity={got ? 1 : 0.34}>
      <Defs>
        <LinearGradient id={`${id}-r`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={tier[0]} />
          <Stop offset="0.5" stopColor={tier[1]} />
          <Stop offset="1" stopColor={tier[3]} />
        </LinearGradient>
        <RadialGradient id={`${id}-d`} cx="0.38" cy="0.3" r="0.85">
          <Stop offset="0" stopColor={tier[0]} />
          <Stop offset="0.55" stopColor={tier[1]} />
          <Stop offset="1" stopColor={tier[2]} />
        </RadialGradient>
      </Defs>
      <Circle cx={50} cy={50} r={47} fill={`url(#${id}-r)`} />
      <Circle cx={50} cy={50} r={40} fill={`url(#${id}-d)`} />
      <Circle cx={50} cy={50} r={40} fill="none" stroke="#ffffff" strokeOpacity={0.35} strokeWidth={1.4} />
      <G opacity={0.35} y={1.8}>
        {glyph(badgeKey, tier[3], tier, true)}
      </G>
      {glyph(badgeKey, CREAM, tier, false)}
      <Path d="M20 38A34 34 0 0 1 56 15" stroke="#ffffff" strokeOpacity={0.6} strokeWidth={3} fill="none" strokeLinecap="round" />
    </Svg>
  );
}
