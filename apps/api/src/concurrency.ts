/**
 * A bounded worker pool over a list.
 *
 * Written for the scheduler, which is the only thing in this codebase that
 * holds a list of every account and does something slow to each one. A weekly
 * review is roughly forty seconds of model time; a thousand of them in a `for`
 * loop is eleven hours, which is not a Monday morning email — it is an email
 * that arrives on Monday evening for the people at the end of the list, and on
 * Tuesday once there are three thousand of them.
 *
 * A fixed number of workers pulling from a shared cursor, rather than
 * `Promise.all` over the whole list with a semaphore. Two reasons, both about
 * the shape of the caller: the number of promises in flight is the width and
 * not the length, so a hundred thousand accounts costs a hundred thousand
 * *items* rather than a hundred thousand pending promises; and the width is
 * clamped to the list, so a pass over three users does not start eight workers
 * to watch five of them return immediately.
 *
 * **Every item is attempted.** A throw from `fn` is caught, remembered, and
 * rethrown once the pool has drained — never allowed to abandon the other
 * workers mid-list. That is the property a scheduler pass needs and the one
 * `Promise.all` does not have: its rejection settles the moment the first
 * worker throws, while the rest keep running with nobody waiting on them.
 * Callers here handle their own per-item failures anyway, so this is a
 * backstop rather than a mechanism.
 */
export async function forEachConcurrent<T>(
  items: readonly T[],
  width: number,
  fn: (item: T, index: number) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;

  const workers = Math.max(1, Math.min(Math.floor(width) || 1, items.length));
  let cursor = 0;
  let failure: unknown;
  let failed = false;

  const worker = async (): Promise<void> => {
    for (;;) {
      // `cursor++` is atomic here in the only sense that matters: there is no
      // await between the read and the write, and this runtime is single
      // threaded, so no two workers can be handed the same index.
      const index = cursor++;
      if (index >= items.length) return;

      try {
        await fn(items[index]!, index);
      } catch (error) {
        if (!failed) {
          failed = true;
          failure = error;
        }
      }
    }
  };

  await Promise.all(Array.from({ length: workers }, () => worker()));
  if (failed) throw failure;
}
