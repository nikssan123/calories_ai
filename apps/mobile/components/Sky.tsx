import { useEffect, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { sceneSkyAt, skyAt, useTheme, type SceneSky, type Sky as SkyColours } from '@/theme';

/** The sky of the hour, as a hook. */
export function useSky(): SkyColours {
  return skyAt(useMinute(), useTheme().scheme);
}

/**
 * The same hour, read for a scene's window rather than for the page behind it:
 * the weather outside, which dark dims rather than replaces (`sceneSkyAt`).
 */
export function useSceneSky(): SceneSky {
  return sceneSkyAt(useMinute(), useTheme().scheme);
}

/**
 * The clock both of those read: once a minute, never per frame.
 *
 * A minute is the resolution anybody could notice a sky change at, and it keeps
 * the whole effect to one state update a minute rather than an animation
 * running for as long as Today is open — which, on the screen people leave open
 * on the kitchen counter, is a long time.
 */
function useMinute(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/**
 * The header's light: three bands of the hour's sky, running down into the
 * page's own ground so there is no edge where the sky stops, and the haze the
 * ring sits in.
 *
 * Not clipped: the haze spills below the sky's own box, which is the point —
 * a light with an edge is a sticker. It is behind everything regardless.
 *
 * Behind everything, and not a container: the greeting, the date strip and the
 * ring are laid out over it in the normal flow, so nothing in the sky is ever
 * drawn on top of a word.
 */
export function Sky({
  sky,
  height,
  hazeTop,
  style,
}: {
  sky: SkyColours;
  height: number;
  /** Where the centre of the ring's light is, from the top of the sky. */
  hazeTop?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const haze = hazeTop ?? height * 0.62;
  return (
    <View pointerEvents="none" style={[styles.sky, { height }, style]}>
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            // Into transparent rather than into the ground colour, so the sky
            // melts into whatever it is laid over — the page's ambient light on
            // Today, a glass card in onboarding — with no seam at its foot.
            experimental_backgroundImage: `linear-gradient(180deg, ${sky.top} 0%, ${sky.mid} 46%, ${sky.low}cc 74%, ${sky.low}00 100%)`,
          },
        ]}
      />
      <View
        style={{
          position: 'absolute',
          left: '50%',
          top: haze - 240,
          width: 480,
          height: 480,
          marginLeft: -240,
          borderRadius: 240,
          experimental_backgroundImage: `radial-gradient(circle, ${sky.haze} 0%, ${sky.haze.replace(/[\d.]+\)$/, '0)')} 62%)`,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  sky: { position: 'absolute', top: 0, left: 0, right: 0 },
});
