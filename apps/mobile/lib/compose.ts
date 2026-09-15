/**
 * "Say what you ate", asked for from somewhere that isn't the journal.
 *
 * Today's strip opens the journal with the keyboard already up. The request is
 * held until the composer is on screen to take it — the tab it lives on may be
 * mid-glide, or not have been focused yet this launch — and is spent once.
 */
let pending = false;
const listeners = new Set<() => void>();

export function requestCompose() {
  pending = true;
  listeners.forEach((listener) => listener());
}

/** Takes the request if there is one. The composer calls it when it can focus. */
export function takeCompose(): boolean {
  const had = pending;
  pending = false;
  return had;
}

export function onComposeRequest(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
