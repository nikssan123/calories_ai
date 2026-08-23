import { useEffect, type RefObject } from 'react';
import type { ScrollView } from 'react-native';
import { useNavigation } from 'expo-router';

/**
 * Tapping the tab you are already on takes you back to the top.
 *
 * Standard on both platforms and expected by everyone who has used a phone,
 * which is exactly why its absence is never reported: people simply scroll, and
 * conclude that this app is one of the ones that does not do it.
 *
 * A single tap on the *already selected* tab, not the double-tap the plan asked
 * for. Double-tapping is the gesture for something a single tap cannot already
 * express — and here a single tap on the current tab means nothing at all,
 * which makes it free. Reserving it for a second press would be inventing a
 * rule the platform does not have.
 *
 * Wired through `tabPress` rather than through the tab bar, which does not know
 * what any screen is scrolling and should not have to. The bar emits, the
 * screen listens.
 */
export function useScrollToTop(ref: RefObject<ScrollView | null>) {
  const navigation = useNavigation();

  useEffect(() => {
    /*
     * `tabPress` fires on every tab in the bar, and the event's target is the
     * route that was pressed — so the guard is not "am I focused?" but "was it
     * *my* tab?". Those differ for exactly one frame during a switch, which is
     * the frame that would otherwise scroll the screen you are leaving.
     */
    const stop = navigation.addListener('tabPress' as never, () => {
      if (!navigation.isFocused()) return;
      ref.current?.scrollTo({ y: 0, animated: true });
    });
    return stop;
  }, [navigation, ref]);
}
