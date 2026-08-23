import { useCallback, useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Polyline } from 'react-native-svg';
import { ease, font, type as t, useColors } from '@/theme';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/**
 * The shell every editable value on the profile screen wears.
 *
 * They were transparent and borderless once, which looked tidy on a mockup and
 * was unusable in practice: an empty height field rendered as the word "cm"
 * floating in white space with nothing to say it could be typed into. A field
 * has to look like a field. This is the quietest treatment that still does.
 */
export function fieldStyle(colors: ReturnType<typeof useColors>) {
  return {
    height: 40,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.muted,
    paddingHorizontal: 14,
  };
}

/** A plain text value — a name, a timezone. */
export function TextField({
  value,
  onChangeText,
  placeholder,
  style,
  align = 'right',
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  style?: StyleProp<TextStyle>;
  align?: 'left' | 'right';
}) {
  const colors = useColors();
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.mutedForeground}
      autoCapitalize="none"
      autoCorrect={false}
      style={[
        fieldStyle(colors),
        styles.input,
        { color: colors.foreground, textAlign: align },
        style,
      ]}
    />
  );
}

/**
 * A number and the unit it is in, inside one pill.
 *
 * The unit sits *inside* the field rather than beside it, so an empty value
 * still shows something shaped like an input instead of a stray "cm". Centred
 * rather than baseline-aligned: baseline packs flex items to the top of a
 * fixed-height pill and leaves the number sitting high in it.
 */
export function NumberField({
  value,
  onChange,
  unit,
  decimal = false,
  style,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  unit: string;
  decimal?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useColors();
  return (
    <View style={[fieldStyle(colors), styles.numberWrap, style]}>
      <TextInput
        value={value === null ? '' : String(value)}
        onChangeText={(next) => {
          const cleaned = next.replace(decimal ? /[^0-9.]/g : /[^0-9]/g, '');
          onChange(cleaned === '' ? null : Number(cleaned));
        }}
        placeholder="—"
        placeholderTextColor={colors.mutedForeground}
        keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
        style={[styles.numberInput, { color: colors.foreground, fontFamily: font.display }]}
      />
      <Text style={[t.footnote, { color: colors.mutedForeground }]}>{unit}</Text>
    </View>
  );
}

/**
 * A value chosen from a short list.
 *
 * The web opens a popover anchored to the trigger. That is a pointer idiom —
 * a menu the size of a fingertip, floating beside the control — so here it is a
 * sheet instead: full width, off the bottom, one row per option at a size a
 * thumb can hit. The trigger keeps the same pill shape as every other field so
 * the rows still read as one column.
 */
export function Picker<T extends string>({
  value,
  options,
  onChange,
  placeholder = '—',
  label,
  render,
}: {
  value: T | null;
  options: readonly T[];
  onChange: (value: T) => void;
  placeholder?: string;
  /** Names the sheet, since the trigger's own text is the current value. */
  label: string;
  /** Long form in the sheet, short form on the trigger. */
  render: (value: T, place: 'trigger' | 'sheet') => string;
}) {
  const colors = useColors();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={({ pressed }) => [
          fieldStyle(colors),
          styles.trigger,
          { opacity: pressed ? 0.6 : 1 },
        ]}
      >
        <Text style={[t.bodySemibold, { color: colors.foreground }]}>
          {value === null ? placeholder : render(value, 'trigger')}
        </Text>
        <Svg width={16} height={16} viewBox="0 0 24 24">
          <Polyline
            points="6 9 12 15 18 9"
            stroke={colors.mutedForeground}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </Svg>
      </Pressable>

      <Sheet open={open} title={label} onClose={() => setOpen(false)}>
        {options.map((option) => (
          <Pressable
            key={option}
            onPress={() => {
              onChange(option);
              setOpen(false);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: option === value }}
            style={({ pressed }) => [
              styles.option,
              { borderTopColor: colors.border, opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <Text style={[t.body, styles.optionLabel, { color: colors.foreground }]}>
              {render(option, 'sheet')}
            </Text>
            {option === value && (
              <Svg width={18} height={18} viewBox="0 0 24 24">
                <Path
                  d="M20 6 9 17l-5-5"
                  stroke={colors.caloriesText}
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              </Svg>
            )}
          </Pressable>
        ))}
      </Sheet>
    </>
  );
}

/**
 * The bottom sheet the pickers, the kitchen and the scanner all open into.
 *
 * Animated by hand rather than with `animationType="slide"`. The scrim lives
 * inside the modal, and RN slides the modal's *whole* content — so the built-in
 * animation dragged a full-screen black rectangle up from the bottom edge along
 * with the sheet, which reads as a shadow being pulled across the screen rather
 * than as a panel arriving. The two have to move differently: the scrim fades
 * where it is, and only the sheet travels.
 */
export function Sheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const colors = useColors();
  const reduced = useReducedMotion();
  /*
   * A `Modal` is its own root view and inherits nothing, including the safe
   * area — so the bottom of a sheet sits under the home indicator unless it is
   * told not to. `SafeAreaProvider` is above the modal in the React tree even
   * though it is not above it on screen, so the inset is still readable here.
   */
  const insets = useSafeAreaInsets();

  /*
   * Kept mounted for the length of the exit, then unmounted. Without the second
   * flag the sheet would vanish on the frame `open` went false and there would
   * be nothing left to animate out.
   */
  const [mounted, setMounted] = useState(open);
  /*
   * A shared value rather than a ref, and not interchangeable with one: the
   * worklet below reads this every frame, and Reanimated freezes a plain object
   * the first time a worklet captures it. A ref written from `onLayout` would
   * warn on every measurement and the panel would keep sliding in from the 420
   * it guessed rather than from its own measured height — worst on the tall
   * sheets, which is where the guess is furthest out.
   */
  const height = useSharedValue(420);
  const progress = useSharedValue(0);

  useEffect(() => {
    if (open) {
      setMounted(true);
      progress.value = reduced ? 1 : withTiming(1, { duration: 260, easing: ease.out });
      return;
    }
    if (reduced) {
      progress.value = 0;
      setMounted(false);
      return;
    }
    progress.value = withTiming(0, { duration: 200, easing: ease.out }, (done) => {
      if (done) runOnJS(setMounted)(false);
    });
  }, [open, reduced, progress]);

  /*
   * How far a finger has pulled the sheet down, in points. Separate from
   * `progress` rather than folded into it, because the two are answering
   * different questions: `progress` is the sheet arriving or leaving under its
   * own power, and this is the reader moving it. Folding them together would
   * mean a drag that started mid-entrance fought the animation for the same
   * value.
   */
  const drag = useSharedValue(0);

  const dismiss = useCallback(() => {
    'worklet';
    runOnJS(onClose)();
  }, [onClose]);

  /*
   * The grabber's drag.
   *
   * Attached to the header rather than the whole panel, which is the one
   * decision here worth stating: the body of a sheet is a `ScrollView`, and a
   * pan over the whole surface would have to negotiate with it on every touch —
   * "is this a scroll or a dismiss?" — a question that is wrong about a third
   * of the time and infuriating whenever it is. A grabber is a small, explicit
   * place where the answer is never in doubt, which is why every phone has one.
   *
   * Downward only. A sheet that could be flung upward would either have to grow
   * a second height to stop at or rubber-band back, and neither is a thing this
   * sheet does.
   */
  const pull = Gesture.Pan()
    .onChange((event) => {
      drag.value = Math.max(0, drag.value + event.changeY);
    })
    .onEnd((event) => {
      /*
       * Distance *or* speed. A slow, deliberate pull most of the way down and a
       * quick flick from the top are both unambiguously "close this", and
       * judging only on distance turns the flick — which is the faster and more
       * common of the two — into a bounce back.
       */
      const far = drag.value > height.value * 0.25;
      const fast = event.velocityY > 900;
      if (far || fast) {
        dismiss();
      } else {
        drag.value = withTiming(0, { duration: 180, easing: ease.out });
      }
    });

  /*
   * Back to nothing whenever the sheet opens, so a sheet dismissed by dragging
   * does not reopen already half-way down.
   */
  useEffect(() => {
    if (open) drag.value = 0;
  }, [open, drag]);

  const scrim = useAnimatedStyle(() => ({
    /*
     * The scrim thins as the sheet is pulled away, which is what makes the
     * gesture feel like it is moving the whole arrangement rather than sliding
     * one card over a fixed grey pane.
     */
    opacity: progress.value * (1 - Math.min(1, drag.value / Math.max(1, height.value))),
  }));
  const panel = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.value) * height.value + drag.value }],
  }));

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose}>
      {/*
       * A second gesture root, inside the modal.
       *
       * A `Modal` is its own native window, so the one at the top of the app
       * does not reach in here — and a gesture mounted outside a root does not
       * fail, it simply never fires. The pantry's rows are swipeable and were
       * silently not, which is exactly the failure this shape produces: the
       * code is right, the handler is mounted, nothing happens.
       *
       * The same reason this sheet already draws its own scrim and its own
       * safe-area padding: nothing above it applies.
       */}
      <GestureHandlerRootView style={styles.flex}>
        <Animated.View style={[styles.scrim, scrim]}>
          {/* Tapping away closes it — the same affordance as tapping off a
              popover, and the only one a sheet with no chrome can offer. */}
          <Pressable style={styles.flex} onPress={onClose} accessibilityLabel="Close" />
        </Animated.View>

        <Animated.View
          onLayout={(event) => {
            height.value = event.nativeEvent.layout.height;
          }}
          style={[
            styles.sheet,
            panel,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              paddingBottom: Math.max(insets.bottom, 16) + 12,
            },
          ]}
        >
          <GestureDetector gesture={pull}>
            {/* The grabber and the title are one target: a 4pt bar is a mark,
                not something a thumb can find. */}
            <View>
              <View style={[styles.grabber, { backgroundColor: colors.border }]} />
              <Text style={[t.eyebrow, styles.sheetTitle, { color: colors.mutedForeground }]}>
                {title}
              </Text>
            </View>
          </GestureDetector>
          <ScrollView bounces={false}>{children}</ScrollView>
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  input: { fontFamily: font.semibold, fontSize: 16, paddingVertical: 0 },
  numberWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
    width: 128,
  },
  numberInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    textAlign: 'right',
    paddingVertical: 0,
  },
  trigger: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flex: { flex: 1 },
  scrim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0, 0, 0, 0.35)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '75%',
    borderTopWidth: 2,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  /*
   * The one piece of chrome in this app with no outline and no ledge. A grabber
   * is a handle rather than a surface — giving it an edge would make it look
   * like something to press.
   */
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 999,
    marginTop: 10,
    marginBottom: 2,
  },
  sheetTitle: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 10 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderTopWidth: 2,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  optionLabel: { flex: 1 },
});
