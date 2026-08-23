/**
 * Deletions, told to the screens that are not doing the deleting.
 *
 * The tabs are mounted all at once and stay mounted, which is what makes
 * switching between them instant and also what makes this necessary: swipe a
 * meal away on Today and the journal — already rendered, three days of
 * conversation scrolled into it — goes on showing the card that logged it. The
 * server marks the stored card, so a relaunch is right; nothing short of one
 * is, because the journal reads its history once and never again.
 *
 * So the smallest possible thing: an id, announced. No state, no context, no
 * provider — there is nothing here to keep in sync, only a moment to pass on,
 * and a store would be a subscription every screen has to remember to unwire.
 *
 * Announced *after* the delete lands rather than when it is asked for. The
 * removal on screen is optimistic and held for four seconds — see
 * `useUndoableRemoval` — and a journal struck through on the strength of a
 * request that then failed would be lying in the other direction.
 */
type Listener = (entryId: string) => void;

const listeners = new Set<Listener>();

/** A food or exercise entry is gone from the server. */
export function entryRemoved(entryId: string) {
  for (const listener of listeners) listener(entryId);
}

/** Hear about it. Returns the unsubscribe, for an effect to return in turn. */
export function onEntryRemoved(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
