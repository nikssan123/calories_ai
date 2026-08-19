'use client';

import { useEffect } from 'react';

/** Below this a change is the URL bar collapsing, not a keyboard. */
const KEYBOARD_THRESHOLD_PX = 96;

/**
 * iOS shrinks only the *visual* viewport when the software keyboard opens: the
 * layout viewport — and so `100dvh` — keeps counting the pixels now hidden
 * behind it. In a shell that fills the viewport and never scrolls, that buries
 * the composer and the tail of the conversation under the keyboard with no way
 * to reach them.
 *
 * Publish the covered height as `--keyboard-inset` so the shell can subtract
 * it. Chrome honours `interactive-widget=resizes-content` and resizes the
 * layout viewport itself, which lands here as an inset of ~0 — no double count.
 */
export function KeyboardInset() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const root = document.documentElement;
    let last = -1;

    const apply = () => {
      // offsetTop is folded in: if iOS has shifted the visual viewport down,
      // those pixels are off-screen above and the shell has to give them back.
      const inset = Math.max(
        0,
        Math.round(window.innerHeight - viewport.height - viewport.offsetTop),
      );
      if (inset === last) return;
      last = inset;
      root.style.setProperty('--keyboard-inset', `${inset}px`);
      if (inset > KEYBOARD_THRESHOLD_PX) root.dataset.keyboard = 'open';
      else delete root.dataset.keyboard;
    };

    // iOS can leave the document scrolled after dismissing the keyboard.
    const resetScroll = () => window.scrollTo(0, 0);

    apply();
    viewport.addEventListener('resize', apply);
    viewport.addEventListener('scroll', apply);
    window.addEventListener('orientationchange', apply);
    window.addEventListener('focusout', resetScroll);
    return () => {
      viewport.removeEventListener('resize', apply);
      viewport.removeEventListener('scroll', apply);
      window.removeEventListener('orientationchange', apply);
      window.removeEventListener('focusout', resetScroll);
      root.style.removeProperty('--keyboard-inset');
      delete root.dataset.keyboard;
    };
  }, []);

  return null;
}
