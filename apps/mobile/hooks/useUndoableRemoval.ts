import { useCallback, useEffect, useRef } from 'react';
import { TOAST_LIFETIME_MS, useToast } from '@/components/Toast';

interface Removal {
  /**
   * Actually delete it. Called once, four seconds late, or immediately if the
   * screen goes first — never at all if the reader undoes. It owns its own
   * failure reporting, because by the time it runs the row it was about is
   * long gone from the screen.
   */
  commit: () => void;
  /** Put it back exactly as it was. Called instead of `commit`, never after. */
  restore: () => void;
}

/**
 * Remove something now, and mean it in four seconds.
 *
 * This is why the app has no confirmation dialogs. A confirm taxes everybody a
 * tap to protect the rare mistake and interrupts what they were doing to ask
 * whether they meant it. Acting at once and offering the reversal is faster in
 * the common case and safer in the rare one, because it also catches the
 * mis-tap nobody noticed until the row had already gone.
 *
 * The trick is that nothing is deleted during the window. The row leaves the
 * screen at once and the request is *held*, so undo is a `clearTimeout` and a
 * state restore rather than a re-creation. That matters more than it sounds:
 * the API's nearest thing to an undo clones an entry to *now*, which would
 * bring a meal back at the wrong time and, past midnight, on the wrong day.
 * Holding the delete keeps the original id, the original timestamp and the
 * original day, and asks nothing new of the server.
 *
 * The window is the toast's own lifetime, because the toast *is* the offer:
 * holding the reversal open a second longer than the button saying so would
 * mean a delete that could still be undone by nobody.
 *
 * If the app dies inside the window the delete never runs and the entry stays.
 * Of the two ways this can fail, leaving something logged is the recoverable
 * one.
 */
export function useUndoableRemoval() {
  const toast = useToast();
  const pending = useRef(new Map<number, { run: () => void; timer: ReturnType<typeof setTimeout> }>());
  const nextId = useRef(0);

  /*
   * Anything still held when the screen goes has to happen. The row left the
   * reader's view the moment they swiped, and a delete that quietly did not
   * run would put it back at the next load — which reads as the app losing
   * the instruction rather than as a grace period they walked out of.
   */
  useEffect(() => {
    const held = pending.current;
    return () => {
      for (const { run, timer } of held.values()) {
        clearTimeout(timer);
        run();
      }
      held.clear();
    };
  }, []);

  return useCallback(
    (message: string, { commit, restore }: Removal) => {
      const id = nextId.current++;
      const run = () => {
        pending.current.delete(id);
        commit();
      };
      const timer = setTimeout(run, TOAST_LIFETIME_MS);
      pending.current.set(id, { run, timer });

      toast.success(message, {
        label: 'Undo',
        run: () => {
          /*
           * Gone from the map means the delete has already gone out — the
           * timer fired, or the screen was left. The offer is stale, and the
           * safe answer to a stale offer is to do nothing rather than to
           * re-create something the server no longer has.
           */
          const held = pending.current.get(id);
          if (!held) return;
          clearTimeout(held.timer);
          pending.current.delete(id);
          restore();
        },
      });
    },
    [toast],
  );
}
