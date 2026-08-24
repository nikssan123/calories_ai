import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useNavigation } from 'expo-router';

/**
 * Load again when the reader comes back to this screen.
 *
 * A phone app is mounted once and then lives for weeks. A tab screen fetches on
 * mount and, unless something asks it to, never fetches again — which is
 * invisible for anything the reader changes themselves, and wrong for anything
 * that arrives on its own. The weekly review is the clearest case: it is
 * written on a Monday morning by a pass on the server, and the notification
 * announcing it deep-links to a screen that is already mounted holding last
 * week's answer, or none at all.
 *
 * "Coming back" is two events rather than one, and listening for only the first
 * leaves the app broken in exactly the case the notification creates:
 *
 *  - **Refocus**, when the reader was on another tab. Only ever after a real
 *    blur — `returning` is what keeps the focus that arrives with the mount
 *    silent, since the caller has already loaded by then.
 *  - **Foreground**, when the app was in the background with this screen
 *    already showing. React Navigation never blurred it, so no focus event is
 *    coming; without this half, tapping the notification on a phone last left
 *    on Progress resumes to a stale screen and nothing ever asks the server.
 *
 * Wired to the navigator's own `focus`/`blur` rather than to `useFocusEffect`,
 * whose subscription is torn down and rebuilt whenever the callback changes
 * identity. A caller whose `load` closes over state — the window buttons on
 * Progress — would see that rebuild as a blur and a return, and fetch twice for
 * every press.
 *
 * The foreground half triggers on "has been in the background since we were
 * last active" rather than on `active` itself. iOS raises `inactive` for a
 * control-centre swipe and for the app switcher as well as on the way out, so
 * the simpler test would refetch every time somebody peeked at their
 * notifications and went straight back.
 */
export function useRefreshOnReturn(load: () => void | Promise<unknown>) {
  const navigation = useNavigation();
  const returning = useRef(false);
  const backgrounded = useRef(false);

  useEffect(() => {
    const focus = navigation.addListener('focus', () => {
      if (!returning.current) return;
      returning.current = false;
      void load();
    });
    const blur = navigation.addListener('blur', () => {
      returning.current = true;
    });
    return () => {
      focus();
      blur();
    };
  }, [navigation, load]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'background') {
        backgrounded.current = true;
        return;
      }
      if (state !== 'active' || !backgrounded.current) return;
      backgrounded.current = false;
      // Only for the screen actually on show. A tab that was in the background
      // twice over gets its load from the focus half above, at the moment it is
      // looked at rather than the moment the app was picked up.
      if (navigation.isFocused()) void load();
    });
    return () => subscription.remove();
  }, [navigation, load]);
}
