import { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  ReduceMotion,
  SlideInLeft,
  SlideInRight,
  SlideOutLeft,
  SlideOutRight,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { PressableChunk } from '@/components/Chunk';
import { column, ease, type as t, useColors, useType } from '@/theme';
import { useT } from '@/lib/i18n';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/**
 * The furniture every question in setup wears, so that no single step has to
 * decide what a step looks like.
 *
 * Setup is the one screen in the app somebody walks through exactly once, and
 * the thing that makes a walk feel short is not the number of questions — it is
 * that nothing under the reader moves between them. The rail, the title block,
 * the footer and the travel are therefore fixed here and unavailable to the
 * steps: a step supplies a question, a control and an answer, and gets the same
 * frame around it as the six either side.
 */

/** How far a step travels on its way in or out. */
const TRAVEL = 260;

/**
 * The bar across the top: how far in they are, and the way back out.
 *
 * A count of steps rather than a percentage, drawn as one continuous track
 * rather than as segments. Segments were the first version and they were worse
 * for the honest reason — six pills across the top of the very first question
 * is the app announcing how much work it is about to ask for, which is exactly
 * the number a person deciding whether to bother is looking for.
 *
 * The fill animates because it is the only thing on the screen that reports
 * progress, and progress that jumps has not been made — it has been claimed.
 */
export function Rail({
  step,
  total,
  onBack,
}: {
  /** 1-based, and allowed to exceed `total` on the closing screens. */
  step: number;
  total: number;
  /** Absent on the first step, where there is nothing behind us. */
  onBack?: () => void;
}) {
  const colors = useColors();
  const tr = useT();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();

  const ratio = Math.min(1, Math.max(0, step / total));
  const fill = useSharedValue(ratio);

  useEffect(() => {
    fill.value = reduced ? ratio : withTiming(ratio, { duration: 420, easing: ease.out });
  }, [ratio, reduced, fill]);

  const grown = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));

  return (
    <View style={[styles.rail, { paddingTop: insets.top + 8 }]}>
      <View style={[column, styles.railRow]}>
        {/*
         * The slot is held whether or not there is a button in it, so the track
         * does not shift left by 36pt between the first step and the second.
         */}
        <View style={styles.backSlot}>
          {onBack && (
            <Pressable
              onPress={onBack}
              accessibilityRole="button"
              accessibilityLabel={tr('ob.back')}
              hitSlop={12}
              style={({ pressed }) => [styles.back, { opacity: pressed ? 0.5 : 1 }]}
            >
              {/* lucide `chevron-left`, on lucide's 24-unit grid. */}
              <Svg width={22} height={22} viewBox="0 0 24 24">
                <Path
                  d="M15 18l-6-6 6-6"
                  stroke={colors.foreground}
                  strokeWidth={2.4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              </Svg>
            </Pressable>
          )}
        </View>

        <View
          style={[styles.track, { backgroundColor: colors.muted }]}
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: total, now: Math.min(step, total) }}
        >
          <Animated.View style={[styles.fill, { backgroundColor: colors.primary }, grown]} />
        </View>

        {/* Balances the back slot, so the track is centred rather than merely
            left-aligned with a gap on one side. */}
        <View style={styles.backSlot} />
      </View>
    </View>
  );
}

/**
 * One question: the words, the control, and the button that leaves.
 *
 * The title block scrolls and the footer does not. That split is the reason
 * this is a component rather than a style — a long activity list on a small
 * phone has to be reachable, and a Continue button that scrolls away with it
 * turns "pick one and go" into "pick one, scroll, then go".
 */
export function Step({
  title,
  body,
  /** Which way the reader is travelling, so the step arrives from that side. */
  direction,
  /** Distinct per step: it is what makes React mount a new one and animate. */
  id,
  footer,
  children,
  contentStyle,
}: {
  title: string;
  body?: string;
  direction: 'forward' | 'back';
  id: string;
  footer?: React.ReactNode;
  children?: React.ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const type = useType();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();

  /*
   * Reduced motion collapses the travel rather than removing the transition.
   * A step that simply replaces the one before it gives no clue whether
   * anything happened, which matters most for somebody who has turned motion
   * off because movement is hard to track — the fade still says "this is a
   * different question" without sliding anything across their field of view.
   */
  const enter = (direction === 'forward' ? SlideInRight : SlideInLeft)
    .duration(TRAVEL)
    .reduceMotion(ReduceMotion.System);
  const leave = (direction === 'forward' ? SlideOutLeft : SlideOutRight)
    .duration(TRAVEL)
    .reduceMotion(ReduceMotion.System);

  return (
    <View style={styles.flex}>
      {/*
        * The stage the steps cross. Each one absolutely fills it rather than
        * taking part in the column, because for the length of the travel there
        * are two of them mounted — the one leaving and the one arriving — and
        * two flex children would spend that quarter-second sharing the height
        * between them, which reads as the whole screen collapsing and springing
        * back rather than as a page turning.
        */}
      <View style={styles.stage}>
        <Animated.View
          key={id}
          entering={reduced ? undefined : enter}
          exiting={reduced ? undefined : leave}
          style={StyleSheet.absoluteFill}
        >
          <ScrollView
            style={styles.flex}
            contentContainerStyle={[styles.scroll, contentStyle]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            showsVerticalScrollIndicator={false}
          >
            <View style={column}>
              <Text style={[type.largeTitle, styles.title, { color: colors.foreground }]}>
                {title}
              </Text>
              {body && (
                <Text style={[t.body, styles.body, { color: colors.mutedForeground }]}>{body}</Text>
              )}
              {children}
            </View>
          </ScrollView>
        </Animated.View>
      </View>

      {footer && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
          <View style={column}>{footer}</View>
        </View>
      )}
    </View>
  );
}

/**
 * The button that ends a step, and the way past one that does not have to be
 * answered.
 *
 * The primary is chunky, green and full width — the same object the rest of the
 * app uses for "yes, do it", rather than a bar-shaped variant that only exists
 * here. It disables rather than hides when the step has no answer yet: a button
 * that vanishes leaves the reader looking for it, and a dead one on screen is a
 * legible instruction to answer the question above it.
 *
 * `skip` is deliberately a different kind of object — plain text, no ledge, no
 * fill — because it is a different kind of decision. A second chunky button
 * beside the first would read as two answers of equal weight, and it is not
 * that: the green one is what the screen is for, and this is the door out for
 * somebody who does not have the answer. Only the steps that can genuinely do
 * without one are given it; see `skipFor` in `app/onboarding.tsx`, which is
 * also where the label says what skipping assumes.
 */
export function Advance({
  label,
  onPress,
  disabled = false,
  hint,
  skip,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /** Said under the button when it is dead, so "why can't I go on" has an answer. */
  hint?: string | null;
  /** Absent on a step whose answer the calorie target cannot do without. */
  skip?: { label: string; onPress: () => void };
}) {
  const colors = useColors();

  return (
    <View style={styles.advance}>
      {hint && (
        <Text style={[t.footnote, styles.hint, { color: colors.mutedForeground }]}>{hint}</Text>
      )}
      <PressableChunk
        color={colors.caloriesDeep}
        radius={999}
        depth={4}
        disabled={disabled}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        style={{ opacity: disabled ? 0.45 : 1 }}
        contentStyle={[styles.advanceFace, { backgroundColor: colors.primary }]}
      >
        <Text style={[t.bodyBold, { color: colors.primaryForeground }]}>{label}</Text>
      </PressableChunk>

      {skip && (
        <Pressable
          onPress={skip.onPress}
          accessibilityRole="button"
          hitSlop={10}
          style={({ pressed }) => [styles.skip, { opacity: pressed ? 0.5 : 1 }]}
        >
          <Text style={[t.footnoteSemibold, { color: colors.mutedForeground }]}>{skip.label}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  stage: { flex: 1 },

  rail: { paddingHorizontal: 20, paddingBottom: 14 },
  railRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  backSlot: { width: 26, height: 26, justifyContent: 'center' },
  back: { width: 26, height: 26, alignItems: 'flex-start', justifyContent: 'center' },
  track: { flex: 1, height: 8, borderRadius: 999, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 999 },

  scroll: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 28 },
  title: { marginBottom: 8 },
  body: { marginBottom: 24 },

  footer: { paddingHorizontal: 20, paddingTop: 8 },
  advance: { gap: 10 },
  skip: { alignSelf: 'center', paddingVertical: 6, paddingHorizontal: 16 },
  hint: { textAlign: 'center' },
  advanceFace: { height: 54, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
});
