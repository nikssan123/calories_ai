import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import Svg, { Ellipse, Path, Rect } from 'react-native-svg';
import { useColors, useTheme } from '@/theme';
import { Character } from './Character';

/**
 * The window sill at the foot of the journal's sky.
 *
 * The other four scenes (`Scenes.tsx`) are rounded cards in a tab's content.
 * This one is not a card: it is full-bleed and it belongs to the header band,
 * laid out under the status row so that the sky's own foot lands on the plank.
 * That is the whole idea — the sky was always the view out of a window, and
 * this is the ledge it stops at, with the page below it as the room.
 *
 * It shows only while nothing has been eaten today, which is the state that
 * used to be a hole: an unfilled ring on an empty sky with the day's largest
 * number beside it. See `MiniRing` for the other half of that fix.
 *
 * Fixed at `SILL_HEIGHT` points rather than scaled to the width, unlike the
 * scenes: the band's height is arithmetic the journal does in points, and a
 * ledge that grew on a wider phone would push the conversation down for no
 * reason. Only the plank is full-bleed; everything standing on it is placed
 * from an edge.
 */
export const SILL_HEIGHT = 96;

/** Where the top of the plank sits, from the top of the scene. */
const PLANK = 66;

/**
 * How far the two of them sink as they leave, in points.
 *
 * Enough to put the tallest head (Ember's flame, at 8 + 68 × 20/120) under the
 * plank's top edge with a little to spare, so they are covered rather than
 * faded — a fade at this size reads as a bug rather than as ducking.
 */
const DUCK = 58;

/**
 * The share of the exit the duck takes. They are behind the plank well before
 * the plank itself has finished leaving, which is what makes the plant — which
 * does not duck, because it is a plant — the last thing out.
 */
const DUCK_OF_EXIT = 0.62;

function palette(dark: boolean) {
  if (dark) {
    return {
      top: '#352b24',
      lit: 'rgba(255, 255, 255, 0.16)',
      front: '#241d19',
      shade: 'rgba(0, 0, 0, 0.5)',
      pot: '#a5683f',
      potRim: '#b8764a',
      cast: 'rgba(0, 0, 0, 0.45)',
      stem: '#17945f',
      leafA: '#2fae74',
      leafB: '#1b8a58',
    };
  }
  return {
    top: '#f7efe3',
    lit: '#fffdf9',
    front: '#ece0cd',
    shade: 'rgba(49, 38, 30, 0.1)',
    pot: '#d98b5c',
    potRim: '#e89a6a',
    cast: 'rgba(120, 80, 20, 0.14)',
    stem: '#0f9a5a',
    leafA: '#3ddc97',
    leafB: '#12b76a',
  };
}

/**
 * `open` runs 1 → 0 as the reader scrolls back into the conversation. The two
 * figures read it; the plank and the plant do not, because the parent slides
 * the whole scene up and they go with it.
 */
export function SillScene({ open }: { open: SharedValue<number> }) {
  const colors = useColors();
  const { scheme } = useTheme();
  const pal = palette(scheme === 'dark');

  const ducking = useAnimatedStyle(() => {
    const gone = Math.min(1, (1 - open.value) / DUCK_OF_EXIT);
    return { transform: [{ translateY: DUCK * gone }] };
  });

  return (
    <View style={styles.scene} pointerEvents="box-none">
      {/*
        Drawn first and the plank over them, the way `CastPlate` puts the rim
        over the three: what makes this read as ducking rather than as sliding
        away is that the edge cuts them off.
      */}
      <Animated.View collapsable={false} pointerEvents="box-none" style={[styles.cast, ducking]}>
        <View style={styles.ember}>
          {/*
            The kitchen's own morning arrangement, reused: Ember with a mug.
            `hold` is not one of the still poses, so this one keeps its loop —
            and the loop is the steam, which is the only thing moving in here.
          */}
          <Character name="ember" mood="hold" prop="mug" size={68} />
        </View>
        <View style={styles.skye}>
          {/*
            Sitting about does not breathe: a breath at this size is a pixel,
            and the band is on screen for as long as the journal is. Same call
            `Scenes.tsx` makes for its own still figures — the journal already
            has a `Waiting` row and a ledge that animate, and this must not be
            a third loop running behind them. Blinks and fidgets are untouched.
            The hanging legs suppress the ground shadow on their own.
          */}
          <Character name="skye" mood="sit" size={68} delay={400} loop={false} />
        </View>
      </Animated.View>

      <Svg
        width="100%"
        height={SILL_HEIGHT}
        viewBox={`0 0 390 ${SILL_HEIGHT}`}
        preserveAspectRatio="none"
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      >
        <Rect x={-2} y={PLANK} width={394} height={9} fill={pal.top} />
        <Rect x={-2} y={PLANK} width={394} height={2} fill={pal.lit} />
        <Rect x={-2} y={PLANK + 9} width={394} height={SILL_HEIGHT - PLANK - 9} fill={pal.front} />
        <Rect x={-2} y={PLANK + 9} width={394} height={2.5} fill={pal.shade} />
      </Svg>

      {/*
        The plant, in its own box so it keeps its proportions on a wide phone —
        the plank above is stretched to the width and this must not be.
      */}
      <Svg width={64} height={SILL_HEIGHT} viewBox={`0 0 64 ${SILL_HEIGHT}`} style={styles.plant} pointerEvents="none">
        <Ellipse cx={30} cy={72} rx={13} ry={2.6} fill={pal.cast} />
        <Path d="M30 50C30 44 30 40 30 34" stroke={pal.stem} strokeWidth={2} strokeLinecap="round" fill="none" />
        <Path d="M30 52C23 48 20 39 25 34C31 37 33 45 30 52Z" fill={pal.leafA} />
        <Path d="M30 52C37 47 40 38 35 33C29 37 27 45 30 52Z" fill={pal.leafB} />
        <Path d="M20 56L40 56L37.5 70L22.5 70Z" fill={pal.pot} />
        <Rect x={17} y={52} width={26} height={5.5} rx={2} fill={pal.potRim} />
      </Svg>

      {/*
        Into transparent rather than into the ground colour, the same bargain
        `Sky` makes at its own foot: the plank's face melts into whatever is
        below it instead of ending on a seam.
      */}
      <View
        pointerEvents="none"
        style={[
          styles.foot,
          {
            experimental_backgroundImage: `linear-gradient(180deg, ${colors.background}00 0%, ${colors.background} 100%)`,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  scene: { height: SILL_HEIGHT, overflow: 'hidden' },
  cast: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  /* Placed from the right, so the pair sits opposite the ring on the row above. */
  ember: { position: 'absolute', right: 108, top: 8 },
  skye: { position: 'absolute', right: 30, top: 10 },
  plant: { position: 'absolute', left: 20, top: 0 },
  foot: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 22 },
});
