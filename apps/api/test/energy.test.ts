import { describe, expect, it } from 'vitest';
import { energyCeiling, energyFloor, macroMass, reconcileEnergy } from '../src/services/energy.ts';

/**
 * The floor, and the things it must not trip over.
 *
 * Half of these cases are real foods with their published figures, because the
 * only way this check earns its place is by never firing on one. A rule that
 * rewrites olive oil is worse than no rule at all.
 */

const item = (over: Partial<Parameters<typeof energyFloor>[0]> & { name?: string } = {}) => ({
  name: 'Thing',
  kcal: 100,
  protein_g: 0,
  carbs_g: 0,
  fat_g: 0,
  ...over,
});

describe('energyFloor', () => {
  it('is the Atwater sum of the macros', () => {
    expect(energyFloor(item({ protein_g: 10, carbs_g: 20, fat_g: 5 }))).toBe(40 + 80 + 45);
  });

  it('re-prices fiber down from 4 to 2 kcal, reading it as part of the carbohydrate', () => {
    const withFiber = energyFloor(item({ carbs_g: 30, fiber_g: 10 }));
    // 20g of starch at 4 plus 10g of fiber at 2, rather than 30g at 4.
    expect(withFiber).toBe(80 + 20);
    expect(withFiber).toBeLessThan(energyFloor(item({ carbs_g: 30 })));
  });

  it('ignores a fiber figure larger than the carbohydrate holding it', () => {
    // Not either labelling convention — a mistake — so it buys no discount.
    expect(energyFloor(item({ carbs_g: 5, fiber_g: 40 }))).toBe(20);
  });

  it('ignores negative macros rather than crediting energy against them', () => {
    expect(energyFloor(item({ protein_g: -10, carbs_g: 20 }))).toBe(80);
  });
});

describe('reconcileEnergy', () => {
  it('leaves an item alone when its calories are possible', () => {
    const items = [item({ name: 'Rice', kcal: 234, protein_g: 4.9, carbs_g: 50.4, fat_g: 0.5 })];
    const { items: out, corrected } = reconcileEnergy(items);

    expect(corrected).toEqual([]);
    expect(out[0]).toBe(items[0]);
  });

  it('raises an item its own macros rule out', () => {
    // 25g of fat and 40g of carbohydrate is 385 kcal before anything else.
    const { items, corrected } = reconcileEnergy([
      item({ name: 'Creamy pasta', kcal: 300, protein_g: 12, carbs_g: 40, fat_g: 25 }),
    ]);

    expect(items[0]!.kcal).toBe(433);
    expect(corrected).toEqual([{ name: 'Creamy pasta', from: 300, to: 433, reasons: ['floor'] }]);
  });

  it('only ever raises, because macros are a floor on energy and not a target', () => {
    // A gin and tonic: alcohol carries 7 kcal/g and appears in none of the four
    // fields, so the calories genuinely exceed what the macros account for.
    const { items, corrected } = reconcileEnergy([
      item({ name: 'Gin and tonic', kcal: 170, protein_g: 0, carbs_g: 16, fat_g: 0 }),
    ]);

    expect(items[0]!.kcal).toBe(170);
    expect(corrected).toEqual([]);
  });

  it.each([
    ['Olive oil', 884, 0, 0, 100],
    ['Butter', 717, 0.85, 0.06, 81],
    ['Chicken breast', 165, 31, 0, 3.6],
    ['Cooked white rice', 130, 2.7, 28, 0.3],
  ])('does not fire on %s at its published figures', (name, kcal, protein, carbs, fat) => {
    const { corrected } = reconcileEnergy([
      item({ name, kcal, protein_g: protein, carbs_g: carbs, fat_g: fat }),
    ]);
    expect(corrected).toEqual([]);
  });

  it('does not fire on almonds, whose measured energy is under the arithmetic', () => {
    const { corrected } = reconcileEnergy([
      item({ name: 'Almonds', kcal: 579, protein_g: 21, carbs_g: 22, fat_g: 50, fiber_g: 12.5 }),
    ]);
    expect(corrected).toEqual([]);
  });

  it('leaves a small item alone where a percentage is not a meaningful amount', () => {
    const { corrected } = reconcileEnergy([
      item({ name: 'Splash of milk', kcal: 17, protein_g: 1, carbs_g: 1.5, fat_g: 1 }),
    ]);
    expect(corrected).toEqual([]);
  });

  it('corrects one item without touching the rest of the meal', () => {
    const { items, corrected } = reconcileEnergy([
      item({ name: 'Chicken', kcal: 330, protein_g: 62, carbs_g: 0, fat_g: 7.2 }),
      item({ name: 'Peanut butter', kcal: 90, protein_g: 8, carbs_g: 7, fat_g: 25 }),
    ]);

    expect(items[0]!.kcal).toBe(330);
    expect(items[1]!.kcal).toBe(285);
    expect(corrected.map((c) => c.name)).toEqual(['Peanut butter']);
  });

  it('is idempotent — a corrected item passes the check it was corrected by', () => {
    const once = reconcileEnergy([
      item({ name: 'Creamy pasta', kcal: 300, protein_g: 12, carbs_g: 40, fat_g: 25 }),
    ]);
    const twice = reconcileEnergy(once.items);

    expect(twice.corrected).toEqual([]);
    expect(twice.items[0]!.kcal).toBe(once.items[0]!.kcal);
  });
});

describe('energyCeiling', () => {
  it('is 9.1 kcal for every gram of the food, because nothing is denser than fat', () => {
    expect(energyCeiling(item({ quantity_g: 100 }))).toBeCloseTo(910, 5);
  });

  it('does not exist for an item nobody weighed', () => {
    expect(energyCeiling(item())).toBe(Infinity);
    expect(energyCeiling(item({ quantity_g: null }))).toBe(Infinity);
    expect(energyCeiling(item({ quantity_g: 0 }))).toBe(Infinity);
  });

  it('sits above the floor for anything whose macros fit inside it', () => {
    // The guarantee the ordering in `reconcileEnergy` rests on: once the macros
    // weigh no more than the food, the floor cannot climb past the ceiling.
    const pureFat = item({ quantity_g: 100, fat_g: 100 });
    expect(energyFloor(pureFat)).toBeLessThanOrEqual(energyCeiling(pureFat));
  });
});

describe('macroMass', () => {
  it('is what the macros weigh, with fiber left inside the carbohydrate', () => {
    expect(macroMass(item({ protein_g: 10, carbs_g: 20, fat_g: 5, fiber_g: 4 }))).toBe(35);
  });
});

/**
 * The mass check, which is the only one that touches a macro figure, and the
 * ceiling, which is the only one that lowers a calorie figure.
 *
 * Both act on the direction the app is actually wrong in. The floor above can
 * only ever raise a number, and the measured error is a 1.36x overestimate of
 * weight, so a log with nothing but a floor in it is guarded on the side the
 * mistakes are not on.
 */
describe('reconcileEnergy — the upper bounds', () => {
  it('scales macros that outweigh their own food', () => {
    // Beer sticks, from the production log: 70g of food carrying 73g of macros.
    const { items, corrected } = reconcileEnergy([
      item({ name: 'Beer sticks', quantity_g: 70, kcal: 280, protein_g: 10, carbs_g: 55, fat_g: 8 }),
    ]);

    const out = items[0]!;
    expect(macroMass(out)).toBeCloseTo(70, 1);
    // Scaled, not flattened: the ratios between them are the part the model is
    // good at, and only their total was impossible.
    expect(out.protein_g / out.carbs_g).toBeCloseTo(10 / 55, 2);
    expect(corrected[0]!.reasons).toEqual(['mass']);
  });

  it('brings fiber down with the carbohydrate it sits inside', () => {
    const { items } = reconcileEnergy([
      item({ name: 'Bran', quantity_g: 50, kcal: 180, protein_g: 10, carbs_g: 60, fat_g: 10, fiber_g: 30 }),
    ]);

    const out = items[0]!;
    // Left where it was, it would have exceeded the carbohydrate holding it and
    // `energyFloor` would have discarded it — silently re-pricing 30g of fiber
    // from 2 kcal back up to 4.
    expect(out.fiber_g!).toBeLessThanOrEqual(out.carbs_g);
  });

  it('brings saturated fat and sugar down with the macro they sit inside', () => {
    const { items } = reconcileEnergy([
      item({
        name: 'Muddle',
        quantity_g: 60,
        kcal: 400,
        protein_g: 30,
        carbs_g: 30,
        fat_g: 30,
        sat_fat_g: 20,
        sugar_g: 25,
      }),
    ]);

    const out = items[0]!;
    // Nothing reads these for energy, but an item claiming more saturated fat
    // than fat is not a thing to write down.
    expect(out.sat_fat_g!).toBeLessThanOrEqual(out.fat_g);
    expect(out.sugar_g!).toBeLessThanOrEqual(out.carbs_g);
  });

  it('caps calories at what that weight of food can carry', () => {
    // A decimal point in the wrong place: 40g of nuts is not 2,600 kcal.
    const { items, corrected } = reconcileEnergy([
      item({ name: 'Walnuts', quantity_g: 40, kcal: 2600, protein_g: 6, carbs_g: 3, fat_g: 26 }),
    ]);

    expect(items[0]!.kcal).toBeCloseTo(364, 1);
    expect(corrected[0]!.reasons).toEqual(['ceiling']);
  });

  it('leaves the densest real food alone', () => {
    // Olive oil is 884 kcal per 100g against a ceiling of 910. Nothing edible
    // gets closer, so nothing edible trips this.
    const { corrected } = reconcileEnergy([
      item({ name: 'Olive oil', quantity_g: 100, kcal: 884, protein_g: 0, carbs_g: 0, fat_g: 100 }),
    ]);
    expect(corrected).toEqual([]);
  });

  it('never caps an item nobody weighed', () => {
    const { corrected } = reconcileEnergy([
      item({ name: 'A slice of cake', quantity_g: null, kcal: 900, protein_g: 5, carbs_g: 60, fat_g: 40 }),
    ]);
    expect(corrected).toEqual([]);
  });

  it('fixes the macros first, so a floor never fires off numbers already known to be wrong', () => {
    // Impossible twice over: 60g of food holding 90g of macros, priced at 100
    // kcal against a floor those macros would have put at 510.
    const { items, corrected } = reconcileEnergy([
      item({ name: 'Muddle', quantity_g: 60, kcal: 100, protein_g: 30, carbs_g: 30, fat_g: 30 }),
    ]);

    const out = items[0]!;
    expect(macroMass(out)).toBeCloseTo(60, 1);
    expect(corrected[0]!.reasons).toEqual(['mass', 'floor']);
    // Raised to the floor of the *corrected* macros — 20g of each, so 340 —
    // and not to the 510 the macros that could not have been true would have
    // demanded. Fixing the mass first is what keeps the floor honest.
    expect(out.kcal).toBeCloseTo(340, 0);
  });

  it('is idempotent across all three bounds', () => {
    const once = reconcileEnergy([
      item({ name: 'Muddle', quantity_g: 60, kcal: 100, protein_g: 30, carbs_g: 30, fat_g: 30 }),
      item({ name: 'Walnuts', quantity_g: 40, kcal: 2600, protein_g: 6, carbs_g: 3, fat_g: 26 }),
    ]);
    const twice = reconcileEnergy(once.items);

    expect(twice.corrected).toEqual([]);
    expect(twice.items.map((i) => i.kcal)).toEqual(once.items.map((i) => i.kcal));
  });
});
