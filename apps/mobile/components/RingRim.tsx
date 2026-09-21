import { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { useTheme } from '@/theme';

/**
 * The lit edge of a ring.
 *
 * `Chunk`'s `inset 0px 1px 0px` — the one-pixel lit line along the top of every
 * surface in the app since the glow-up — translated to a circle. Two hairlines:
 * the outer edge catches light at twelve and falls into shade at six, and the
 * inner edge does the reverse, weaker, the way the underside of something round
 * picks up a little bounce. The band stops being a stroke drawn on the screen
 * and becomes a torus lit from above.
 *
 * This is what replaced the ledge on the rings. A ledge is a solid slab offset
 * downwards, and in dark `chunk` is rgba(0, 0, 0, 0.88) — against any ground the
 * app actually paints, a slab that dark is a hole punched through rather than a
 * shadow cast. Elevation after dark is light (see `shadow` in colors.ts), and
 * this is the ring's share of it.
 *
 * The two gradients are vertical in user space and the ring does not rotate, so
 * the light stays where light is regardless of how much of the arc is drawn —
 * which is the whole reason this reads as a solid and the ledge did not.
 */
export function RingRim({
  id,
  cx,
  cy,
  r,
  strokeWidth,
}: {
  /** Unique within the enclosing `<Svg>`; two gradients are hung off it. */
  id: string;
  cx: number;
  cy: number;
  /** The track's own radius — the rim is drawn at its two edges. */
  r: number;
  strokeWidth: number;
}) {
  const { scheme, colors } = useTheme();
  /*
   * On dark the light has the ring's own colour in it.
   *
   * A white highlight on a dark band is the fastest way to grey it: the band
   * has little chroma to spare, and white spends what there is. The logo's ramp
   * is the same mint the arc ends on, so the edge still reads as lit and the
   * thing it is lighting stays green. On light the ground is cream and the
   * highlight is plain white, which is what light on cream looks like.
   */
  const glint = scheme === 'dark' ? colors.logoRamp : '#ffffff';
  const lit = scheme === 'dark' ? 0.3 : 0.85;
  const shade = scheme === 'dark' ? 0.3 : 0.12;
  /*
   * A proportion of the band, not a fixed pixel: 1.5 on the big ring is the
   * hairline it should be, and on the journal's 5.5pt stroke it would be a
   * quarter of the ring.
   */
  const hair = Math.max(0.8, Math.min(1.5, strokeWidth * 0.09));

  return (
    <>
      <Defs>
        <LinearGradient id={`${id}-outer`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={glint} stopOpacity={lit} />
          <Stop offset="0.45" stopColor={glint} stopOpacity={0} />
          <Stop offset="0.6" stopColor="#000000" stopOpacity={0} />
          <Stop offset="1" stopColor="#000000" stopOpacity={shade} />
        </LinearGradient>
        <LinearGradient id={`${id}-inner`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#000000" stopOpacity={shade * 0.6} />
          <Stop offset="0.5" stopColor="#000000" stopOpacity={0} />
          <Stop offset="0.62" stopColor={glint} stopOpacity={0} />
          <Stop offset="1" stopColor={glint} stopOpacity={lit * 0.55} />
        </LinearGradient>
      </Defs>
      <Circle
        cx={cx}
        cy={cy}
        r={r + strokeWidth / 2 - hair / 2}
        fill="none"
        strokeWidth={hair}
        stroke={`url(#${id}-outer)`}
      />
      <Circle
        cx={cx}
        cy={cy}
        r={r - strokeWidth / 2 + hair / 2}
        fill="none"
        strokeWidth={hair}
        stroke={`url(#${id}-inner)`}
      />
    </>
  );
}
