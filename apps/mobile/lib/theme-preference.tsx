import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Scheme } from '@/theme';

/**
 * Theme preference.
 *
 * Three states, not two: "system" is the default and follows the OS, and the
 * other two override it. That is a real preference rather than the absence of
 * one — a plain light/dark switch silently pins you to whichever you last
 * tapped and stops tracking sunset.
 *
 * The web keeps this in `localStorage` and paints a class onto `<html>`. There
 * is no document here, so the resolved scheme goes into the same context every
 * component already reads its palette from, and the preference itself is
 * persisted with `AsyncStorage` — not `SecureStore`, which is for things worth
 * encrypting and is slower for it.
 */

export type ThemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'nutrition-theme';

function isPreference(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

interface PreferenceValue {
  preference: ThemePreference;
  setPreference: (next: ThemePreference) => void;
  /** What the preference and the OS resolve to together. */
  scheme: Scheme;
}

const PreferenceContext = createContext<PreferenceValue>({
  preference: 'system',
  setPreference: () => {},
  scheme: 'light',
});

export const useThemePreference = (): PreferenceValue => useContext(PreferenceContext);

export function ThemePreferenceProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme() === 'dark' ? 'dark' : 'light';
  const [preference, setStored] = useState<ThemePreference>('system');

  /*
   * Read once at launch. Until it lands the app follows the OS, which is both
   * the default and the least wrong thing to show for the one frame it takes —
   * guessing the override and then correcting it would flash the wrong palette
   * at everybody who never set one.
   */
  useEffect(() => {
    void AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (isPreference(stored)) setStored(stored);
    });
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    setStored(next);
    // Written without awaiting: the palette should change on the tap, and a
    // storage write that fails is worth less than the frame it would cost.
    void AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  }, []);

  const value = useMemo<PreferenceValue>(
    () => ({
      preference,
      setPreference,
      scheme: preference === 'system' ? system : preference,
    }),
    [preference, setPreference, system],
  );

  return <PreferenceContext.Provider value={value}>{children}</PreferenceContext.Provider>;
}
