import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { PressableChunk } from '@/components/Chunk';
import { Sheet } from '@/components/Field';
import { GlowButton } from '@/components/GlowButton';
import type { Consent } from '@/lib/analytics';
import { useT } from '@/lib/i18n';
import { type as t, useColors } from '@/theme';

/**
 * The one consent question the app asks, on the way out of the plan.
 *
 * `lib/analytics.ts` has what it turns on. What belongs here is where and how:
 *
 * **After the plan, not before it.** One install in seven finishes the walk,
 * and a question put anywhere earlier would be charged against that. By the
 * time this sheet rises the reader has a target and has pressed the button to
 * start, so it is a small favour asked of somebody already in, not a gate.
 *
 * **Two answers of the same size.** EU consent has to be as easy to refuse as
 * to give, so "No thanks" is a full pill beside the glowing one rather than a
 * grey word under it. It is quieter — glass, not green — which is the one
 * liberty taken, and it is the same height, the same width and one tap.
 *
 * **A question and two lines, no paragraph.** The first draft argued the case
 * in a paragraph nobody reads at the moment they are trying to start. What a
 * reader deciding whether to trust a calorie tracker with an ad network wants
 * is one thing — whether their meals go with it — and the second line says so.
 *
 * Dismissing it — the scrim, the grabber — is a no. The walk goes on either
 * way, and nobody is asked twice.
 */
export function MeasureAsk({
  open,
  onAnswer,
  onClosed,
}: {
  open: boolean;
  onAnswer: (consent: Consent) => void;
  /** Once the sheet has finished leaving — where the walk goes on from. */
  onClosed: () => void;
}) {
  const colors = useColors();
  const tr = useT();

  return (
    <Sheet open={open} title={tr('measure.title')} onClose={() => onAnswer('denied')} onClosed={onClosed}>
      <View style={styles.body}>
        <View
          style={[
            styles.ledger,
            { backgroundColor: colors.card, borderColor: colors.hairline },
          ]}
        >
          <Line
            mark="check"
            tint={colors.caloriesText}
            wash={colors.caloriesWash}
            label={tr('measure.shared')}
            color={colors.foreground}
          />
          <View style={[styles.rule, { backgroundColor: colors.hairline }]} />
          <Line
            mark="lock"
            tint={colors.mutedForeground}
            wash={colors.hairline}
            label={tr('measure.private')}
            color={colors.foreground}
          />
        </View>

        <View style={styles.actions}>
          <GlowButton label={tr('measure.allow')} onPress={() => onAnswer('granted')} />
          <PressableChunk
            depth={3}
            radius={999}
            onPress={() => onAnswer('denied')}
            accessibilityRole="button"
            contentStyle={[
              styles.decline,
              {
                backgroundColor: colors.glassStrong,
                borderColor: colors.glassEdge,
                boxShadow: `${colors.shadow}, inset 0px 1px 0px ${colors.glassEdge}`,
              },
            ]}
          >
            <Text style={[t.bodyBold, { color: colors.foreground }]}>{tr('measure.decline')}</Text>
          </PressableChunk>
        </View>

        <Text style={[t.footnote, styles.fine, { color: colors.mutedForeground }]}>
          {tr('measure.later')}
        </Text>
      </View>
    </Sheet>
  );
}

function Line({
  mark,
  tint,
  wash,
  label,
  color,
}: {
  mark: 'check' | 'lock';
  tint: string;
  wash: string;
  label: string;
  color: string;
}) {
  const stroke = {
    stroke: tint,
    strokeWidth: 2.4,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };
  return (
    <View style={styles.line}>
      <View style={[styles.badge, { backgroundColor: wash }]}>
        <Svg width={16} height={16} viewBox="0 0 24 24">
          {mark === 'check' ? (
            <Path d="M20 6 9 17l-5-5" {...stroke} />
          ) : (
            // Lucide's `lock`.
            <Path d="M5 11h14v10H5zM7 11V7a5 5 0 0 1 10 0v4" {...stroke} />
          )}
        </Svg>
      </View>
      <Text style={[t.bodySemibold, styles.lineLabel, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 20, paddingTop: 2, gap: 18 },
  ledger: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 4 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  badge: { width: 30, height: 30, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  lineLabel: { flex: 1 },
  rule: { height: 1, marginLeft: 42 },
  actions: { gap: 10 },
  // `GlowButton`'s own face, so the two answers are the same size.
  decline: {
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    borderWidth: 1,
  },
  fine: { textAlign: 'center' },
});
