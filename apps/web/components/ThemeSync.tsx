'use client';

import { useEffect, useState } from 'react';

/**
 * Theme preference.
 *
 * Three states, not two: "system" is the default and follows the OS, and the
 * other two override it. That distinction has to survive into the DOM, because
 * the stylesheet keys off it — `.dark` paints the dark palette, `.light` exists
 * purely to block the `prefers-color-scheme` media query for someone who wants
 * light on a dark machine. Getting those classes wrong is how a page ends up
 * rendering one theme's text on the other theme's background, so the mapping
 * lives in exactly one function that both the boot script and React call.
 */

export type ThemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'nutrition-theme';

function isPreference(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

function read(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isPreference(stored) ? stored : 'system';
  } catch {
    // Private mode, or storage disabled. Following the OS is the right default.
    return 'system';
  }
}

function applyToDocument(preference: ThemePreference): void {
  const root = document.documentElement;
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const dark = preference === 'dark' || (preference === 'system' && systemDark);

  root.classList.toggle('dark', dark);
  root.classList.toggle('light', preference === 'light');
  // Native UI the page does not draw — the date picker, form controls, the
  // scrollbar gutter — reads this and nothing else.
  root.style.colorScheme = dark ? 'dark' : 'light';
}

/**
 * A preference is global to the document, so the components that care about it
 * share one value rather than each holding a copy that can drift. Small enough
 * not to want a context provider around the whole tree.
 */
const listeners = new Set<(preference: ThemePreference) => void>();
let current: ThemePreference | null = null;

export function setTheme(preference: ThemePreference): void {
  current = preference;
  try {
    localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // Not being able to remember it is not a reason to refuse to apply it.
  }
  applyToDocument(preference);
  for (const listener of listeners) listener(preference);
}

/**
 * The stored preference. Starts at "system" on the server and during the first
 * client render, then corrects itself — reading localStorage while rendering
 * would make the markup depend on it and mismatch what the server sent.
 */
export function useTheme(): {
  theme: ThemePreference;
  setTheme: (preference: ThemePreference) => void;
} {
  const [theme, set] = useState<ThemePreference>('system');

  useEffect(() => {
    current ??= read();
    set(current);
    listeners.add(set);
    return () => {
      listeners.delete(set);
    };
  }, []);

  return { theme, setTheme };
}

/**
 * Keeps the document in step with the OS while the preference is "system".
 * First paint is handled by THEME_INIT_SCRIPT; this only maintains it.
 */
export function ThemeSync() {
  useEffect(() => {
    current ??= read();
    applyToDocument(current);

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      // An explicit choice outranks the OS flipping underneath it.
      if (current === 'system') applyToDocument('system');
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  return null;
}

/**
 * Runs before first paint so there is no flash of the wrong theme. Deliberately
 * duplicates `applyToDocument` rather than importing it: this string is inlined
 * into <head> and executes before any bundle has loaded.
 */
export const THEME_INIT_SCRIPT = `try{
  var p = localStorage.getItem('${STORAGE_KEY}');
  if (p !== 'light' && p !== 'dark' && p !== 'system') p = 'system';
  var d = p === 'dark' || (p === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  var r = document.documentElement;
  r.classList.toggle('dark', d);
  r.classList.toggle('light', p === 'light');
  r.style.colorScheme = d ? 'dark' : 'light';
}catch(e){}`;
