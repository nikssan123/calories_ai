import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LOCALES, LOCALE_NAMES, type Locale } from '@ct/shared';
import { typeFor, useColors } from '@/theme';
import { Picker } from '@/components/Field';
import { haptics } from '@/lib/haptics';

/**
 * The language control, in the one shape it takes on both screens that have it.
 *
 * Four things about it are deliberate:
 *
 * **Every option is written in its own language.** `LOCALE_NAMES` says
 * "Български", not "Bulgarian", and "Deutsch", not "German" — a picker that
 * names a language in a language you cannot read is a picker for somebody who
 * did not need it. This is the only text in the app that never goes through
 * `useT`.
 *
 * **Each label is drawn in its own script's display face.** `typeFor(locale)`
 * per option rather than `useType()` once for the control: the whole point of
 * this screen is choosing between alphabets, and drawing "Български" in Baloo —
 * which has no Cyrillic — would show the fallback face in the one place
 * somebody is looking hard at the letterforms.
 *
 * **It changes shape with the number of languages.** Two or three fit on one
 * line and cost one tap, which is worth keeping while it is true; five do not.
 * Past `INLINE_LIMIT` it becomes the app's ordinary `<Picker>` sheet — the same
 * control Activity and Sex already use, so it is a list somebody has already
 * learned rather than a new thing to explain.
 *
 * **The threshold lives here**, not at the two call sites, so the sign-in
 * screen and Settings can never disagree about it. Its web twin holds the same
 * number for the same reason.
 */
const INLINE_LIMIT = 4;

export function LanguagePicker({
  value,
  onChange,
}: {
  value: Locale;
  onChange: (locale: Locale) => void;
}) {
  const colors = useColors();

  if (LOCALES.length > INLINE_LIMIT) {
    return (
      <Picker
        label="Language"
        value={value}
        options={LOCALES}
        onChange={(next) => {
          haptics.selected();
          onChange(next);
        }}
        /*
         * The sheet draws its options in the *body* face, which has covered
         * Cyrillic since the first build — so unlike the inline control below,
         * this path needs no per-option face and every name renders correctly
         * as it is.
         */
        render={(locale) => LOCALE_NAMES[locale]}
      />
    );
  }

  return (
    <View style={[styles.segment, { backgroundColor: colors.muted }]}>
      {LOCALES.map((locale) => {
        const active = value === locale;
        // The face that can draw this option's own name.
        const scale = typeFor(locale);
        return (
          <Pressable
            key={locale}
            onPress={() => {
              haptics.selected();
              onChange(locale);
            }}
            accessibilityRole="button"
            accessibilityLabel={LOCALE_NAMES[locale]}
            accessibilityState={{ selected: active }}
            style={[styles.item, active ? { backgroundColor: colors.primary } : null]}
          >
            <Text
              style={[
                scale.footnoteBold,
                { color: active ? colors.primaryForeground : colors.mutedForeground },
              ]}
            >
              {LOCALE_NAMES[locale]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  segment: { flexDirection: 'row', borderRadius: 999, padding: 2, gap: 2 },
  item: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999 },
});
