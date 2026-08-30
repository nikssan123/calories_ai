/**
 * The arithmetic a logged item is not allowed to fail.
 *
 * Every calorie in this app is an estimate, and that is fine — the whole
 * product is built on saying so. What is not fine is an estimate that
 * contradicts itself. An item carrying 25g of fat and 40g of carbohydrate is
 * holding at least 400 kcal whatever number sits in its `kcal` field, and when
 * that field says 300 the day's total is not merely uncertain, it is wrong in a
 * way nobody can see: the macros look right, the calories look plausible, and
 * the two cannot both be true.
 *
 * This is the one place in the log where accuracy is a matter of arithmetic
 * rather than of judgement, so it is the one place that can be fixed without
 * asking anybody anything.
 *
 * ---- Why a floor and not a target ------------------------------------------
 *
 * Energy computed from macros is a *lower* bound on energy and never an upper
 * one, and the asymmetry is the whole design. Below the floor an item is
 * impossible and the figure is raised. Above it an item is merely unusual —
 * alcohol carries 7 kcal/g and appears in none of the four fields, sugar
 * alcohols and glycerol carry their own, and a dish whose oil went unlisted is
 * over the floor for an honest reason. Snapping those down to the macro sum
 * would invent a diet nobody ate.
 *
 * So this only ever moves a number upward, and only when the number was not
 * possible. An under-count is also the failure that matters: somebody tracking
 * a deficit against a day that quietly lost 300 kcal is being told they are on
 * course when they are not.
 */

/**
 * Atwater's general factors, in kcal per gram.
 *
 * These are the same coefficients every nutrition label in the world is
 * computed with, which is what makes the check safe to apply to label data as
 * well as to an estimate.
 */
export const ATWATER = { protein: 4, carbs: 4, fat: 9, fiber: 2 } as const;

/**
 * How far under the floor an item may sit before it is treated as impossible.
 *
 * Not zero, and not close to it. The factors above are rounded conventions, and
 * real foods sit a few per cent under them: olive oil is 884 kcal per 100g
 * against a computed 900, butter 717 against 733, almonds 579 against 597 —
 * fat is nearer 8.8 kcal/g than 9, and a nut is not digested completely.
 *
 * Fifteen per cent clears all of those with room and still catches what this
 * exists for, because a real mistake is not a near miss. The case that prompted
 * it — a creamy pasta written down at 300 kcal against 25g of fat and 40g of
 * carbohydrate — sits 31% under its floor.
 */
const TOLERANCE = 0.85;

/**
 * Absolute slack underneath the proportional band, for items small enough that
 * a percentage is not a meaningful amount of anything. A 20 kcal item priced at
 * 17 is not a bug worth rewriting a log over.
 */
const SLACK_KCAL = 10;

/** The four macro fields, plus the fiber that changes how carbohydrate reads. */
export interface EnergyBearing {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g?: number | null;
}

/**
 * The least energy these macros can be carrying, in kcal.
 *
 * Fiber is the only subtlety, and it is a real one: a US label counts fiber
 * inside total carbohydrate, an EU label counts it outside, and nothing in an
 * estimate says which convention it was written in. Fiber is also worth about
 * 2 kcal/g rather than 4.
 *
 * Reading fiber as *inside* carbohydrate is the lower of the two answers — it
 * re-prices those grams down from 4 to 2 — so that is the reading taken. Under
 * the other convention the true figure is higher than this, which is exactly
 * what a floor is allowed to be wrong about. Being wrong in the other direction
 * would let this function raise a correct number, which it must never do.
 *
 * A fiber figure larger than the carbohydrate it claims to sit inside is not
 * either convention, it is a mistake, and it is ignored rather than trusted.
 */
export function energyFloor(item: EnergyBearing): number {
  const protein = Math.max(0, item.protein_g);
  const carbs = Math.max(0, item.carbs_g);
  const fat = Math.max(0, item.fat_g);
  const fiber = item.fiber_g !== null && item.fiber_g !== undefined && item.fiber_g >= 0 && item.fiber_g <= carbs
    ? item.fiber_g
    : 0;

  return (
    protein * ATWATER.protein +
    fat * ATWATER.fat +
    (carbs - fiber) * ATWATER.carbs +
    fiber * ATWATER.fiber
  );
}

/** What was changed, so a caller can say so rather than move a number in silence. */
export interface EnergyCorrection {
  name: string;
  /** The figure as it arrived. */
  from: number;
  /** The floor it was raised to. */
  to: number;
}

/**
 * Raises any item whose calories its own macros rule out, and leaves the rest
 * exactly as they came.
 *
 * Pure, and deliberately: it is called from `log.ts` so that every write to the
 * nutrition log passes through it — the agent's tools, the REST manual log, a
 * recipe being cooked, a scanned packet — and it is called nowhere else, so
 * there is one answer to what a stored item may look like.
 */
export function reconcileEnergy<T extends EnergyBearing & { name: string }>(
  items: T[],
): { items: T[]; corrected: EnergyCorrection[] } {
  const corrected: EnergyCorrection[] = [];
  const out = items.map((item) => {
    const floor = energyFloor(item);
    if (item.kcal >= floor * TOLERANCE - SLACK_KCAL) return item;

    // Raised to the floor itself rather than to the edge of the tolerance band.
    // The band exists to decide *whether* the figure is impossible; once it is,
    // the best available answer is the arithmetic, not the nearest number that
    // would have squeaked past.
    const to = Math.round(floor * 10) / 10;
    corrected.push({ name: item.name, from: item.kcal, to });
    return { ...item, kcal: to };
  });

  return { items: out, corrected };
}
