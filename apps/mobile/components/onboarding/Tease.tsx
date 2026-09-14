import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeInUp,
  ReduceMotion,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { Glass } from '@/components/Glass';
import { GlowRing } from '@/components/GlowRing';
import { Glossy } from '@/components/icons/Glossy';
import { Serif } from '@/components/Serif';
import { Sky, useSky } from '@/components/Sky';
import { type as t, useColors, useTheme, useType } from '@/theme';
import { useT } from '@/lib/i18n';
import { greetingFor } from '@/lib/greeting';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/**
 * What the app does, shown between the questions about you.
 *
 * Six questions in a row is a form, however well it is set. Moonly breaks its
 * own long walk with a look at the product every few screens, and the thing
 * worth borrowing is the rhythm — ask, show, ask — rather than any of its
 * pictures (GLOW-UP.md, "cinematic onboarding"). Two teases across the six,
 * never one per question, and each shows the thing only this app does.
 *
 * Both are real views, not screenshots: every word in them comes out of the
 * catalogue, so they are in whatever language the questions are in, and they
 * cannot drift from the product the way a picture of it would. Neither blocks
 * anything — the Continue under them is the same one tap the questions have.
 */

/** A phone, tilted towards the reader, with the journal doing its one trick. */
export function JournalTease() {
  const colors = useColors();
  const { scheme } = useTheme();
  const tr = useT();
  const type = useType();
  const reduced = useReducedMotion();
  const sky = useSky();

  const hover = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    hover.value = withRepeat(withTiming(1, { duration: 4000, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(hover);
  }, [reduced, hover]);

  const tilt = useAnimatedStyle(() => ({
    transform: [
      { perspective: 1100 },
      { rotateY: `${-16 + hover.value * 7}deg` },
      { rotateX: `${7 - hover.value * 3}deg` },
      { translateY: -hover.value * 8 },
    ],
  }));

  const arrive = (index: number) =>
    reduced ? undefined : FadeInUp.delay(350 + index * 650).duration(420).reduceMotion(ReduceMotion.System);

  return (
    <View style={styles.tease}>
      <Animated.View style={[styles.phone, tilt]}>
        <View style={[styles.screen, { backgroundColor: colors.background }]}>
          <Sky sky={sky} height={170} hazeTop={150} />
          <Serif style={[type.serifTitle, styles.phoneHead, { color: sky.inkLight ? colors.skyInk : colors.foreground }]}>
            {greetingFor(tr, null)}
          </Serif>
          <View style={styles.bubbles}>
            <Animated.View entering={arrive(0)} style={styles.meRow}>
              <View style={[styles.me, { experimental_backgroundImage: `linear-gradient(135deg, ${colors.calories}, ${colors.logoRamp})` }]}>
                <Text style={[styles.bubbleText, { color: colors.primaryForeground }]}>{tr('ob.teaseJournalYou1')}</Text>
              </View>
            </Animated.View>
            <Animated.View entering={arrive(1)}>
              <Glass strong radius={14} style={styles.ai}>
                <Text style={[styles.bubbleSmall, { color: colors.mutedForeground }]}>{tr('ob.teaseJournalReply1')}</Text>
                <Text style={[type.serifFigure, styles.kcal, { color: colors.foreground }]}>412 kcal</Text>
                <View style={styles.macros}>
                  {[
                    { value: '22', color: colors.protein },
                    { value: '28', color: colors.carbs },
                    { value: '24', color: colors.fat },
                  ].map((macro) => (
                    <View key={macro.color} style={[styles.macro, { backgroundColor: macro.color }]}>
                      <Text style={styles.macroText}>{macro.value}</Text>
                    </View>
                  ))}
                </View>
              </Glass>
            </Animated.View>
            <Animated.View entering={arrive(2)} style={styles.meRow}>
              <View style={[styles.me, { experimental_backgroundImage: `linear-gradient(135deg, ${colors.calories}, ${colors.logoRamp})` }]}>
                <Text style={[styles.bubbleText, { color: colors.primaryForeground }]}>{tr('ob.teaseJournalYou2')}</Text>
              </View>
            </Animated.View>
            <Animated.View entering={arrive(3)}>
              <Glass strong radius={14} style={styles.ai}>
                <Text style={[styles.bubbleSmall, { color: colors.mutedForeground }]}>{tr('ob.teaseJournalReply2')}</Text>
                <Text style={[type.serifFigure, styles.kcal, { color: colors.foreground }]}>+105 kcal</Text>
              </Glass>
            </Animated.View>
          </View>
          <View style={[styles.composer, { backgroundColor: scheme === 'dark' ? colors.glassStrong : '#ffffff', borderColor: colors.hairline }]}>
            <Text style={[styles.bubbleSmall, { color: colors.mutedForeground }]}>{tr('ob.teaseJournalComposer')}</Text>
          </View>
        </View>
      </Animated.View>

      {/* Beside the phone, not on it: nothing here sits over a word. */}
      <View style={styles.chips}>
        <Chip icon={<ChatMark color={colors.calories} />} label={tr('ob.teaseChipType')} delay={0} />
        <Chip icon={<Glossy name="plate" size={18} />} label={tr('ob.teaseChipPhoto')} delay={1} />
        <Chip icon={<Glossy name="bar" size={18} />} label={tr('ob.teaseChipBarcode')} delay={2} />
      </View>
    </View>
  );
}

/** Today, in miniature: the sky of this hour with the ring in it, filling. */
export function DayTease() {
  const colors = useColors();
  const tr = useT();
  const type = useType();
  const sky = useSky();
  const reduced = useReducedMotion();

  /* Fills once on arrival, the way a morning of logging would. */
  const [consumed, setConsumed] = useState(reduced ? 1180 : 0);
  useEffect(() => {
    const timer = setTimeout(() => setConsumed(1180), 500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.tease}>
      <Glass strong radius={30} style={styles.dayCard}>
        <Sky sky={sky} height={300} hazeTop={190} />
        <Serif style={[type.greeting, styles.dayGreeting, { color: sky.inkLight ? colors.skyInk : colors.foreground }]}>
          {greetingFor(tr, null)}
        </Serif>
        <GlowRing consumed={consumed} target={1840} size={176} strokeWidth={14} day="tease" />
        <View style={styles.capsules}>
          {[
            { name: 'protein' as const, color: colors.protein, fill: 0.62 },
            { name: 'carbs' as const, color: colors.carbs, fill: 0.48 },
            { name: 'fat' as const, color: colors.fat, fill: 0.55 },
          ].map((macro) => (
            <View key={macro.name} style={styles.capsuleRow}>
              <Glossy name={macro.name} size={18} />
              <View style={[styles.capsule, { backgroundColor: colors.hairline }]}>
                <View
                  style={[
                    styles.capsuleFill,
                    {
                      width: `${(consumed > 0 ? macro.fill : 0) * 100}%`,
                      backgroundColor: macro.color,
                      boxShadow: `0px 2px 5px -2px ${macro.color}`,
                    },
                  ]}
                />
              </View>
            </View>
          ))}
        </View>
      </Glass>
    </View>
  );
}

function Chip({ icon, label, delay }: { icon: React.ReactNode; label: string; delay: number }) {
  const colors = useColors();
  const reduced = useReducedMotion();
  const bob = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    const start = setTimeout(() => {
      bob.value = withRepeat(withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.sin) }), -1, true);
    }, delay * 500);
    return () => {
      clearTimeout(start);
      cancelAnimation(bob);
    };
  }, [reduced, bob, delay]);
  const floating = useAnimatedStyle(() => ({ transform: [{ translateY: -bob.value * 5 }] }));
  return (
    <Animated.View style={floating}>
      <Glass strong radius={999} style={styles.chip}>
        {icon}
        <Text style={[t.footnoteBold, { color: colors.foreground }]}>{label}</Text>
      </Glass>
    </Animated.View>
  );
}

function ChatMark({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Path d="M4 5a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H9l-5 4z" fill={color} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  tease: { alignItems: 'center', gap: 22, paddingTop: 6 },
  phone: {
    width: 232,
    height: 400,
    borderRadius: 38,
    padding: 7,
    backgroundColor: '#0c0b0a',
    boxShadow: '-24px 34px 60px -26px rgba(60, 40, 10, 0.55)',
  },
  screen: { flex: 1, borderRadius: 31, overflow: 'hidden' },
  phoneHead: { paddingTop: 30, paddingHorizontal: 16, fontSize: 18, lineHeight: 22 },
  bubbles: { paddingHorizontal: 11, paddingTop: 16, gap: 8 },
  meRow: { alignItems: 'flex-end' },
  me: { maxWidth: '84%', paddingHorizontal: 11, paddingVertical: 8, borderRadius: 14, borderBottomRightRadius: 4 },
  ai: { alignSelf: 'flex-start', paddingHorizontal: 11, paddingVertical: 8, gap: 2, borderBottomLeftRadius: 4 },
  bubbleText: { fontFamily: 'Nunito_700Bold', fontSize: 11.5, lineHeight: 15 },
  bubbleSmall: { fontFamily: 'Nunito_700Bold', fontSize: 10.5, lineHeight: 14 },
  kcal: { fontSize: 16, lineHeight: 20 },
  macros: { flexDirection: 'row', gap: 4, marginTop: 2 },
  macro: { borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1 },
  macroText: { fontFamily: 'Nunito_800ExtraBold', fontSize: 9, lineHeight: 12, color: '#ffffff' },
  composer: {
    position: 'absolute',
    left: 9,
    right: 9,
    bottom: 10,
    height: 32,
    borderRadius: 11,
    borderWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: 11,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, paddingHorizontal: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, paddingVertical: 8 },

  dayCard: { width: '100%', maxWidth: 360, alignItems: 'center', overflow: 'hidden', paddingBottom: 22 },
  dayGreeting: { alignSelf: 'flex-start', paddingTop: 22, paddingHorizontal: 22 },
  capsules: { alignSelf: 'stretch', paddingHorizontal: 22, gap: 10 },
  capsuleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  capsule: { flex: 1, height: 10, borderRadius: 999, overflow: 'hidden' },
  capsuleFill: { height: '100%', borderRadius: 999 },
});
