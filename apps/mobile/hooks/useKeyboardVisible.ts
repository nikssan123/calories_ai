import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * Whether the software keyboard is on screen.
 *
 * Needed because the app draws its own tab bar, and `tabBarHideOnKeyboard` is a
 * feature of the *default* one — pass `tabBar` and every behaviour that came
 * with the component you replaced is now yours to implement. A six-tab bar
 * sitting under an open keyboard is invisible either way; what it actually
 * costs is the height it goes on reserving, which is exactly where the composer
 * needs to be.
 *
 * iOS reports `Will` before the animation and Android only ever `Did`, so both
 * pairs are listened for rather than picking one and letting the other platform
 * update a frame late.
 */
export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const show = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hide = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const shown = Keyboard.addListener(show, () => setVisible(true));
    const hidden = Keyboard.addListener(hide, () => setVisible(false));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);

  return visible;
}
