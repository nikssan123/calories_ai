import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Path, Polyline, Rect } from 'react-native-svg';
import { Backdrop } from '@/components/Backdrop';
import { duration, ease, font, tint, useColors } from '@/theme';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useKeyboardVisible } from '@/hooks/useKeyboardVisible';
import { haptics } from '@/lib/haptics';
import { useT, type StringKey } from '@/lib/i18n';

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
/*
 * The label is a message *key*, not a word. Resolved at render, because this
 * array is module scope and a hook cannot run in it — and because a tab bar
 * that read its words once at import would keep them after somebody changed
 * language in the settings two screens away.
 */
/*
 * Today first, and the tab the app opens on (GLOW-UP.md). The journal led for as
 * long as logging was the whole product, but the screen the redesign is built
 * around — the sky, the ring, the day at a glance — is the one people open the
 * app to read, and logging is one tap to its right. The rest follow the mockup:
 * the places you act (Cook, Exercise) before the place you review (Progress),
 * and your own details last.
 */
const TABS = [
  { name: 'today', label: 'nav.today', icon: 'flame' },
  { name: 'index', label: 'nav.journal', icon: 'chat' },
  { name: 'cook', label: 'nav.cook', icon: 'chef' },
  { name: 'exercise', label: 'nav.exercise', icon: 'person' },
  { name: 'progress', label: 'nav.progress', icon: 'chart' },
  { name: 'setup', label: 'nav.you', icon: 'user' },
] as const satisfies readonly { name: string; label: StringKey; icon: string }[];

/** Expo Router's way of saying which tab a cold start lands on. */
export const unstable_settings = { initialRouteName: 'today' };

/** Which tab was on show last, so an arriving tab knows which side it came from. */
let lastFocused: number | null = null;

/**
 * The tab transition: a short glide and a fade, run by Reanimated.
 *
 * A glide rather than a cut (GLOW-UP.md). The screens are transparent over one
 * shared light, so the arriving tab drifts in from the side it lies on — which
 * says which way along the bar you went, in the same motion the pill makes —
 * and eases up to full size. Short, so a thumb flicking between tabs never
 * waits on it, and off under reduced motion.
 *
 * Not the navigator's own `animation: 'shift'`, which was tried first. That one
 * is driven by React Native's Animated on the native driver, and on the new
 * architecture its commits overwrite props Reanimated has animated anywhere
 * else on screen with whatever React last rendered: a tab label stayed lit
 * after being left, and the segmented pill snapped back to its starting width.
 *
 * Only the arriving tab animates, and it is hidden the moment another tab takes
 * the focus rather than on every blur — a screen pushed over the tabs also blurs
 * them, and one made invisible then would be blank under the back gesture.
 */
function TabScene({
  route,
  navigation,
  children,
}: {
  route: { key: string };
  navigation: {
    addListener: (event: 'focus' | 'blur', callback: () => void) => () => void;
    getState: () => { index: number; routes: { key: string }[] };
    isFocused: () => boolean;
  };
  children: React.ReactNode;
}) {
  const reduced = useReducedMotion();
  const shown = useSharedValue(1);
  const side = useSharedValue(0);

  useEffect(() => {
    const indexOf = () => navigation.getState().routes.findIndex((r) => r.key === route.key);
    if (navigation.isFocused()) lastFocused = indexOf();

    const onFocus = navigation.addListener('focus', () => {
      const index = indexOf();
      const from = lastFocused;
      lastFocused = index;
      if (reduced || from === null || from === index) {
        shown.value = 1;
        return;
      }
      side.value = Math.sign(index - from);
      shown.value = 0;
      shown.value = withTiming(1, { duration: 320, easing: ease.out });
    });
    const onBlur = navigation.addListener('blur', () => {
      const state = navigation.getState();
      if (state.routes[state.index]?.key !== route.key) shown.value = 0;
    });
    return () => {
      onFocus();
      onBlur();
    };
  }, [navigation, route.key, reduced, shown, side]);

  const gliding = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [
      { translateX: (1 - shown.value) * 28 * side.value },
      { scale: 0.985 + shown.value * 0.015 },
    ],
  }));

  return <Animated.View style={[styles.fill, gliding]}>{children}</Animated.View>;
}

export default function TabsLayout() {
  const t = useT();
  return (
    <View style={styles.fill}>
      {/*
        * The light every tab stands in, drawn once for all six. The scenes are
        * transparent over it rather than each painting the ground, which is the
        * one place that is safe to do: tabs swap without a transition, so there
        * is never a frame with two scenes showing through each other.
        */}
      <Backdrop />
      <Tabs
        initialRouteName="today"
        screenLayout={(props) => <TabScene {...props} />}
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: 'transparent' },
        }}
        tabBar={(props) => <TabBar {...props} />}
      >
        {TABS.map((tab) => (
          <Tabs.Screen key={tab.name} name={tab.name} options={{ title: t(tab.label) }} />
        ))}
      </Tabs>
    </View>
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
  const t = useT();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  /*
   * All six, always.
   *
   * Two of them used to be hidden while a new account was still being asked
   * questions, because setup was a conversation on the journal that anybody
   * could walk past — straight into Today, to log against a calorie target
   * calculated for nobody in particular. The wizard closed that door upstream:
   * `app/_layout.tsx` does not draw this navigator at all until the profile can
   * support a real number, so by the time the tab bar exists there is nothing
   * left to withhold.
   */
  const shown = state.routes;
  /*
   * Where the lozenge is, in the row as drawn. -1 is a screen that is open but
   * not offered — the notification case above — and the pill is simply withheld
   * rather than parked on a tab that is not the current one.
   */
  const selected = shown.findIndex((route) => route.key === state.routes[state.index]?.key);

  /*
   * Equal columns, so the lozenge's geometry falls out of one measurement of
   * the row and no tab has to report its own. `flex: 1` per column is the only
   * reason this is allowed to be arithmetic rather than an `onLayout` each, and
   * it stops being true the moment a tab is given a different width.
   */
  const [rowWidth, setRowWidth] = useState(0);
  const columns = shown.length;
  const columnWidth = columns > 0 ? rowWidth / columns : 0;
  const lozengeWidth = Math.min(LOZENGE_MAX_WIDTH, columnWidth);

  /*
   * The travel is in column units — the animated position of the selection,
   * not of anything in pixels — so a rotation or a font-size change that
   * re-measures the row moves the pill without re-animating it.
   */
  /*
   * The pill's two edges travel separately, which is what makes it read as
   * liquid rather than as a box being slid (GLOW-UP.md). The edge on the side
   * you pointed leaves first and fast; the other follows a beat later and
   * settles with the spring, so on the way the pill stretches towards the tab
   * and then gathers itself up under it.
   */
  const leftEdge = useSharedValue(selected);
  const rightEdge = useSharedValue(selected);
  const previous = useRef(selected);
  useEffect(() => {
    if (selected < 0) return;
    const from = previous.current;
    previous.current = selected;
    if (reduced || from < 0) {
      leftEdge.value = selected;
      rightEdge.value = selected;
      return;
    }
    const lead = { duration: 240, easing: ease.out };
    const follow = { duration: duration.pop + 80, easing: ease.spring };
    if (selected > from) {
      rightEdge.value = withTiming(selected, lead);
      leftEdge.value = withTiming(selected, follow);
    } else {
      leftEdge.value = withTiming(selected, lead);
      rightEdge.value = withTiming(selected, follow);
    }
  }, [selected, leftEdge, rightEdge, reduced]);

  const sliding = useAnimatedStyle(() => {
    const left = Math.min(leftEdge.value, rightEdge.value);
    const right = Math.max(leftEdge.value, rightEdge.value);
    return {
      width: (right - left) * columnWidth + lozengeWidth,
      transform: [{ translateX: left * columnWidth + (columnWidth - lozengeWidth) / 2 }],
    };
  });

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
    /*
     * A lit glass pill, inset from the edges of the screen (GLOW-UP.md) — the
     * bar in the mockup, with one change: it is laid out rather than floated.
     * It takes its own strip at the foot of the screen and the page ends above
     * it, so no line of a scrolling list ever rests underneath. What shows
     * around its rounded corners is the page's own ambient light, drawn once
     * behind every tab by `TabsLayout`.
     */
    <View
      style={[
        styles.dock,
        {
          /*
           * The home indicator's inset, and a floor under it: on a phone with no
           * inset the pill still needs to sit off the bottom edge to read as a
           * pill rather than as a bar with rounded corners cut off.
           */
          paddingBottom: Math.max(insets.bottom, 12),
        },
      ]}
    >
      <View
        style={[
          styles.pill,
          {
            backgroundColor: colors.glassStrong,
            borderColor: colors.glassEdge,
            boxShadow: `0px 16px 34px -16px ${tint(colors.chunk, 0.9)}, inset 0px 1px 0px ${colors.glassEdge}`,
          },
        ]}
      >
        <View
          style={styles.row}
          onLayout={(e) => {
            const width = e.nativeEvent.layout.width;
            setRowWidth((previous) => (previous === width ? previous : width));
          }}
        >
          {/* Withheld until the row has a width, so it cannot animate in from 0,
              and while nothing in the row is the open screen. */}
          {rowWidth > 0 && selected >= 0 && (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.lozenge,
                sliding,
                {
                  width: lozengeWidth,
                  backgroundColor: colors.caloriesWash,
                  /* The logo's ramp, faint, with its own glow — the one lit thing in the bar. */
                  experimental_backgroundImage: `linear-gradient(135deg, ${tint(colors.calories, 0.2)}, ${tint(colors.logoRamp, 0.24)})`,
                  boxShadow: `0px 6px 16px -8px ${tint(colors.calories, 0.7)}, inset 0px 1px 0px ${tint('#ffffff', 0.5)}`,
                },
              ]}
            />
          )}
          {shown.map((route, index) => {
            const tab = TABS.find((candidate) => candidate.name === route.name);
            if (!tab) return null;
            const active = selected === index;

            return (
              <Pressable
                key={route.key}
                accessibilityRole="button"
                accessibilityState={active ? { selected: true } : {}}
                accessibilityLabel={t(tab.label)}
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
      </View>
    </View>
  );
}

/**
 * One tab's icon and label: a resting copy, and a lit copy laid over it that
 * fades in when the tab is chosen.
 *
 * The fade uses `ease.out` rather than the `ease.spring` the pill travels on,
 * because opacity is the one property in this design that cannot overshoot:
 * a spring past 1 is clamped flat, so the curve's whole character is lost and
 * what is left is a fade that stalls. Same clock, different curve.
 */
function TabItem({ tab, active }: { tab: (typeof TABS)[number]; active: boolean }) {
  const colors = useColors();
  const t = useT();
  const reduced = useReducedMotion();
  const pop = useSharedValue(1);

  /*
   * A small kick on the icon that was just chosen, and only on that one:
   * popping the tab being left would pull the eye back to where the user has
   * just decided not to be. Skipped on the first render, or every launch would
   * open with the Today icon bouncing at nobody.
   */
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (!active || reduced) return;
    pop.value = withSequence(
      withTiming(1.14, { duration: duration.quick / 2, easing: ease.pop }),
      withTiming(1, { duration: duration.quick, easing: ease.out }),
    );
  }, [active, pop, reduced]);

  const kick = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));

  /*
   * The lit copy is mounted only while the tab is chosen, and fades in and out
   * as it mounts and unmounts. It used to be always mounted with an animated
   * opacity, and a re-render of the bar could put back an opacity the fade had
   * already moved on from — a tab stayed lit after being left. Whether it is lit
   * is React's to say; the fade only dresses the change.
   */
  const fadeIn = reduced ? undefined : FadeIn.duration(duration.pop).easing(ease.out);
  const fadeOut = reduced ? undefined : FadeOut.duration(duration.quick).easing(ease.out);

  return (
    <>
      <Animated.View style={[styles.lozengeSlot, kick]}>
        <TabIcon name={tab.icon} color={colors.mutedForeground} strokeWidth={2.1} />
        {active && (
          <Animated.View
            entering={fadeIn}
            exiting={fadeOut}
            style={[StyleSheet.absoluteFill, styles.centred, { backgroundColor: 'transparent' }]}
            pointerEvents="none"
          >
            <TabIcon name={tab.icon} color={colors.caloriesText} strokeWidth={2.6} />
          </Animated.View>
        )}
      </Animated.View>
      <View style={styles.labelSlot}>
        <Text
          numberOfLines={1}
          style={[styles.label, { fontFamily: font.bold, color: colors.mutedForeground }]}
        >
          {t(tab.label)}
        </Text>
        {active && (
          <Animated.Text
            entering={fadeIn}
            exiting={fadeOut}
            numberOfLines={1}
            pointerEvents="none"
            style={[
              styles.label,
              StyleSheet.absoluteFill,
              { fontFamily: font.extrabold, color: colors.caloriesText },
            ]}
          >
            {t(tab.label)}
          </Animated.Text>
        )}
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

/** The breathing room under each label, inside the pill. */
const TAB_PADDING_BOTTOM = 8;

const styles = StyleSheet.create({
  fill: { flex: 1 },
  dock: { paddingHorizontal: 12, paddingTop: 6 },
  pill: { borderRadius: 28, borderWidth: 1, paddingHorizontal: 4, paddingTop: 2, paddingBottom: 2 },
  row: { flexDirection: 'row' },
  tab: { flex: 1, alignItems: 'center', paddingTop: 6, paddingBottom: TAB_PADDING_BOTTOM, gap: 2 },
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
