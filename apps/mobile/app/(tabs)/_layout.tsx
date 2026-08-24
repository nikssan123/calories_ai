import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Path, Polyline, Rect } from 'react-native-svg';
import { Material } from '@/components/Material';
import { duration, ease, font, useColors } from '@/theme';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useKeyboardVisible } from '@/hooks/useKeyboardVisible';
import { haptics } from '@/lib/haptics';

/**
 * Six, which is one past where a bottom bar is usually said to stop.
 *
 * It was five, and Cook was worth the sixth slot rather than worth demoting
 * something for: every other tab is somewhere you go to look at what you have
 * already done, and this is the only one that tells you what to do next. The
 * cost is real — the targets narrow and the labels are tight on a small phone
 * — so seven is not available, and anything else earns its place by replacing
 * one of these.
 *
 * History is not here. On the web it is reached by tapping the date on Today,
 * and that is how it is reached here too.
 */
const TABS = [
  { name: 'index', label: 'Journal', icon: 'chat' },
  { name: 'today', label: 'Today', icon: 'flame' },
  { name: 'progress', label: 'Progress', icon: 'chart' },
  { name: 'exercise', label: 'Exercise', icon: 'person' },
  { name: 'cook', label: 'Cook', icon: 'chef' },
  { name: 'setup', label: 'You', icon: 'user' },
] as const;

export default function TabsLayout() {
  const colors = useColors();
  return (
    <Tabs
      // Named for the same reason the Stack's is — see app/_layout.tsx.
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.background } }}
      tabBar={(props) => <TabBar {...props} />}
    >
      {TABS.map((tab) => (
        <Tabs.Screen key={tab.name} name={tab.name} options={{ title: tab.label }} />
      ))}
    </Tabs>
  );
}

/**
 * Drawn by hand rather than configured, because the active state is a shape
 * rather than a colour. With six tabs the bar is tight, and a filled lozenge is
 * the only difference a thumb can find at a glance in a row that narrow —
 * colour alone reads as noise.
 *
 * There is exactly one lozenge and it slides.
 *
 * It used to be six, one per tab, each fading itself in and out in place — so
 * tapping Cook faded one object out while a second faded in somewhere else,
 * which is two things happening where there is only ever one selection. Moving
 * a single pill says what the bar actually means: this is the thing you
 * pointed at, and it went to where you pointed.
 *
 * Everything else here follows from that. Once the lozenge takes 420ms to
 * arrive, the icon and the label underneath it cannot switch colour on the
 * frame of the press — that would leave the destination lit with nothing
 * beneath it and the origin dark with the pill still on top. So they cross-fade
 * on the same clock, which is why each is drawn twice and one copy fades over
 * the other: a weight change cannot be interpolated, and a stacked pair can.
 */
function TabBar({
  state,
  navigation,
}: {
  state: { index: number; routes: { key: string; name: string }[] };
  navigation: { navigate: (name: string) => void; emit: (event: { type: 'tabPress'; target: string; canPreventDefault: true }) => { defaultPrevented: boolean } };
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();

  /*
   * Six equal columns, so the lozenge's geometry falls out of one measurement
   * of the row and no tab has to report its own. `flex: 1` six times is the
   * only reason this is allowed to be arithmetic rather than six `onLayout`s,
   * and it stops being true the moment a tab is given a different width.
   */
  const [rowWidth, setRowWidth] = useState(0);
  const columns = state.routes.length;
  const columnWidth = columns > 0 ? rowWidth / columns : 0;
  const lozengeWidth = Math.min(LOZENGE_MAX_WIDTH, columnWidth);

  /*
   * The travel is in column units — the animated position of the selection,
   * not of anything in pixels — so a rotation or a font-size change that
   * re-measures the row moves the pill without re-animating it.
   */
  const travel = useSharedValue(state.index);
  useEffect(() => {
    travel.value = withTiming(state.index, {
      duration: reduced ? 0 : duration.pop,
      easing: ease.spring,
    });
  }, [state.index, travel, reduced]);

  const sliding = useAnimatedStyle(() => ({
    transform: [
      { translateX: travel.value * columnWidth + (columnWidth - lozengeWidth) / 2 },
    ],
  }));

  /*
   * Out of the way while typing. The bar is behind the keyboard regardless, but
   * the space it reserves is where the composer has to be — leaving it there
   * puts the send button under the keyboard on a screen whose entire purpose is
   * a sentence you just typed.
   *
   * Below every hook, and it has to stay there: this returns on one render and
   * not the next, so anything called after it would change the hook order the
   * first time somebody touched a text field.
   */
  const typing = useKeyboardVisible();
  if (typing) return null;

  return (
    <Material style={[styles.bar, { borderTopColor: colors.border, paddingBottom: insets.bottom }]}>
      <View
        style={styles.row}
        onLayout={(e) => {
          const width = e.nativeEvent.layout.width;
          setRowWidth((previous) => (previous === width ? previous : width));
        }}
      >
        {/* Withheld until the row has a width, so it cannot animate in from 0. */}
        {rowWidth > 0 && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.lozenge,
              sliding,
              { width: lozengeWidth, backgroundColor: colors.caloriesWash },
            ]}
          />
        )}
        {state.routes.map((route, index) => {
          const tab = TABS.find((t) => t.name === route.name);
          if (!tab) return null;
          const active = state.index === index;

          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={active ? { selected: true } : {}}
              accessibilityLabel={tab.label}
              onPress={() => {
                // Every chunky control in the app answers a press; the bar is
                // not chunky and would otherwise be the one thing that does
                // not. Fired whether or not it navigates — pressing the tab
                // you are already on is still a press, and silence there reads
                // as a missed tap.
                //
                // `selected` rather than `press`, which is what this was and
                // what made the bar the heaviest-feeling thing in the app: six
                // targets across the bottom of every screen, each answering a
                // thumb that is resting there anyway with the same buzz a
                // button gives. Nothing here goes down and comes back up —
                // a tab is a choice among six, so it gets the tick a choice
                // gets. See `lib/haptics`.
                haptics.selected();
                const event = navigation.emit({
                  type: 'tabPress',
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!active && !event.defaultPrevented) navigation.navigate(route.name);
              }}
              style={styles.tab}
            >
              <TabItem tab={tab} active={active} />
            </Pressable>
          );
        })}
      </View>
    </Material>
  );
}

/**
 * One tab's icon and label, each drawn twice and cross-faded.
 *
 * The fade uses `ease.out` rather than the `ease.spring` the pill travels on,
 * because opacity is the one property in this design that cannot overshoot:
 * a spring past 1 is clamped flat, so the curve's whole character is lost and
 * what is left is a fade that stalls. Same clock, different curve.
 */
function TabItem({ tab, active }: { tab: (typeof TABS)[number]; active: boolean }) {
  const colors = useColors();
  const reduced = useReducedMotion();
  const on = useSharedValue(active ? 1 : 0);
  const pop = useSharedValue(1);

  useEffect(() => {
    on.value = withTiming(active ? 1 : 0, {
      duration: reduced ? 0 : duration.pop,
      easing: ease.out,
    });
  }, [active, on, reduced]);

  /*
   * A small kick on the icon that was just chosen, and only on that one:
   * popping the tab being left would pull the eye back to where the user has
   * just decided not to be. Skipped on the first render, or every launch would
   * open with the Journal icon bouncing at nobody.
   */
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (!active || reduced) return;
    pop.value = withSequence(
      withTiming(1.12, { duration: duration.quick / 2, easing: ease.pop }),
      withTiming(1, { duration: duration.quick, easing: ease.out }),
    );
  }, [active, pop, reduced]);

  const fade = useAnimatedStyle(() => ({ opacity: on.value }));
  const kick = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));

  return (
    <>
      <Animated.View style={[styles.lozengeSlot, kick]}>
        <TabIcon name={tab.icon} color={colors.mutedForeground} strokeWidth={2.1} />
        <Animated.View style={[StyleSheet.absoluteFill, styles.centred, fade]} pointerEvents="none">
          <TabIcon name={tab.icon} color={colors.caloriesText} strokeWidth={2.6} />
        </Animated.View>
      </Animated.View>
      <View style={styles.labelSlot}>
        <Text
          numberOfLines={1}
          style={[styles.label, { fontFamily: font.bold, color: colors.mutedForeground }]}
        >
          {tab.label}
        </Text>
        <Animated.Text
          numberOfLines={1}
          pointerEvents="none"
          style={[
            styles.label,
            StyleSheet.absoluteFill,
            { fontFamily: font.extrabold, color: colors.caloriesText },
            fade,
          ]}
        >
          {tab.label}
        </Animated.Text>
      </View>
    </>
  );
}

/**
 * The six marks, as paths.
 *
 * The web pulls these from `lucide-react`, which is a DOM library. `lucide-react-native`
 * exists, but six icons is not worth a dependency that has to track the web one
 * for shape — these are the same geometry at the same 24-unit grid, so the two
 * bars draw the same picture.
 */
function TabIcon({ name, color, strokeWidth }: { name: (typeof TABS)[number]['icon']; color: string; strokeWidth: number }) {
  const props = {
    stroke: color,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };
  const size = 21;

  switch (name) {
    case 'chat': // message-square-text
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" {...props} />
          <Path d="M7 9h10M7 13h6" {...props} />
        </Svg>
      );
    case 'flame':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path
            d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"
            {...props}
          />
        </Svg>
      );
    case 'chart': // chart-line
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M3 3v16a2 2 0 0 0 2 2h16" {...props} />
          <Polyline points="7 14 11 10 14 13 20 7" {...props} />
        </Svg>
      );
    case 'person': // person-standing
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Circle cx="12" cy="5" r="1" {...props} />
          <Path d="m9 20 3-6 3 6M6 8l6 2 6-2M12 10v4" {...props} />
        </Svg>
      );
    case 'chef': // chef-hat
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path
            d="M17 21a1 1 0 0 0 1-1v-5.35c1.19-.7 2-2 2-3.48a4 4 0 0 0-4-4 4 4 0 0 0-8 0 4 4 0 0 0-4 4c0 1.48.81 2.78 2 3.48V20a1 1 0 0 0 1 1z"
            {...props}
          />
          <Path d="M6 17h12" {...props} />
        </Svg>
      );
    case 'user':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" {...props} />
          <Circle cx="12" cy="7" r="4" {...props} />
        </Svg>
      );
  }
}

/** `lozengeSlot`'s `maxWidth`: the pill never grows past this on a wide phone. */
const LOZENGE_MAX_WIDTH = 56;

const styles = StyleSheet.create({
  bar: { borderTopWidth: 2 },
  row: { flexDirection: 'row' },
  tab: { flex: 1, alignItems: 'center', paddingTop: 6, paddingBottom: 8, gap: 2 },
  lozengeSlot: {
    height: 32,
    width: '100%',
    maxWidth: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lozenge: {
    position: 'absolute',
    // `styles.tab`'s own `paddingTop`, so the pill lands where the six of them
    // used to sit rather than at the top of the row.
    top: 6,
    left: 0,
    height: 32,
    borderRadius: 999,
  },
  centred: { alignItems: 'center', justifyContent: 'center' },
  labelSlot: { alignSelf: 'stretch' },
  label: {
    fontSize: 10,
    lineHeight: 13,
    letterSpacing: -0.25,
    textAlign: 'center',
    // Android clips a descender at this size without a touch of headroom.
    includeFontPadding: Platform.OS === 'android' ? false : undefined,
  },
});
