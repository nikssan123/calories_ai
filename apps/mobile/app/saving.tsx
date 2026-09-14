import { StyleSheet, Text, View } from 'react-native';
import { RingObject } from '@/components/RingObject';
import { Serif } from '@/components/Serif';
import { Stage } from '@/components/onboarding/Stage';
import { useOnboarding } from '@/lib/onboarding';
import { useT } from '@/lib/i18n';
import { column, type as t, useColors, useType } from '@/theme';

/**
 * The second between a new account and its first screen.
 *
 * A plan answered before sign-up is written to the account the moment the
 * account can take it (`lib/onboarding.tsx`), and for that second the gate has
 * nothing true to show: the tabs would draw a target computed before the
 * profile landed, and setup would ask questions that are already answered. So
 * it shows this — the same ring the walk opened on, and a sentence saying what
 * is happening. On a cold launch the splash covers the same wait and this is
 * never seen.
 */
export default function SavingScreen() {
  const colors = useColors();
  const type = useType();
  const tr = useT();
  const { saving } = useOnboarding();

  return (
    <View style={styles.flex}>
      <Stage />
      <View style={[styles.centre, column]} accessibilityLiveRegion="polite">
        <RingObject size={150} />
        <Serif style={[type.hero, styles.centred, { color: colors.foreground }]}>
          {saving ? tr('saving.title') : tr('saving.welcomeBack')}
        </Serif>
        {saving && (
          <Text style={[t.body, styles.centred, { color: colors.mutedForeground }]}>{tr('saving.body')}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 28 },
  centred: { textAlign: 'center' },
});
