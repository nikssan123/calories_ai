import { useEffect } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Path, Polyline, Rect } from 'react-native-svg';
import { Material } from '@/components/Material';
import { duration, ease, font, useColors } from '@/theme';
import { useReducedMotion } from '@/hooks/useReducedMotion';

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
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
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

  return (
    <Material style={[styles.bar, { borderTopColor: colors.border, paddingBottom: insets.bottom }]}>
      <View style={styles.row}>
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
                const event = navigation.emit({
                  type: 'tabPress',
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!active && !event.defaultPrevented) navigation.navigate(route.name);
              }}
              style={styles.tab}
            >
              <Lozenge active={active}>
                <TabIcon
                  name={tab.icon}
                  color={active ? colors.caloriesText : colors.mutedForeground}
                  strokeWidth={active ? 2.6 : 2.1}
                />
              </Lozenge>
              <Text
                numberOfLines={1}
                style={[
                  styles.label,
                  {
                    fontFamily: active ? font.extrabold : font.bold,
                    color: active ? colors.caloriesText : colors.mutedForeground,
                  },
                ]}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </Material>
  );
}

/** The tinted pill behind the active icon. Springs, like everything that reports a change. */
function Lozenge({ active, children }: { active: boolean; children: React.ReactNode }) {
  const colors = useColors();
  const reduced = useReducedMotion();
  const on = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    on.value = withTiming(active ? 1 : 0, {
      duration: reduced ? 0 : duration.spring,
      easing: ease.spring,
    });
  }, [active, on, reduced]);

  const animated = useAnimatedStyle(() => ({
    // 0.9 → 1, matching `scale-90`/`scale-100` on the web.
    transform: [{ scale: 0.9 + on.value * 0.1 }],
    opacity: on.value,
  }));

  return (
    <View style={styles.lozengeSlot}>
      <Animated.View
        style={[styles.lozenge, animated, { backgroundColor: colors.caloriesWash }]}
        pointerEvents="none"
      />
      {children}
    </View>
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
  lozenge: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, borderRadius: 999 },
  label: {
    fontSize: 10,
    lineHeight: 13,
    letterSpacing: -0.1,
    textAlign: 'center',
    // Android clips a descender at this size without a touch of headroom.
    includeFontPadding: Platform.OS === 'android' ? false : undefined,
  },
});
