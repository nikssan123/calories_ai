import { Pressable, StyleSheet, Text, View } from 'react-native';
import { InsetGroup, InsetRow } from '@/components/InsetGroup';
import { haptics } from '@/lib/haptics';
import { useT } from '@/lib/i18n';
import { type as t, useColors } from '@/theme';
import type { StepPermission } from '@/lib/steps';

/**
 * What the phone counted, said once and qualified once.
 *
 * The footer is the whole reason this is an `InsetGroup` rather than a line
 * under the ring. Everybody arrives at a step count in a calorie app expecting
 * it to buy them something to eat — that is what every other tracker has
 * trained them to expect — and the honest answer is a sentence, not a number.
 * Exercise already earns a footer for a softer version of the same problem
 * ("shown separately from your target"), so a reader meets the idea in a shape
 * they have seen before.
 *
 * Placed below the ring and the macros rather than beside them, and that is a
 * deliberate demotion. A step count is context: it belongs near the day, not in
 * the arithmetic of it, and putting it in the summary block would make it look
 * like one of the numbers the target is built from.
 */
export function StepsCard({
  steps,
  permission,
  onEnable,
}: {
  steps: number | null;
  permission: StepPermission | null;
  onEnable: () => void;
}) {
  const colors = useColors();
  const tr = useT();

  /*
   * Nothing at all on a platform or a handset that cannot answer, and nothing
   * once somebody has said no. A card that says "steps unavailable" is a row of
   * apology occupying the same space as a fact, and a card that keeps offering
   * after a refusal is the app asking twice. The system dialog cannot be shown
   * again anyway — iOS answers a second `requestPermissions` with the first
   * answer — so an offer here would be a button that does nothing.
   */
  if (permission === null || permission === 'unsupported' || permission === 'denied') return null;

  if (permission !== 'granted') {
    return (
      <InsetGroup title={tr('today.stepsTitle')}>
        <Pressable
          onPress={() => {
            haptics.press();
            onEnable();
          }}
          accessibilityRole="button"
          accessibilityLabel={tr('today.stepsEnable')}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        >
          <InsetRow first>
            <View style={styles.copy}>
              <Text style={[t.bodySemibold, { color: colors.foreground }]}>
                {tr('today.stepsEnable')}
              </Text>
              <Text style={[t.footnote, { color: colors.mutedForeground }]}>
                {tr('today.stepsEnableHint')}
              </Text>
            </View>
          </InsetRow>
        </Pressable>
      </InsetGroup>
    );
  }

  /*
   * Granted but nothing counted yet. Silent rather than "0 steps", for the
   * reason written on `DaySummary.steps`: nobody has ever walked exactly none,
   * so a nought is a wrong fact about the reader rather than a missing one.
   * This is the ordinary state at four in the morning and after a fresh grant,
   * and both resolve themselves within a walk.
   */
  if (steps === null || steps === 0) return null;

  return (
    <InsetGroup title={tr('today.stepsTitle')} footer={tr('today.stepsFooter')}>
      <InsetRow first>
        <Text style={[t.title2, t.tnum, { color: colors.foreground }]}>
          {tr('today.steps')(steps)}
        </Text>
      </InsetRow>
    </InsetGroup>
  );
}

const styles = StyleSheet.create({
  copy: { flex: 1, gap: 2 },
});
