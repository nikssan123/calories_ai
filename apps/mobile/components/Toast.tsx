import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';
import { Chunk, PressableChunk } from '@/components/Chunk';
import { duration, ease, font, type as t, useColors, type Palette } from '@/theme';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/**
 * The toast, which this app went without for a while and is better for having
 * argued about first.
 *
 * The web leans on sonner everywhere, and the port replaced it with inline
 * reporting: the message about a field goes under the field, and the message
 * about a card goes in the card. That is still the rule, and most of the
 * inline copy stayed exactly where it was — a failed sign-in belongs under the
 * password box, not in a strip at the top of the screen that leaves again
 * before anyone has finished reading it.
 *
 * What inline reporting cannot do is answer for something that has *left the
 * screen*. Tapping "log again" on yesterday's dinner and then scrolling on;
 * removing an item from the pantry; saving a recipe from a card that is about
 * to be replaced — in each of those the receipt has no home, because the thing
 * it is about is gone by the time it arrives. That is the gap this fills, and
 * it is why the call sites are counted in single figures rather than following
 * the web one for one.
 *
 * It is one of the very few pieces here with no equivalent in `apps/web`'s
 * component tree, so the styling is taken from the CSS sonner is bent into
 * rather than from a React file: a 2px border, the `--chunk` ledge at depth 5,
 * and weight 600 copy.
 */

type Variant = 'success' | 'error' | 'message';

interface Toast {
  id: number;
  variant: Variant;
  text: string;
  action?: ToastAction;
}

/**
 * One thing the reader can do about what just happened, offered rather than
 * asked.
 *
 * This exists for undo, and undo is the reason the app has no confirmation
 * dialogs. A confirm taxes everybody a tap to protect the rare mistake and
 * interrupts the thing they were doing to ask whether they meant it; acting at
 * once and offering the reversal is faster in the common case and safer in the
 * rare one, because it also catches the mis-tap nobody noticed until the row
 * had gone.
 *
 * It is the only interactive part of a toast and it stays that way. Anything
 * needing a second decision does not belong in a strip that leaves on a timer.
 */
export interface ToastAction {
  label: string;
  run: () => void;
}

/**
 * Four seconds, which is sonner's default and is about right for a sentence
 * nobody has to act on. Anything a person must *decide* about does not belong
 * in a toast in the first place.
 *
 * Exported because an undo has to agree with it. The caller holding the
 * reversal open has to stop holding it at the same moment the offer leaves the
 * screen, and two independently-chosen four seconds would drift the first time
 * either was tuned.
 */
export const TOAST_LIFETIME_MS = 4000;

/**
 * Three at once, oldest evicted.
 *
 * A phone is not a desktop corner: a fourth toast on a 390pt screen is a wall,
 * and by the time somebody has read the fourth the first has expired anyway.
 * Two arriving together is the realistic case — a batch that half worked.
 */
const MAX_VISIBLE = 3;

interface ToastValue {
  success: (text: string, action?: ToastAction) => void;
  error: (text: string, action?: ToastAction) => void;
  /** Plain, for something that is neither good news nor a failure. */
  message: (text: string, action?: ToastAction) => void;
}

const noop = () => {};
const ToastContext = createContext<ToastValue>({ success: noop, error: noop, message: noop });

/**
 * The three verbs sonner is called with in `apps/web`, and only those. `promise`
 * and `loading` are deliberately absent: everything slow in this app already
 * shows its own progress in place, and a spinner in a strip at the top of the
 * screen would be a second, worse answer to a question the button has already
 * answered.
 */
export const useToast = (): ToastValue => useContext(ToastContext);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  // Monotonic rather than random: two identical messages a second apart must be
  // two rows, and `Date.now()` collides when a batch reports twice in one tick.
  const nextId = useRef(0);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback((variant: Variant, text: string, action?: ToastAction) => {
    setToasts((prev) =>
      [...prev, { id: nextId.current++, variant, text, action }].slice(-MAX_VISIBLE),
    );
  }, []);

  const value = useMemo<ToastValue>(
    () => ({
      success: (text, action) => push('success', text, action),
      error: (text, action) => push('error', text, action),
      message: (text, action) => push('message', text, action),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Overlay toasts={toasts} onDismiss={remove} />
    </ToastContext.Provider>
  );
}

/**
 * Above everything, and at the top.
 *
 * The bottom of this app is spoken for on every screen that matters — the
 * composer on the journal, the tab bar under all six — and a receipt that
 * covers the box someone is typing into is worse than no receipt at all.
 *
 * `box-none` so the strip itself is not a lid over the screen: only the toasts
 * take a touch, and the app underneath stays live while one is up. A toast that
 * swallowed the tap meant for the button behind it would turn a piece of
 * feedback into an obstacle.
 */
function Overlay({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  const insets = useSafeAreaInsets();

  return (
    <View
      pointerEvents="box-none"
      style={[StyleSheet.absoluteFill, styles.overlay, { paddingTop: insets.top + 8 }]}
    >
      {toasts.map((toast) => (
        <Row key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </View>
  );
}

function Row({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  const colors = useColors();
  const reduced = useReducedMotion();
  const progress = useSharedValue(0);
  /** Guards the exit against being started twice — by a tap during the timer. */
  const leaving = useRef(false);

  const dismiss = useCallback(() => {
    if (leaving.current) return;
    leaving.current = true;
    progress.value = withTiming(
      0,
      { duration: reduced ? 0 : duration.quick, easing: ease.out },
      // Removed from the list only once it has actually gone, so the row is not
      // torn out from under its own exit.
      (done) => {
        if (done) runOnJS(onDismiss)(toast.id);
      },
    );
  }, [onDismiss, progress, reduced, toast.id]);

  useEffect(() => {
    /*
     * `ease.pop` rather than `ease.spring`: this is the register the app uses
     * for something you just touched, and a toast is always the answer to
     * something someone just did. The card's slower spring is for the agent
     * handing back a result, which is a different sentence.
     */
    progress.value = withTiming(1, {
      duration: reduced ? 0 : duration.pop,
      easing: reduced ? ease.out : ease.pop,
    });

    const timer = setTimeout(dismiss, TOAST_LIFETIME_MS);
    return () => clearTimeout(timer);
  }, [dismiss, progress, reduced]);

  const animated = useAnimatedStyle(() => ({
    opacity: progress.value,
    // From above the notch rather than from nowhere, so it reads as having
    // come from off screen — the one direction a phone has spare.
    transform: [{ translateY: -18 * (1 - progress.value) }],
  }));

  return (
    <Animated.View style={animated}>
      <Pressable
        onPress={dismiss}
        accessibilityRole="button"
        // A finger has no hover, so sonner's close button has nothing to appear
        // on. The whole toast is the dismiss target instead — except for the
        // action, which is its own button and announces itself.
        accessibilityLabel={`${toast.text}. Tap to dismiss.`}
        accessibilityLiveRegion="polite"
      >
        <Chunk
          depth={5}
          radius={20}
          reserve
          contentStyle={[
            styles.toast,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Icon variant={toast.variant} colors={colors} />
          <Text style={[t.footnoteSemibold, styles.text, { color: colors.foreground }]}>
            {toast.text}
          </Text>
          {toast.action && (
            /*
             * Its own pressable inside the dismissing one. The responder
             * system gives the touch to the innermost handler, so this takes
             * the tap rather than the tap-to-dismiss behind it — and then
             * dismisses anyway, because an offer that has been taken up has
             * nothing left to say.
             */
            <PressableChunk
              depth={2}
              radius={999}
              onPress={() => {
                toast.action?.run();
                dismiss();
              }}
              accessibilityRole="button"
              accessibilityLabel={toast.action.label}
              contentStyle={[
                styles.action,
                { backgroundColor: colors.background, borderColor: colors.border },
              ]}
            >
              <Text style={[t.footnoteBold, { color: colors.foreground }]}>
                {toast.action.label}
              </Text>
            </PressableChunk>
          )}
        </Chunk>
      </Pressable>
    </Animated.View>
  );
}

/**
 * Lucide's own geometry, at lucide's own stroke, for the same reason the
 * easings are copied rather than retuned: the web draws these three icons and
 * two hand-drawn approximations of them would be two products.
 */
function Icon({ variant, colors }: { variant: Variant; colors: Palette }) {
  const stroke =
    variant === 'success'
      ? colors.calories
      : variant === 'error'
        ? colors.destructive
        : colors.mutedForeground;

  return (
    <Svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {variant === 'error' ? (
        <>
          <Path d="M15.312 2a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586l-4.688-4.688A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2z" />
          <Path d="m15 9-6 6" />
          <Path d="m9 9 6 6" />
        </>
      ) : (
        <>
          <Circle cx={12} cy={12} r={10} />
          {variant === 'success' ? (
            <Path d="m9 12 2 2 4-4" />
          ) : (
            <>
              <Path d="M12 16v-4" />
              <Path d="M12 8h.01" />
            </>
          )}
        </>
      )}
    </Svg>
  );
}

const styles = StyleSheet.create({
  overlay: {
    paddingHorizontal: 16,
    gap: 4,
    // Only the top of the screen is a strip; the rest of the absolute fill is
    // there to hold it and nothing else.
    justifyContent: 'flex-start',
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 2,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  // 600, as the web's `[data-sonner-toast]` block sets. `flex: 1` so a long
  // message wraps inside the card rather than pushing its own edge off screen.
  text: { flex: 1, fontFamily: font.semibold },
  /*
   * A chunky pill, at `chunk-sm` depth rather than the toast's own 5. It sits
   * on a card that is already lifted off the screen, and a second full-depth
   * ledge inside the first reads as a button floating away from the thing it
   * belongs to.
   */
  action: { paddingHorizontal: 12, paddingVertical: 5, borderWidth: 2, borderRadius: 999 },
});
