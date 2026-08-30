/**
 * The arithmetic a logged item is not allowed to fail.
 *
 * Every calorie in this app is an estimate, and that is fine — the whole
 * product is built on saying so. What is not fine is an estimate that
 * contradicts itself. An item carrying 25g of fat and 40g of carbohydrate is
 * holding at least 400 kcal whatever number sits in its `kcal` field, and an
 * item weighing 70g cannot be carrying 73g of macronutrients at all. When
 * either is true the day's total is not merely uncertain, it is wrong in a way
 * nobody can see: the macros look right, the calories look plausible, and the
 * two cannot both be true.
 *
 * This is the one place in the log where accuracy is a matter of arithmetic
 * rather than of judgement, so it is the one place that can be fixed without
 * asking anybody anything.
 *
 * ---- Three checks, and why they are the only three --------------------------
 *
 * Each one is a bound that physics puts on the numbers, not a guess at what the
 * meal was. In the order they are applied, because each narrows what the next
 * one has to consider:
 *
 *   1. MASS. Protein, carbohydrate and fat are things with weight, and their
 *      weight cannot exceed the weight of the food holding them. When it does,
 *      the macros are wrong — not the calories — and they are scaled down to
 *      fit. This is the only check that touches a macro figure.
 *
 *   2. CEILING. Energy per gram cannot exceed pure fat's, so a weighed item's
 *      calories cannot exceed 9.1 kcal for each of its grams. This is the only
 *      check that lowers a calorie figure, and the only one that acts on the
 *      direction the model's error actually runs in — the photo harness
 *      measured weight at 1.36x of truth, so an over-count is the common way
 *      this app is wrong, and it is the one an unweighed item hides completely.
 *
 *   3. FLOOR. Energy computed from macros is a *lower* bound on energy, so an
 *      item below it is impossible and is raised.
 *
 * The floor and the ceiling can never argue, and the ordering is what
 * guarantees it: after step 1 the macros weigh no more than the food, so the
 * floor is at most 9 kcal per gram — which is under the ceiling of 9.1 by
 * construction. Nothing here can chase its own tail.
 *
 * ---- Why the floor is a floor and not a target ------------------------------
 *
 * Above the macro sum an item is merely unusual rather than impossible —
 * alcohol carries 7 kcal/g and appears in none of the four fields, sugar
 * alcohols and glycerol carry their own, and a dish whose oil went unlisted is
 * over the floor for an honest reason. Snapping those down to the macro sum
 * would invent a diet nobody ate. That is why the upper bound comes from the
 * weight instead, which no unlisted ingredient can argue with: a gin and tonic
 * is over its macro floor and nowhere near 9.1 kcal per gram.
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

/**
 * The most energy a gram of food can carry, in kcal.
 *
 * Pure fat is 8.84 and nothing edible is denser — ethanol is 7, and every other
 * component of food is lighter still or carries nothing at all. 9.1 is that
 * limit with a little room for the rounding in a figure somebody typed, and it
 * is deliberately not tuned any finer: this is meant to catch a decimal point
 * in the wrong place, not to adjudicate a rich dessert.
 */
const MAX_KCAL_PER_G = 9.1;

/**
 * How much heavier than its own food an item's macros may read before they are
 * treated as impossible rather than rounded.
 *
 * Two per cent, which is one gram in fifty — the width of the rounding in a
 * panel written to one decimal place, and nothing like the width of a mistake.
 */
const MASS_TOLERANCE = 1.02;

/** The four macro fields, plus the fiber and the weight that change how they read. */
export interface EnergyBearing {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g?: number | null;
  /**
   * The two panel figures that are parts of a macro rather than macros in their
   * own right. Nothing here reads them for energy; they are scaled alongside
   * the macro holding them so an item cannot end up claiming more saturated fat
   * than fat.
   */
  sat_fat_g?: number | null;
  sugar_g?: number | null;
  /**
   * What the item weighs, when anybody said. Null is common and honest — "a
   * black coffee" has no useful weight — and both bounds that need one simply
   * do not apply to an item without one.
   */
  quantity_g?: number | null;
}

/**
 * Fiber as it should be priced, or zero when the figure cannot be read.
 *
 * A US label counts fiber inside total carbohydrate, an EU label counts it
 * outside, and nothing in an estimate says which convention it was written in.
 * Fiber is also worth about 2 kcal/g rather than 4.
 *
 * Reading fiber as *inside* carbohydrate is the lower of the two answers — it
 * re-prices those grams down from 4 to 2 — so that is the reading taken. Under
 * the other convention the true figure is higher than this, which is exactly
 * what a floor is allowed to be wrong about. Being wrong in the other direction
 * would let this raise a correct number, which it must never do.
 *
 * A fiber figure larger than the carbohydrate it claims to sit inside is not
 * either convention, it is a mistake, and it is ignored rather than trusted.
 */
function readableFiber(item: EnergyBearing, carbs: number): number {
  const fiber = item.fiber_g;
  return fiber !== null && fiber !== undefined && fiber >= 0 && fiber <= carbs ? fiber : 0;
}

/** The least energy these macros can be carrying, in kcal. */
export function energyFloor(item: EnergyBearing): number {
  const protein = Math.max(0, item.protein_g);
  const carbs = Math.max(0, item.carbs_g);
  const fat = Math.max(0, item.fat_g);
  const fiber = readableFiber(item, carbs);

  return (
    protein * ATWATER.protein +
    fat * ATWATER.fat +
    (carbs - fiber) * ATWATER.carbs +
    fiber * ATWATER.fiber
  );
}

/**
 * The most energy this item can be carrying, in kcal, or Infinity when nobody
 * said what it weighs.
 *
 * Weight is the only thing that bounds calories from above, because it is the
 * only claim an unlisted ingredient cannot quietly get around.
 */
export function energyCeiling(item: EnergyBearing): number {
  const grams = item.quantity_g;
  if (grams === null || grams === undefined || !(grams > 0)) return Infinity;
  return grams * MAX_KCAL_PER_G;
}

/**
 * What the macros weigh.
 *
 * Fiber is not added: it sits inside the carbohydrate figure under the reading
 * taken above, and counting it twice would invent grams the item never claimed.
 */
export function macroMass(item: EnergyBearing): number {
  return Math.max(0, item.protein_g) + Math.max(0, item.carbs_g) + Math.max(0, item.fat_g);
}

/** Which impossibility fired. More than one can, and they are applied in this order. */
export type EnergyReason = 'mass' | 'ceiling' | 'floor';

/** What was changed, so a caller can say so rather than move a number in silence. */
export interface EnergyCorrection {
  name: string;
  /** The calorie figure as it arrived. */
  from: number;
  /** The calorie figure as it will be stored. Equal to `from` for a mass-only fix. */
  to: number;
  /** Every bound that was crossed, in the order they were applied. */
  reasons: EnergyReason[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Brings any item its own arithmetic rules out back inside the possible, and
 * leaves the rest exactly as they came.
 *
 * Pure, and deliberately: it is called from `log.ts` so that every write to the
 * nutrition log passes through it — the agent's tools, the REST manual log, a
 * recipe being cooked, a scanned packet — and it is called nowhere else, so
 * there is one answer to what a stored item may look like.
 *
 * Nothing is ever rejected. Refusing to log is the one thing this app does not
 * do, so an impossible item is made possible and written.
 */
export function reconcileEnergy<T extends EnergyBearing & { name: string }>(
  items: T[],
): { items: T[]; corrected: EnergyCorrection[] } {
  const corrected: EnergyCorrection[] = [];

  const out = items.map((item) => {
    const reasons: EnergyReason[] = [];
    let next: T = item;

    /*
     * 1. Mass. Macros that outweigh their own food are the one failure where
     *    the macros are certainly the wrong part, so this is the one place a
     *    macro figure is touched — scaled, not zeroed, because their ratios are
     *    the part the model is good at and only the total was impossible.
     */
    const grams = item.quantity_g;
    const weighed = grams !== null && grams !== undefined && grams > 0;
    const mass = macroMass(item);
    if (weighed && mass > grams * MASS_TOLERANCE) {
      const scale = grams / mass;
      // Fiber rides inside carbohydrate and has to come down with it, or it
      // ends up larger than the carbohydrate holding it — which `energyFloor`
      // would then read as a mistake and ignore, silently re-pricing those
      // grams from 2 kcal back up to 4. Saturated fat and sugar sit inside fat
      // and carbohydrate the same way; nothing reads them for energy, but an
      // item claiming more saturated fat than fat is not a thing to store.
      const inside = (field: 'fiber_g' | 'sat_fat_g' | 'sugar_g') => {
        const value = next[field];
        return value !== null && value !== undefined ? { [field]: round1(value * scale) } : {};
      };
      next = {
        ...next,
        protein_g: round1(Math.max(0, next.protein_g) * scale),
        carbs_g: round1(Math.max(0, next.carbs_g) * scale),
        fat_g: round1(Math.max(0, next.fat_g) * scale),
        ...inside('fiber_g'),
        ...inside('sat_fat_g'),
        ...inside('sugar_g'),
      };
      reasons.push('mass');
    }

    /*
     * 2. Ceiling. Now that the macros fit the food, the food's own weight is
     *    the last word on how much energy can be in it.
     */
    const ceiling = energyCeiling(next);
    if (next.kcal > ceiling) {
      next = { ...next, kcal: round1(ceiling) };
      reasons.push('ceiling');
    }

    /*
     * 3. Floor. Raised to the floor itself rather than to the edge of the
     *    tolerance band: the band exists to decide *whether* the figure is
     *    impossible; once it is, the best available answer is the arithmetic,
     *    not the nearest number that would have squeaked past.
     */
    const floor = energyFloor(next);
    if (next.kcal < floor * TOLERANCE - SLACK_KCAL) {
      next = { ...next, kcal: round1(floor) };
      reasons.push('floor');
    }

    if (reasons.length === 0) return item;
    corrected.push({ name: item.name, from: item.kcal, to: next.kcal, reasons });
    return next;
  });

  return { items: out, corrected };
}
