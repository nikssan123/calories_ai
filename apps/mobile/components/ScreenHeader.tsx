import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useNavigation, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Polyline } from 'react-native-svg';
import { Backdrop } from '@/components/Backdrop';
import { Sky, useSky } from '@/components/Sky';
import { useT, type StringKey } from '@/lib/i18n';
import { type as t, useColors } from '@/theme';

/**
 * The top of a screen pushed over the tabs: the hour's sky, a way back, and the
 * title in the serif.
 *
 * The tabs got their light in the glow-up (GLOW-UP.md) and the screens reached
 * from them did not, so leaving Today for the calendar used to step off a sky
 * onto a flat sheet with a bare chevron on it. This is the tabs' header — the
 * same `Sky`, the same title — with the one thing a tab never needs: the way
 * back, drawn once so every pushed screen offers it in the same place and the
 * same shape.
 *
 * Laid out at the head of the scroller, not pinned, so it scrolls away the way
 * a tab's does. `inset` is the page's own horizontal padding, which the header
 * steps outside of so the sky runs edge to edge.
 */
export function ScreenHeader({
  title,
  back,
  backFallback,
  onBack,
  action,
  top,
  trailing,
  subtitle,
  align = 'start',
  inset = 16,
  skyHeight = 190,
  style,
  children,
}: {
  title?: string;
  /**
   * The name of the screen the back button returns to, when the caller knows
   * it for certain. Otherwise it is read off the stack (see `useBackLabel`),
   * and `false` draws no back button at all — a screen that asks for a decision
   * closes with its own buttons.
   */
  back?: string | false;
  /** What to call the way back when the stack does not name the screen below. */
  backFallback?: string;
  onBack?: () => void;
  /** On the back button's row, at the far end: a Save, a Share. */
  action?: React.ReactNode;
  /** Above the title: an avatar, a mark. */
  top?: React.ReactNode;
  /** Beside the title: a count. */
  trailing?: React.ReactNode;
  subtitle?: string;
  align?: 'start' | 'center';
  inset?: number;
  skyHeight?: number;
  style?: StyleProp<ViewStyle>;
  /** Under the title, still in the sky: a month switcher. */
  children?: React.ReactNode;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const sky = useSky();
  const derived = useBackLabel(backFallback);
  const ink = sky.inkLight ? colors.skyInk : colors.foreground;
  const quiet = sky.inkLight ? colors.skyInk : colors.mutedForeground;
  const centred = align === 'center';
  const label = back === false ? null : (back ?? derived);

  return (
    <View
      style={[
        styles.header,
        { paddingTop: insets.top + 8, marginHorizontal: -inset, paddingHorizontal: inset },
        style,
      ]}
    >
      <Sky sky={sky} height={insets.top + skyHeight} hazeTop={insets.top + 60} style={styles.sky} />

      {(label !== null || action) && (
        <View style={styles.backRow}>
          {label !== null ? (
            <GlassPill
              onPress={onBack ?? (() => router.back())}
              label={label}
              onSky={sky.inkLight}
              chevron
            />
          ) : (
            <View />
          )}
          {action}
        </View>
      )}

      {top && <View style={centred ? styles.centredBlock : null}>{top}</View>}

      {title !== undefined && (
        <View style={[styles.titleRow, centred && styles.titleRowCentred]}>
          <Text
            accessibilityRole="header"
            style={[t.largeTitle, centred ? styles.centredText : styles.title, { color: ink }]}
          >
            {title}
          </Text>
          {trailing}
        </View>
      )}

      {subtitle && (
        <Text style={[t.body, centred && styles.centredText, { color: quiet, opacity: sky.inkLight ? 0.9 : 1 }]}>
          {subtitle}
        </Text>
      )}

      {children}
    </View>
  );
}

/**
 * The light a tab stands in, for a pushed screen: the page's ambient washes,
 * behind everything and still while the page scrolls. The stack paints the
 * same ground, but it does not reliably reach the screen on Android, where
 * pushed screens came out flat cream.
 */
export function ScreenGround({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.fill}>
      <Backdrop />
      {children}
    </View>
  );
}

/**
 * A lit, see-through pill for words and controls that sit on the sky: the back
 * button, a Save. Glass rather than a card, because what is behind it is the
 * hour's light, and on a dark hour it takes the date strip's white wash so it
 * does not turn into a brown lozenge on indigo.
 */
export function GlassPill({
  label,
  onPress,
  onSky,
  chevron = false,
  icon,
  accessibilityLabel,
  selected,
}: {
  label: string;
  onPress: () => void;
  /** The sky is dark enough that the ink has to be light. */
  onSky: boolean;
  chevron?: boolean;
  icon?: React.ReactNode;
  accessibilityLabel?: string;
  selected?: boolean;
}) {
  const colors = useColors();
  const ink = onSky ? colors.skyInk : colors.foreground;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={selected === undefined ? undefined : { selected }}
      hitSlop={8}
      style={({ pressed }) => [
        styles.pill,
        chevron ? styles.pillWithChevron : null,
        label.length === 0 ? styles.pillIconOnly : null,
        {
          backgroundColor: onSky ? 'rgba(255,255,255,0.12)' : colors.glassStrong,
          boxShadow: onSky
            ? 'inset 0px 1px 0px rgba(255,255,255,0.18)'
            : `${colors.shadow}, inset 0px 1px 0px ${colors.glassEdge}`,
          opacity: pressed ? 0.6 : 1,
        },
      ]}
    >
      {chevron && <Chevron direction="back" color={ink} />}
      {icon}
      {label.length > 0 && (
        <Text numberOfLines={1} style={[t.footnoteBold, { color: ink }]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function Chevron({ direction, color, size = 18 }: { direction: 'back' | 'forward'; color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Polyline
        points={direction === 'back' ? '15 18 9 12 15 6' : '9 18 15 12 9 6'}
        stroke={color}
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

/** Where each route behind a pushed screen is called, for the back button. */
const ROUTE_LABELS: Record<string, StringKey> = {
  index: 'nav.journal',
  today: 'nav.today',
  cook: 'nav.cook',
  exercise: 'nav.exercise',
  progress: 'nav.progress',
  setup: 'nav.you',
  history: 'history.title',
  achievements: 'achievements.title',
  plan: 'plan.theWeek',
};

interface RouteState {
  index?: number;
  routes?: { name: string; state?: RouteState }[];
}

/**
 * The screen underneath this one, by name.
 *
 * A pushed screen cannot know who pushed it: the badge wall opens from Progress
 * and from the streak under Today's ring, a recipe from Cook and from the week's
 * plan. A back button that said "Cook" over a recipe opened from the plan would
 * be wrong about where it goes, so the label is read off the stack at render —
 * and when the route below is one without a name worth saying, it says "Back".
 */
export function useBackLabel(fallback?: string): string {
  const tr = useT();
  const navigation = useNavigation();
  const state = navigation.getState() as RouteState | undefined;
  const routes = state?.routes ?? [];
  const here = state?.index ?? routes.length - 1;
  let below = routes[here - 1];
  // The tabs are one route to the stack; the one showing is inside it.
  while (below?.state?.routes && below.state.routes.length > 0) {
    const nested = below.state;
    below = nested.routes![nested.index ?? 0];
  }
  const key = below ? ROUTE_LABELS[below.name] : undefined;
  if (key) return tr(key) as string;
  return fallback ?? (tr('history.back') as string);
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { gap: 10, paddingBottom: 4 },
  sky: { top: 0 },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 36,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 999,
    maxWidth: 220,
  },
  pillWithChevron: { paddingLeft: 8 },
  pillIconOnly: { width: 36, paddingHorizontal: 0, justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 2 },
  titleRowCentred: { justifyContent: 'center' },
  title: { flex: 1 },
  centredText: { textAlign: 'center' },
  centredBlock: { alignItems: 'center' },
});
