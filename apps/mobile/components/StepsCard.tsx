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
  average,
  permission,
  empty,
  onEnable,
  onOpenSettings,
}: {
  steps: number | null;
  /**
   * Their settled week behind this day, or null when there is not enough of one.
   *
   * The same reference the Steps widget draws its bar to, and for the same
   * reason: eight thousand is a lot for one person and a quiet day for another,
   * and the app has never had a step goal to grade anybody against. Shown as a
   * plain "usually 9,400" rather than a percentage — a ratio invites a verdict,
   * and two numbers side by side let the reader draw their own.
   */
  average: number | null;
  permission: StepPermission | null;
  /**
   * True when we are allowed to read and there was nothing to read.
   *
   * Android's own state, with no iOS equivalent — Health Connect is a store
   * rather than a counter, so permission can be granted and the store still be
   * empty because nothing on the phone writes steps into it. Null until a read
   * has happened at all.
   */
  empty: boolean | null;
  onEnable: () => void;
  onOpenSettings: () => void;
}) {
  const colors = useColors();
  const tr = useT();

  /*
   * A count, wherever it came from, before any question about this handset.
   *
   * The two are genuinely separable and it took getting this the wrong way
   * round to see it: the first cut asked about the sensor first and drew
   * nothing without one, which meant an iPad — or an iPhone signed into an
   * account whose steps another device recorded — hid a number the server was
   * holding. Reading a step count and gathering one are different jobs, and
   * only the second needs hardware. The web draws this exact row with no sensor
   * anywhere near it.
   */
  if (steps !== null && steps > 0) {
    return (
      <InsetGroup
        title={tr('today.stepsTitle')}
        trailing={
          average === null ? null : (
            <Text style={[t.footnoteBold, t.tnum, { color: colors.mutedForeground }]}>
              {tr('today.stepsUsual')(average.toLocaleString())}
            </Text>
          )
        }
        footer={tr('today.stepsFooter')}
      >
        <InsetRow first>
          <Text style={[t.title2, t.tnum, { color: colors.foreground }]}>
            {tr('today.steps')(steps)}
          </Text>
        </InsetRow>
      </InsetGroup>
    );
  }

  /*
   * No count, so the only thing left to offer is the sensor — and only when
   * there is one and nobody has answered for it yet. Nothing at all on a
   * handset that cannot count, and nothing once somebody has said no: a card
   * reading "steps unavailable" is a row of apology in the space a fact would
   * take, and one that keeps offering after a refusal is the app asking twice.
   * The system dialog cannot be shown again anyway — iOS answers a second
   * `requestPermissions` with the first answer — so the offer would be a button
   * that does nothing.
   */
  if (permission === 'undetermined') {
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
   * Granted, read, and the store was empty.
   *
   * The one state in this feature the app cannot fix from inside itself, and
   * therefore the one that has to hand the reader somewhere to go. Health
   * Connect holds what other apps write; if Samsung Health or Fitbit is not
   * feeding it, no amount of tapping in here produces a step. So this says what
   * is true and opens the screen where it can be changed, rather than sitting
   * blank and letting somebody conclude the feature is broken.
   *
   * `empty === true` specifically, not falsy: null means nothing has been read
   * yet, which is the ordinary state for the first seconds after a grant and
   * must not flash this row.
   */
  if (empty === true) {
    return (
      <InsetGroup title={tr('today.stepsTitle')}>
        <Pressable
          onPress={() => {
            haptics.press();
            onOpenSettings();
          }}
          accessibilityRole="button"
          accessibilityLabel={tr('today.stepsNoSource')}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        >
          <InsetRow first>
            <View style={styles.copy}>
              <Text style={[t.bodySemibold, { color: colors.foreground }]}>
                {tr('today.stepsNoSource')}
              </Text>
              <Text style={[t.footnote, { color: colors.mutedForeground }]}>
                {tr('today.stepsNoSourceHint')}
              </Text>
            </View>
          </InsetRow>
        </Pressable>
      </InsetGroup>
    );
  }

  /*
   * Granted, but nothing counted yet — silent rather than "0 steps", for the
   * reason on `DaySummary.steps`: nobody has ever walked exactly none, so a
   * nought is a wrong fact about the reader rather than a missing one. This is
   * the ordinary state at four in the morning and for the first minutes after a
   * fresh grant, and both resolve themselves within a walk.
   */
  return null;
}

const styles = StyleSheet.create({
  copy: { flex: 1, gap: 2 },
});
