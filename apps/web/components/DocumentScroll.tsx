'use client';

import { useEffect } from 'react';

/**
 * Give the window back to the document while this is mounted.
 *
 * The app shell owns the viewport and never scrolls it — `html` and `body` are
 * fixed height with `overflow: hidden`, and each screen scrolls its own pane.
 * A document is the opposite: it wants the window, so mobile browser chrome
 * can collapse and so the page behaves like a page.
 *
 * `<Landing>` and `<LegalPage>` each had their own copy of this effect, which
 * is exactly why the blog shipped unable to scroll: a third page that is a
 * document had no idea there was an arrangement to opt into. One component
 * now, mounted by every page that is a document rather than a screen.
 */
export function DocumentScroll() {
  useEffect(() => {
    document.documentElement.dataset.scroll = 'document';
    return () => {
      delete document.documentElement.dataset.scroll;
    };
  }, []);
  return null;
}
