import { useId } from 'react';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { useColors } from '@/theme';

/**
 * The app mark: the day as a ring, and a speech bubble.
 *
 * A faint track carries the whole day. The solid arc is the part of it that has
 * been logged and it stops where you have got to — the day so far — ending in a
 * bubble's tail, because what moves the arc is always something you said. The
 * three dots read at once as a typing indicator and as the macros: protein,
 * carbs, fat.
 *
 * Same geometry as `apps/web/components/Logo.tsx`. The web reaches for the CSS
 * variables through `style` because presentation attributes do not resolve
 * `var()`; here the colours come off the theme directly, which is the same
 * intent with one less indirection.
 */
export function Logo({ size = 28 }: { size?: number }) {
  const colors = useColors();
  const gradient = `logo-${useId().replace(/:/g, '')}`;

  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <Defs>
        {/* userSpaceOnUse so the ring and the tail share one continuous ramp. */}
        <LinearGradient id={gradient} gradientUnits="userSpaceOnUse" x1="8.5" y1="6.8" x2="55.5" y2="57.2">
          <Stop offset="0" stopColor={colors.calories} />
          <Stop offset="1" stopColor={colors.logoRamp} />
        </LinearGradient>
      </Defs>

      {/* The hours still to come. Tinted with the accent rather than greyed, so
          it belongs to the mark. */}
      <Circle
        cx="32"
        cy="30.3"
        r="20"
        fill="none"
        strokeWidth="7"
        strokeOpacity="0.2"
        stroke={colors.calories}
      />
      {/* The bubble's tail, hung off the lower-left of the ring. */}
      <Path
        d="M27.28 50.76Q19.36 54.29 14.51 56.45A1.9 1.9 0 0 0 11.49 54.15Q12.17 48.71 13.29 39.83Z"
        fill={`url(#${gradient})`}
      />
      {/* 243° of it — a day in progress, running out into the tail. */}
      <Path
        d="M32 10.3A20 20 0 1 1 14.18 39.38"
        fill="none"
        stroke={`url(#${gradient})`}
        strokeWidth="7"
        strokeLinecap="round"
      />
      <Circle cx="24" cy="30.3" r="2.8" fill={colors.protein} />
      <Circle cx="32" cy="30.3" r="2.8" fill={colors.carbs} />
      <Circle cx="40" cy="30.3" r="2.8" fill={colors.fat} />
    </Svg>
  );
}
