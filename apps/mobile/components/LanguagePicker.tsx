import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path, Polyline } from 'react-native-svg';
import {
  LOCALES_BY_NAME,
  LOCALE_NAMES,
  LOCALE_NAMES_IN,
  suggestedLocales,
  type Locale,
} from '@ct/shared';
import { fieldStyle, Sheet } from '@/components/Field';
import { haptics } from '@/lib/haptics';
import { useLocale, useT } from '@/lib/i18n';
import { deviceLocale } from '@/messages';
import { type as t, useColors } from '@/theme';

/**
 * The language control, in the one shape it takes on every screen that has it.
 *
 * Five things about it are deliberate:
 *
 * **Every option leads with its own name.** `LOCALE_NAMES` says "Български",
 * not "Bulgarian" — a picker that names a language in a language you cannot
 * read is a picker for somebody who did not need it.
 *
 * **Under it, the name in the language the screen is in** — "Ελληνικά", then
 * "Greek" or "Гръцки" — for somebody reading the current screen and scanning
 * for a language whose own alphabet they do not read. Left off the screen's own
 * language, where it would say the same word twice.
 *
 * **A globe on the trigger.** The one part of the control that reads the same
 * whatever language the screen is in, and on the sign-in screen the person who
 * cannot read the screen is exactly who it is for.
 *
 * **Suggested first, then the rest by their own names.** The language in use,
 * then the device's — the likeliest way back for somebody who switched to try
 * one — then everything else in `LOCALES_BY_NAME` order.
 *
 * **Its own sheet rather than `<Picker>`.** `<Picker>` draws one line per
 * option, and this needs two and a pair of headings. It is the same `<Sheet>`
 * underneath — the grabber, the scrim, the rows with a rule between them — so it
 * is still a list somebody has already learned.
 *
 * Every name is drawn in the body face, which has covered Cyrillic since the
 * first build. Greek falls back to the platform's face, here as everywhere else
 * in the app; see `LOCALE_SCRIPTS`.
 */
export function LanguagePicker({
  value,
  onChange,
}: {
  value: Locale;
  onChange: (locale: Locale) => void;
}) {
  const colors = useColors();
  const tr = useT();
  const screen = useLocale();
  const [open, setOpen] = useState(false);

  const suggested = suggestedLocales(value, [deviceLocale()]);
  const rest = LOCALES_BY_NAME.filter((locale) => !suggested.includes(locale));

  const option = (locale: Locale) => {
    const selected = locale === value;
    const translated = locale === screen ? undefined : LOCALE_NAMES_IN[screen][locale];
    return (
      <Pressable
        key={locale}
        onPress={() => {
          haptics.selected();
          setOpen(false);
          if (!selected) onChange(locale);
        }}
        accessibilityRole="button"
        accessibilityLabel={LOCALE_NAMES[locale]}
        accessibilityHint={translated}
        accessibilityState={{ selected }}
        style={({ pressed }) => [
          styles.option,
          { borderTopColor: colors.border, opacity: pressed ? 0.6 : 1 },
        ]}
      >
        <View style={styles.names}>
          <Text style={[t.bodySemibold, { color: colors.foreground }]}>{LOCALE_NAMES[locale]}</Text>
          {translated && (
            <Text style={[t.footnote, { color: colors.mutedForeground }]}>{translated}</Text>
          )}
        </View>
        {selected && (
          <Svg width={18} height={18} viewBox="0 0 24 24">
            <Path
              d="M20 6 9 17l-5-5"
              stroke={colors.caloriesText}
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </Svg>
        )}
      </Pressable>
    );
  };

  /*
   * Sentence case rather than the sheet title's eyebrow. Three stacked
   * all-caps labels read as one shout, and `textTransform: 'uppercase'` keeps
   * Greek's accents, which Greek capitals drop.
   */
  const heading = (label: string) => (
    <Text
      accessibilityRole="header"
      style={[t.footnoteBold, styles.heading, { color: colors.mutedForeground }]}
    >
      {label}
    </Text>
  );

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={tr('setup.language')}
        accessibilityValue={{ text: LOCALE_NAMES[value] }}
        style={({ pressed }) => [fieldStyle(colors), styles.trigger, { opacity: pressed ? 0.6 : 1 }]}
      >
        <Svg width={16} height={16} viewBox="0 0 24 24">
          <Circle cx={12} cy={12} r={10} stroke={colors.mutedForeground} strokeWidth={2.2} fill="none" />
          <Path
            d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20M2 12h20"
            stroke={colors.mutedForeground}
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </Svg>
        <Text style={[t.bodySemibold, { color: colors.foreground }]}>{LOCALE_NAMES[value]}</Text>
        <Svg width={16} height={16} viewBox="0 0 24 24">
          <Polyline
            points="6 9 12 15 18 9"
            stroke={colors.mutedForeground}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </Svg>
      </Pressable>

      <Sheet open={open} title={tr('setup.language')} onClose={() => setOpen(false)}>
        {heading(tr('setup.languageSuggested'))}
        {suggested.map(option)}
        {rest.length > 0 && (
          <>
            {heading(tr('setup.languageAll'))}
            {rest.map(option)}
          </>
        )}
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heading: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 8 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderTopWidth: 2,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  names: { flex: 1, gap: 2 },
});
