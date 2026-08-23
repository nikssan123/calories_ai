import { describe, expect, it } from 'vitest';
import type { DaySummary, FoodEntry, FoodItemInput, PendingFood } from '@ct/shared';
import { foldPending, pendingEntry, qualityTargetsFor, rollUpDay } from '@ct/shared';

/**
 * The arithmetic an offline client shows people.
 *
 * Tested here rather than on the phone because the phone has no test runner and
 * these are the numbers a user actually reads — the ring, the macro bars, the
 * diet-quality panel. See OFFLINE.md §4.
 *
 * The claim under test throughout is that a pending change produces the same
 * day the server would produce once it arrives. If that ever stops being true,
 * the visible symptom is a total that jumps on sync, and somebody who has
 * watched that happen has no reason to trust either figure again.
 */

const TARGETS = {
  kcal: 2200,
  protein_g: 160,
  carbs_g: 220,
  fat_g: 70,
  is_custom: false,
  source: 'calculated' as const,
};

function items(...specs: Partial<FoodItemInput>[]): FoodItemInput[] {
  return specs.map((spec, i) => ({
    name: spec.name ?? `Item ${i + 1}`,
    quantity_g: spec.quantity_g ?? null,
    quantity_desc: spec.quantity_desc ?? null,
    kcal: spec.kcal ?? 100,
    protein_g: spec.protein_g ?? 10,
    carbs_g: spec.carbs_g ?? 10,
    fat_g: spec.fat_g ?? 5,
    fiber_g: spec.fiber_g ?? null,
    sodium_mg: spec.sodium_mg ?? null,
    sat_fat_g: spec.sat_fat_g ?? null,
    sugar_g: spec.sugar_g ?? null,
  }));
}

function food(overrides: Partial<PendingFood> = {}): PendingFood {
  return {
    id: 'pending-1',
    localDate: '2026-03-15',
    meal: 'lunch',
    description: 'Chicken and rice',
    eatenAt: '2026-03-15T12:00:00.000Z',
    source: 'manual',
    confidence: 'high',
    items: items({ name: 'Chicken', kcal: 330, protein_g: 62, carbs_g: 0, fat_g: 7 }),
    ...overrides,
  };
}

/** A day built the way the API builds one, so the comparisons are like for like. */
function day(entries: FoodEntry[] = []): DaySummary {
  return rollUpDay({
    localDate: '2026-03-15',
    foodEntries: entries,
    exerciseEntries: [],
    targets: TARGETS,
    weight: null,
  });
}

describe('pendingEntry', () => {
  it('sums the totals off the items, as the server will', () => {
    const entry = pendingEntry(
      food({
        items: items(
          { kcal: 330, protein_g: 62, carbs_g: 0, fat_g: 7 },
          { kcal: 240, protein_g: 5, carbs_g: 52, fat_g: 1 },
        ),
      }),
    );

    expect(entry.kcal).toBe(570);
    expect(entry.protein_g).toBe(67);
    expect(entry.carbs_g).toBe(52);
    expect(entry.fat_g).toBe(8);
  });

  it('keeps the client id, so a pending card has a stable identity', () => {
    expect(pendingEntry(food({ id: 'abc' })).id).toBe('abc');
    expect(pendingEntry(food({ id: 'abc' })).items[0]!.entry_id).toBe('abc');
  });

  it('leaves the quality panel null rather than claiming zero', () => {
    const entry = pendingEntry(food());
    expect(entry.fiber_g).toBeNull();
    expect(entry.sodium_mg).toBeNull();
  });

  it('carries a quality figure that was supplied', () => {
    const entry = pendingEntry(food({ items: items({ kcal: 230, fiber_g: 16 }) }));
    expect(entry.fiber_g).toBe(16);
    expect(entry.sugar_g).toBeNull();
  });

  it('has no photo, because a queued meal cannot have uploaded one', () => {
    expect(pendingEntry(food()).photo_id).toBeNull();
  });
});

describe('foldPending — adding', () => {
  it('moves the day total by exactly what was logged', () => {
    const before = day();
    const after = foldPending(before, { added: [food()] });

    expect(before.consumed.kcal).toBe(0);
    expect(after.consumed.kcal).toBe(330);
    expect(after.consumed.protein_g).toBe(62);
    expect(after.food_entries).toHaveLength(1);
  });

  it('lands on the same numbers the server would after it syncs', () => {
    const pending = food();
    const optimistic = foldPending(day(), { added: [pending] });
    // What the API will hold once the queue drains: the same entry, with the
    // ids a database would give it.
    const synced = day([{ ...pendingEntry(pending), id: 'server-uuid' }]);

    expect(optimistic.consumed).toEqual(synced.consumed);
    expect(optimistic.quality.coverage).toBe(synced.quality.coverage);
    expect(optimistic.net_kcal).toBe(synced.net_kcal);
  });

  it('ignores a meal queued for another day', () => {
    const after = foldPending(day(), { added: [food({ localDate: '2026-03-14' })] });
    expect(after.consumed.kcal).toBe(0);
    expect(after.food_entries).toHaveLength(0);
  });

  it('adds several without losing any', () => {
    const after = foldPending(day(), {
      added: [food({ id: 'a' }), food({ id: 'b' }), food({ id: 'c', localDate: '2026-03-14' })],
    });
    expect(after.food_entries.map((e) => e.id)).toEqual(['a', 'b']);
    expect(after.consumed.kcal).toBe(660);
  });

  it('drags the quality coverage down when the new meal has no figures', () => {
    const measured = pendingEntry(
      food({ id: 'measured', items: items({ kcal: 500, fiber_g: 10 }) }),
    );
    const before = day([measured]);
    expect(before.quality.coverage).toBe(1);

    // Half the day's calories now come from something nobody estimated, and
    // the panel has to say so rather than reporting 10g as a day's fiber.
    const after = foldPending(before, {
      added: [food({ id: 'guessed', items: items({ kcal: 500 }) })],
    });
    expect(after.quality.coverage).toBe(0.5);
    expect(after.quality.fiber_g).toBe(10);
  });

  it('keeps the day’s targets rather than recomputing them', () => {
    const after = foldPending(day(), { added: [food()] });
    expect(after.targets).toEqual(TARGETS);
    expect(after.quality.targets).toEqual(qualityTargetsFor(TARGETS.kcal));
  });
});

describe('foldPending — removing', () => {
  const logged = pendingEntry(food({ id: 'logged', items: items({ kcal: 600, fiber_g: 8 }) }));
  const other = pendingEntry(food({ id: 'other', items: items({ kcal: 400 }) }));

  it('takes the calories back off the day', () => {
    const after = foldPending(day([logged, other]), { removed: ['logged'] });
    expect(after.consumed.kcal).toBe(400);
    expect(after.food_entries.map((e) => e.id)).toEqual(['other']);
  });

  it('recomputes coverage instead of leaving it speaking for a deleted meal', () => {
    const before = day([logged, other]);
    expect(before.quality.coverage).toBe(0.6);

    // The only measured meal is the one that left, so nothing is measured now —
    // and the fiber total goes with it rather than surviving as an orphan.
    const after = foldPending(before, { removed: ['logged'] });
    expect(after.quality.coverage).toBe(0);
    expect(after.quality.fiber_g).toBeNull();
  });

  it('ignores an id that is not on this day', () => {
    const after = foldPending(day([logged]), { removed: ['somewhere-else'] });
    expect(after.food_entries).toHaveLength(1);
  });

  it('can empty a day completely', () => {
    const after = foldPending(day([logged, other]), { removed: ['logged', 'other'] });
    expect(after.consumed.kcal).toBe(0);
    // Nothing logged is full coverage of nothing, not a gap.
    expect(after.quality.coverage).toBe(1);
  });
});

describe('foldPending — correcting', () => {
  const logged = pendingEntry(food({ id: 'logged', items: items({ kcal: 600 }) }));

  it('re-sums the totals from the replacement items', () => {
    const after = foldPending(day([logged]), {
      patched: [{ entryId: 'logged', items: items({ kcal: 900, protein_g: 40 }) }],
    });
    expect(after.consumed.kcal).toBe(900);
    expect(after.consumed.protein_g).toBe(40);
    expect(after.food_entries[0]!.items).toHaveLength(1);
  });

  it('moves a meal between slots without touching its numbers', () => {
    const after = foldPending(day([logged]), {
      patched: [{ entryId: 'logged', meal: 'dinner' }],
    });
    expect(after.food_entries[0]!.meal).toBe('dinner');
    expect(after.consumed.kcal).toBe(600);
  });

  it('tells "leave the note alone" apart from "clear it"', () => {
    const noted = { ...logged, note: 'with extra chilli' };

    const untouched = foldPending(day([noted]), { patched: [{ entryId: 'logged' }] });
    expect(untouched.food_entries[0]!.note).toBe('with extra chilli');

    const cleared = foldPending(day([noted]), { patched: [{ entryId: 'logged', note: null }] });
    expect(cleared.food_entries[0]!.note).toBeNull();
  });

  it('ignores a patch for an entry that is not here', () => {
    const after = foldPending(day([logged]), {
      patched: [{ entryId: 'gone', items: items({ kcal: 9999 }) }],
    });
    expect(after.consumed.kcal).toBe(600);
  });
});

describe('foldPending — nothing to do', () => {
  it('returns the very same object when there are no edits', () => {
    const before = day([pendingEntry(food())]);
    expect(foldPending(before, {})).toBe(before);
    expect(foldPending(before, { added: [], removed: [], patched: [] })).toBe(before);
  });

  it('applies an add, a delete and a patch together', () => {
    const a = pendingEntry(food({ id: 'a', items: items({ kcal: 300 }) }));
    const b = pendingEntry(food({ id: 'b', items: items({ kcal: 400 }) }));

    const after = foldPending(day([a, b]), {
      added: [food({ id: 'c', items: items({ kcal: 200 }) })],
      removed: ['a'],
      patched: [{ entryId: 'b', items: items({ kcal: 450 }) }],
    });

    expect(after.food_entries.map((e) => e.id)).toEqual(['b', 'c']);
    expect(after.consumed.kcal).toBe(650);
  });
});
