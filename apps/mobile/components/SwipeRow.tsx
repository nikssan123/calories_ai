import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeOut, LinearTransition, ReduceMotion } from 'react-native-reanimated';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import { type as t, useColors, type Palette } from '@/theme';
import { Glyph } from '@/components/Glyph';
import { haptics } from '@/lib/haptics';

export interface SwipeAction {
  /** Printed under the mark. Keep it to one word. */
  label: string;
  /**
   * What a screen reader hears instead. "Delete" alone is the label a sighted
   * reader needs, because the row it belongs to is right there next to it;
   * someone hearing the panel read out has already moved on from the row.
   */
  announce?: string;
  /** The panel behind the row. */
  tint: string;
  /** Ink on that panel — supplied rather than derived, since the tints vary. */
  ink: string;
  icon: React.ReactNode;
  onPress: () => void;
}

/**
 * A row you can pull to one side to reveal what you can do to it.
 *
 * This is an accessibility fix wearing an idiom's clothes. The destructive
 * control on a row here is a 15pt mark with 10pt of `hitSlop` around it — about
 * 35pt of target, under the 44pt minimum and reliably missable with a thumb on
 * a moving train. The gesture is how a phone gives a small control a large
 * target without spending any layout on it, so the mark stays where it is for
 * discoverability and this becomes the way it is actually used.
 *
 * Right-hand actions only. A left-hand set would have to mean something
 * different from the right-hand one, and nothing in this app has two opposed
 * things to do to a row; a swipe that reveals the same panel from either side
 * is just a wider target pretending to be a second gesture.
 *
 * `overshootRight` is off. Everything in this design has an edge you could pick
 * up, and a panel that stretches past its own width to rubber-band is the one
 * place the app would admit its surfaces are made of nothing.
 *
 * The exit and the layout transition live here rather than at the call sites,
 * because they are not decoration on top of the gesture — they are the half of
 * it that makes it read as finished. Without them a swiped row vanishes on the
 * frame it is deleted and the list snaps shut under the thumb still resting on
 * it, which looks less like an action completing than like the screen glitching.
 * Anything given a swipe-to-delete gets both, by construction.
 */
export function SwipeRow({
  actions,
  style,
  children,
}: {
  actions: SwipeAction[];
  /** Laid on the wrapper — the divider above the row belongs out here. */
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const colors = useColors();

  /*
   * A row with nothing to offer is not a swipeable row that happens to be
   * empty — it is a row. Some lists mix the two: a shopping line somebody
   * typed can be removed and one derived from the week's plan cannot, and a
   * gesture that opened onto a blank panel would promise an action that does
   * not exist.
   */
  if (actions.length === 0) return <View style={style}>{children}</View>;

  return (
    <Animated.View
      style={style}
      /*
       * `ReduceMotion.System` on both: unlike the sink and the spring, these
       * two have no meaningful end state to jump to — a row that has gone is
       * simply gone — so honouring the OS switch costs the reader nothing and
       * the alternative is a list that jumps under someone who asked it not to.
       */
      layout={LinearTransition.duration(220).reduceMotion(ReduceMotion.System)}
      exiting={FadeOut.duration(160).reduceMotion(ReduceMotion.System)}
    >
      <ReanimatedSwipeable
        friction={2}
        rightThreshold={40}
        overshootRight={false}
        // The row is transparent over the card it sits on, so without a ground
        // of its own the panel behind would read straight through it.
        childrenContainerStyle={{ backgroundColor: colors.card }}
        // The same light impact every chunky control gives, at the moment the
        // row commits to opening rather than when the finger first moves —
        // otherwise a scroll that grazes sideways would buzz.
        onSwipeableWillOpen={() => haptics.press()}
        renderRightActions={(_progress, _translation, methods: SwipeableMethods) => (
          <View style={styles.panel}>
            {actions.map((action) => (
              <Pressable
                key={action.label}
                accessibilityRole="button"
                accessibilityLabel={action.announce ?? action.label}
                style={({ pressed }) => [
                  styles.action,
                  { backgroundColor: action.tint, opacity: pressed ? 0.7 : 1 },
                ]}
                onPress={() => {
                  haptics.press();
                  /*
                   * Closed first, and deliberately not waiting for it. Some of
                   * these leave the row on screen — a repeat, a rename — and
                   * one that stayed open behind its own result would have to be
                   * dismissed by hand. The ones that delete it are closing
                   * something already on its way out, which costs nothing.
                   */
                  methods.close();
                  action.onPress();
                }}
              >
                {action.icon}
                <Text style={[t.footnoteBold, { color: action.ink }]}>{action.label}</Text>
              </Pressable>
            ))}
          </View>
        )}
      >
        {children}
      </ReanimatedSwipeable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  panel: { flexDirection: 'row' },
  /*
   * 76 wide against a 44pt minimum, because two of these sit side by side and
   * the one on the left is the one you did not mean if you were reaching for
   * the other. The height comes from the row.
   */
  action: { width: 76, alignItems: 'center', justifyContent: 'center', gap: 3 },
});

/**
 * The two things a pulled row offers, built here rather than at each call site
 * so that "delete" is the same red, the same width and the same word wherever
 * it is reached from.
 */
export function removeAction(colors: Palette, what: string, onPress: () => void): SwipeAction {
  return {
    label: 'Delete',
    announce: `Delete ${what}`,
    tint: colors.destructive,
    ink: colors.destructiveForeground,
    icon: <Glyph icon="trash" color={colors.destructiveForeground} size={19} />,
    onPress,
  };
}

export function repeatAction(colors: Palette, what: string, onPress: () => void): SwipeAction {
  return {
    label: 'Repeat',
    announce: `Log ${what} again`,
    tint: colors.primary,
    ink: colors.primaryForeground,
    icon: <Glyph icon="repeat" color={colors.primaryForeground} size={19} />,
    onPress,
  };
}
