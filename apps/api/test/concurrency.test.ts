import { describe, expect, it } from 'vitest';
import { forEachConcurrent } from '../src/concurrency.ts';

/**
 * The worker pool the scheduler runs its passes over. Small enough to test for
 * what it actually promises: every item is attempted, no item twice, and never
 * more than `width` of them in the air at once.
 */

/** Resolves after `ms`, or on the next turn for 0. */
const after = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe('forEachConcurrent', () => {
  it('visits every item exactly once', async () => {
    const items = Array.from({ length: 50 }, (_, i) => i);
    const seen: number[] = [];

    await forEachConcurrent(items, 7, async (item) => {
      await after(1);
      seen.push(item);
    });

    expect(seen).toHaveLength(50);
    expect([...seen].sort((a, b) => a - b)).toEqual(items);
  });

  it('never runs more than the width at once', async () => {
    let live = 0;
    let peak = 0;

    await forEachConcurrent(Array.from({ length: 40 }, (_, i) => i), 6, async () => {
      live += 1;
      peak = Math.max(peak, live);
      await after(2);
      live -= 1;
    });

    expect(peak).toBe(6);
    expect(live).toBe(0);
  });

  it('is actually parallel', async () => {
    // Twelve items of ten milliseconds each. Serially that is 120ms; four at a
    // time it is three rounds, so anything near the serial figure means the
    // pool is not doing its job.
    const started = Date.now();
    await forEachConcurrent(Array.from({ length: 12 }, (_, i) => i), 4, () => after(10));

    expect(Date.now() - started).toBeLessThan(90);
  });

  /**
   * The property `Promise.all` does not have. Its rejection settles on the
   * first throw while the other workers carry on unwatched — which for a
   * scheduler pass means the tick returns and half the accounts are still being
   * written to by nobody.
   */
  it('finishes the whole list even when an item throws, then reports it', async () => {
    const done: number[] = [];

    const failure = forEachConcurrent([1, 2, 3, 4, 5, 6], 2, async (item) => {
      await after(1);
      if (item === 2) throw new Error('this one is bad');
      done.push(item);
    });

    await expect(failure).rejects.toThrow('this one is bad');
    expect(done.sort()).toEqual([1, 3, 4, 5, 6]);
  });

  it('reports the first failure when several throw', async () => {
    const failure = forEachConcurrent([1, 2], 1, async (item) => {
      throw new Error(`item ${item}`);
    });

    await expect(failure).rejects.toThrow('item 1');
  });

  it('does nothing, and starts nobody, for an empty list', async () => {
    let calls = 0;
    await forEachConcurrent([], 8, async () => {
      calls += 1;
    });
    expect(calls).toBe(0);
  });

  it('does not start more workers than there are items', async () => {
    let peak = 0;
    let live = 0;

    await forEachConcurrent([1, 2], 64, async () => {
      live += 1;
      peak = Math.max(peak, live);
      await after(2);
      live -= 1;
    });

    expect(peak).toBe(2);
  });

  it('treats a nonsense width as one rather than as none', async () => {
    const seen: number[] = [];
    await forEachConcurrent([1, 2, 3], 0, async (item) => {
      seen.push(item);
    });
    // The alternative — a width of zero starting zero workers — is a pass that
    // silently does nothing at all, which is the worst available failure.
    expect(seen).toEqual([1, 2, 3]);
  });
});
