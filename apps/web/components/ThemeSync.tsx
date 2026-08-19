'use client';

import { useEffect } from 'react';

/**
 * shadcn's components carry `dark:` refinements, and that variant only fires on
 * a `.dark` class. Nothing else sets one, so mirror the OS preference onto the
 * root element and keep it in sync when the user flips their system theme.
 *
 * First paint is handled by the inline script in the layout; this only keeps it
 * current afterwards.
 */
export function ThemeSync() {
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => document.documentElement.classList.toggle('dark', media.matches);
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, []);

  return null;
}

/** Runs before paint so there is no flash of the wrong theme. */
export const THEME_INIT_SCRIPT = `try{document.documentElement.classList.toggle('dark',window.matchMedia('(prefers-color-scheme: dark)').matches)}catch(e){}`;
