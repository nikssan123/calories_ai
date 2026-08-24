import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Logo } from '@/components/Logo';
import { DISPLAY_LEADING, font, useColors } from '@/theme';

/**
 * The mark with the name set under it.
 *
 * For the screens where the app introduces itself and nothing else is already
 * writing "Day So Far" beside it: the sign-in pair, and a tab that is standing
 * in for one it does not have yet. Deliberately *not* the launcher icon — iOS
 * draws the app name under it already, and Android's adaptive mask crops
 * everything outside the middle 66dp of 108, which is exactly where a wordmark
 * would sit. The icon keeps the bare <Logo>.
 *
 * `size` is D, the ring's outer diameter, and every other number is a ratio of
 * it, so the two halves cannot drift apart at any scale. The wordmark's ink
 * comes out flush with the ring's edges at 10/47 D with no tracking, which is
 * not a coincidence worth tuning: "Day So Far" measures 4.7em in this face and
 * the ring is 4.7 wordmark-ems across.
 *
 * Keep in step with `apps/web/components/Logo.tsx` if the web ever grows one.
 */

/** One unit of the mark's 64-unit grid, as a fraction of D. */
const UNIT = 1 / 47;

/**
 * Baloo 2 ExtraBold, read off the face itself rather than eyeballed: sCapHeight
 * from OS/2, the descent from hhea. The same 0.524 is what sets DISPLAY_LEADING.
 */
const CAP = 0.602;
const DESC = 0.524;

/**
 * Leading for the wordmark.
 *
 * DISPLAY_LEADING is the floor before iOS crops, but it was set against the
 * figures — and Baloo's round caps overshoot to 0.625em where a figure stops at
 * 0.602, which leaves the D and the S of this particular word clearing the top
 * of the line box by 0.001em. That is close enough to the edge that rounding
 * decides it. Nothing is paid for the extra: `capOffset` positions the cap line
 * from the leading, so a looser box moves the text up by exactly as much as it
 * grew, and the lockup does not shift.
 */
const LEADING = Math.max(DISPLAY_LEADING, 1.25);

/**
 * Below this the caps fall under 8pt and the three dots start to merge, so the
 * name stops being read and becomes texture. Anything smaller wants the bare
 * mark instead.
 */
export const LOCKUP_MIN = 62;

export function Lockup({
  size = 64,
  style,
}: {
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useColors();

  const fontSize = size * 10 * UNIT;
  const lineHeight = fontSize * LEADING;

  /*
   * iOS puts the baseline at `lineHeight - descent` and the cap line one cap
   * height above that, so the caps start this far down the Text's box. Android
   * pads the box instead, which is what `includeFontPadding: false` switches
   * off — without it the two platforms open the gap by different amounts and
   * the lockup only looks right on one of them.
   */
  const capOffset = lineHeight - fontSize * (DESC + CAP);

  /*
   * The mark is drawn on a 64-unit grid but its ring stops at 53.8, so the box
   * already carries 10.2 units of air under the foot. The spec asks for 9.9 —
   * close that 0.3, then the cap offset on top of it.
   */
  const marginTop = -(0.3 * size * UNIT) - capOffset;

  /*
   * The Logo's box is the full 64 units wide against a ring of 47, so the block
   * is sized to the box and the wordmark centred inside it. That centres the
   * text's *advance*, which sits a quarter of a unit right of its ink centre —
   * a third of a pixel at any size worth using, and not worth a margin to fix.
   */
  const box = size * 64 * UNIT;

  return (
    <View style={[styles.stack, { width: box }, style]}>
      <Logo size={box} />
      <Text
        /*
         * A logo is a graphic, not copy: at a larger accessibility text size the
         * name would outgrow the ring and the lockup would come apart. The
         * screens this sits on say the same thing again in type that does scale.
         */
        allowFontScaling={false}
        style={{
          fontFamily: font.display,
          fontSize,
          lineHeight,
          letterSpacing: 0,
          marginTop,
          color: colors.foreground,
          includeFontPadding: false,
        }}
      >
        Day So Far
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { alignItems: 'center' },
});
