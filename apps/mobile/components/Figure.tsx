import { StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { LOCALE_SCRIPTS } from '@ct/shared';
import { useLocale } from '@/lib/i18n';
import { SERIF_LEADING, useType } from '@/theme';

/**
 * A number in the serif that is allowed to count.
 *
 * The Fraunces cuts the app bundles have proportional figures only — a 1 is
 * half the width of a 0 — so a total counting up in them shivers sideways on
 * every frame, which reads as the number being unsure of itself on the one
 * screen where it is being introduced. `fontVariant: tabular-nums` cannot help:
 * there is no `tnum` table in the file to switch on.
 *
 * So each digit gets a slot as wide as the widest digit, and sits centred in
 * it. The separators keep their natural width, because they do not change
 * while a number counts. It is exactly what tabular figures are, done in
 * layout instead of in the font.
 */
export function Figure({
  value,
  size,
  color,
  style,
  textStyle,
}: {
  /** Already formatted for the locale. */
  value: string;
  size: number;
  color: string;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}) {
  const type = useType();
  const locale = useLocale();
  const latin = LOCALE_SCRIPTS[locale] === 'latin';
  /* The widest digit's advance, read off each font's `hmtx` table. */
  const slot = size * (latin ? 0.665 : 0.595);
  const lineHeight = Math.round(size * (latin ? SERIF_LEADING.fraunces : SERIF_LEADING.literata));

  return (
    <View style={[styles.row, style]} accessible accessibilityLabel={value}>
      {Array.from(value).map((char, i) => {
        const digit = char >= '0' && char <= '9';
        return (
          <Text
            key={i}
            allowFontScaling={false}
            style={[
              type.serifFigure,
              { fontSize: size, lineHeight, color, textAlign: 'center' },
              digit ? { width: slot } : null,
              textStyle,
            ]}
          >
            {char}
          </Text>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center' },
});
