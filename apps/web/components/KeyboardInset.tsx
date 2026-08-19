'use client';

import { useEffect } from 'react';

/** Below this a change is the URL bar collapsing, not a keyboard. */
const KEYBOARD_THRESHOLD_PX = 96;

/** Long enough to outlast the keyboard's open animation and its resize burst. */
const SETTLE_MS = 120;

/** What the keyboard opens for — anything else was not being typed into. */
const EDITABLE = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';

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
    let inset = -1;
    let settle = 0;

    /**
     * A field is scrolled into view when it gains focus — but that happens
     * before the keyboard opens, so a field that was perfectly visible ends up
     * behind it with nothing to pull it back. Only the pages that scroll can
     * act on this, which is why it lives here rather than in any one of them.
     */
    const revealFocused = () => {
      const focused = document.activeElement;
      if (!(focused instanceof HTMLElement) || !focused.matches(EDITABLE)) return;
      const box = focused.getBoundingClientRect();
      if (box.top >= 0 && box.bottom <= window.innerHeight - inset) return;
      focused.scrollIntoView({ block: 'center', behavior: 'smooth' });
    };

    // The keyboard animates open over several resizes; wait for the last one so
    // the reveal measures against the settled inset instead of a partial one.
    const scheduleReveal = () => {
      window.clearTimeout(settle);
      settle = window.setTimeout(revealFocused, SETTLE_MS);
    };

    const apply = () => {
      // offsetTop is folded in: if iOS has shifted the visual viewport down,
      // those pixels are off-screen above and the shell has to give them back.
      const next = Math.max(
        0,
        Math.round(window.innerHeight - viewport.height - viewport.offsetTop),
      );
      if (next === inset) return;
      inset = next;
      root.style.setProperty('--keyboard-inset', `${inset}px`);
      if (inset > KEYBOARD_THRESHOLD_PX) {
        root.dataset.keyboard = 'open';
        scheduleReveal();
      } else {
        delete root.dataset.keyboard;
      }
    };

    // Moving between fields while the keyboard is already up does not resize
    // anything, so the browser's own scroll handles it — but it measures the
    // shrunk viewport inconsistently across iOS versions. This is idempotent:
    // a field that is already visible costs nothing.
    const onFocusIn = () => {
      if (inset > KEYBOARD_THRESHOLD_PX) scheduleReveal();
    };

    // iOS can leave the document scrolled after dismissing the keyboard.
    const resetScroll = () => window.scrollTo(0, 0);

    apply();
    viewport.addEventListener('resize', apply);
    viewport.addEventListener('scroll', apply);
    window.addEventListener('orientationchange', apply);
    window.addEventListener('focusin', onFocusIn);
    window.addEventListener('focusout', resetScroll);
    return () => {
      window.clearTimeout(settle);
      viewport.removeEventListener('resize', apply);
      viewport.removeEventListener('scroll', apply);
      window.removeEventListener('orientationchange', apply);
      window.removeEventListener('focusin', onFocusIn);
      window.removeEventListener('focusout', resetScroll);
      root.style.removeProperty('--keyboard-inset');
      delete root.dataset.keyboard;
    };
  }, []);

  return null;
}
